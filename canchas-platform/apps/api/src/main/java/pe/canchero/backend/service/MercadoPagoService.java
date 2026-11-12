package pe.canchero.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.net.URI;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.*;

/** Reserva pendiente durable; HTTP del proveedor fuera de transacciones y bloqueos de BD. */
@Service
public class MercadoPagoService {
    public record StartRequest(String courtId,String fecha,List<Integer> hours,int cupos,String idempotencyKey) {}
    public record StartResponse(UUID id,String checkoutUrl,String expiresAt,boolean testMode) {}
    public record State(UUID id,int reservaId,String estado,BigDecimal monto,String cancha,String sede,
                        String fecha,String horario,int cupos,int ingresosUtilizados,String passToken,String expiresAt,
                        String courtId,List<Integer> hours,String paymentStatus,boolean canResume,
                        String direccion,String codigoReserva,String estadoPase,String publicPassUrl,boolean testMode) {}
    private final JdbcTemplate jdbc;
    private final BookingService bookings;
    private final MercadoPagoClient mp;
    private final MercadoPagoSettings settings;
    private final TransactionTemplate tx;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    public MercadoPagoService(JdbcTemplate jdbc,BookingService bookings,MercadoPagoClient mp,MercadoPagoSettings settings,PlatformTransactionManager manager) {
        this(jdbc,bookings,mp,settings,manager,Clock.systemUTC());
    }
    public MercadoPagoService(JdbcTemplate jdbc,BookingService bookings,MercadoPagoClient mp,MercadoPagoSettings settings,PlatformTransactionManager manager,
            Clock clock) {
        this.jdbc=jdbc;this.bookings=bookings;this.mp=mp;this.settings=settings;this.tx=new TransactionTemplate(manager);this.clock=clock==null?Clock.systemUTC():clock;
    }
    public boolean available() { return settings.configured() && schemaReady(); }
    private boolean schemaReady() {return Boolean.TRUE.equals(jdbc.queryForObject("select to_regclass('public.mp_checkout') is not null",Boolean.class));}
    private void requireReady(){if(!available())throw error(HttpStatus.SERVICE_UNAVAILABLE,"El pago de prueba aun requiere configuracion. No se ha confirmado ni cobrado una reserva.");}

    public StartResponse start(StartRequest request,AuthUserDto user) {
        requireReady();
        if(user==null)throw error(HttpStatus.UNAUTHORIZED,"Inicia sesion");
        if(request==null || request.idempotencyKey()==null || !request.idempotencyKey().matches("[A-Za-z0-9_-]{8,100}")
                || request.cupos()<1 || request.cupos()>100 || request.hours()==null || request.hours().isEmpty())
            throw error(HttpStatus.BAD_REQUEST,"Selecciona horario, cupos y una clave de operacion valida");
        int court;try {court=Integer.parseInt(request.courtId());}catch(RuntimeException e){throw error(HttpStatus.BAD_REQUEST,"Cancha invalida");}
        var hours=request.hours().stream().filter(Objects::nonNull).sorted().toList();
        String fingerprint=PaymentCrypto.hash(court+"|"+request.fecha()+"|"+hours+"|"+request.cupos());
        UUID userId=UUID.fromString(user.id());
        expire();
        UUID checkout=tx.execute(status->{
            // Dos pestañas o un retorno del proveedor pueden traer otra clave para el mismo bloque.
            // Serializar por cuenta y selección evita crear retenciones duplicadas.
            jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))",user.id()+":selection:"+fingerprint);
            jdbc.queryForList("select pg_advisory_xact_lock(hashtextextended(?,0))",user.id()+":"+request.idempotencyKey());
            var existing=jdbc.queryForList("select id,payload_hash,estado from mp_checkout where id_usuario=? and clave_idempotencia=?",userId,request.idempotencyKey());
            if(!existing.isEmpty()){
                var row=existing.getFirst();
                if(!fingerprint.equals(row.get("payload_hash")))throw error(HttpStatus.CONFLICT,"La operacion ya se utilizo con otros datos");
                if(!"pendiente".equals(row.get("estado")))throw error(HttpStatus.CONFLICT,"Esta operacion ya termino; consulta su resultado");
                return (UUID)row.get("id");
            }
            var retained=jdbc.queryForList("""
                select x.id from mp_checkout x join reserva r on r.id_reserva=x.id_reserva
                join estado_reserva er on er.id_estado_reserva=r.id_estado_reserva
                where x.id_usuario=? and x.payload_hash=? and x.estado='pendiente'
                  and x.vence_en>? and r.estado='A' and lower(er.nombre) like 'pend%'
                order by x.creado_en desc limit 1 for update of x
                """,UUID.class,userId,fingerprint,OffsetDateTime.now(clock));
            if(!retained.isEmpty())return retained.getFirst();
            var capacities=jdbc.queryForList("select capacidad_acceso from cancha where id_cancha=? and estado='A'",Integer.class,court);
            if(capacities.isEmpty() || capacities.getFirst()==null)throw error(HttpStatus.CONFLICT,"El administrador debe configurar la capacidad de acceso de esta cancha");
            if(request.cupos()>capacities.getFirst())throw error(HttpStatus.BAD_REQUEST,"La cantidad de participantes supera la capacidad de la cancha");
            BookingRequest pending=new BookingRequest(null,null,null,request.courtId(),user.id(),request.fecha(),null,0,"Mercado Pago",List.of(),hours,null);
            var booking=bookings.createPendingPayment(pending,user);
            UUID id=UUID.randomUUID();
            jdbc.update("""
                insert into mp_checkout(id,id_reserva,id_usuario,clave_idempotencia,payload_hash,monto,cupos,collector_id,vence_en)
                values(?,?,?,?,?,?,?,?,?)
                """,id,Integer.parseInt(booking.id()),userId,request.idempotencyKey(),fingerprint,BigDecimal.valueOf(booking.total()),request.cupos(),settings.collectorId(),OffsetDateTime.now(clock).plusMinutes(10));
            return id;
        });
        var data=row(checkout,false);
        String url=(String)data.get("checkout_url");
        if(url==null){
            String returnUrl=settings.publicUrl().replaceAll("/$","")+"/pago/resultado?checkout="+checkout;
            var expires=((java.sql.Timestamp)data.get("vence_en")).toInstant();
            Map<String,Object> payload=new LinkedHashMap<>();
            payload.put("items",List.of(Map.of("id",checkout.toString(),"title","Reserva Canchero","quantity",1,"currency_id","PEN","unit_price",data.get("monto"))));
            payload.put("external_reference",checkout.toString());
            payload.put("back_urls",Map.of("success",returnUrl,"pending",returnUrl,"failure",returnUrl));
            payload.put("auto_return","approved");payload.put("notification_url",settings.webhookUrl());
            payload.put("expires",true);payload.put("expiration_date_from",Instant.now(clock).toString());payload.put("expiration_date_to",expires.toString());
            // Sin medios diferidos: no dejar una cancha retenida por un pago en efectivo dias despues.
            payload.put("payment_methods",Map.of("excluded_payment_types",List.of(Map.of("id","ticket"),Map.of("id","atm"))));
            var preference=mp.preference(payload);
            String candidate=preference.path("init_point").asText();
            if(!trustedCheckoutUrl(candidate) || preference.path("id").asText().isBlank())throw error(HttpStatus.BAD_GATEWAY,"Mercado Pago no devolvio un enlace valido");
            if(!settings.collectorId().equals(preference.path("collector_id").asText()))throw error(HttpStatus.BAD_GATEWAY,"El receptor del checkout no coincide con el vendedor de prueba");
            // Reintentos concurrentes reutilizan el primer enlace guardado. Referencias iguales nunca generan dos reservas.
            jdbc.update("update mp_checkout set preference_id=?,checkout_url=? where id=? and preference_id is null and estado='pendiente'",preference.path("id").asText(),candidate,checkout);
            data=row(checkout,false);url=(String)data.get("checkout_url");
        }
        if(url==null || !"pendiente".equals(data.get("estado")))throw error(HttpStatus.CONFLICT,"La reserva temporal ya finalizo");
        return new StartResponse(checkout,url,((java.sql.Timestamp)data.get("vence_en")).toInstant().toString(),true);
    }
    public State forBooking(int reservationId, AuthUserDto user) {
        requireReady();
        var ids=jdbc.queryForList("select id from mp_checkout where id_reserva=? and id_usuario=?",UUID.class,reservationId,UUID.fromString(user.id()));
        if(ids.isEmpty())throw error(HttpStatus.NOT_FOUND,"No se encontro la operacion de tu reserva");
        return state(ids.getFirst(),user);
    }
    static boolean trustedCheckoutUrl(String url){
        try {var u=URI.create(url);return "https".equals(u.getScheme()) && Set.of("www.mercadopago.com.pe","www.mercadopago.com","mercadopago.com.pe").contains(u.getHost()) && u.getUserInfo()==null;}
        catch(RuntimeException ex){return false;}
    }
    Map<String,Object> row(UUID id,boolean lock){
        var rows=jdbc.queryForList("select * from mp_checkout where id=?"+(lock?" for update":""),id);
        if(rows.isEmpty())throw error(HttpStatus.NOT_FOUND,"Operacion no encontrada");return rows.getFirst();
    }
    private void requireOwner(UUID id,AuthUserDto user){
        if(user==null || !UUID.fromString(user.id()).equals(row(id,false).get("id_usuario")))throw error(HttpStatus.FORBIDDEN,"Esta operacion pertenece a otra cuenta");
    }
    public State state(UUID id,AuthUserDto user){
        requireReady();requireOwner(id,user);expire();
        var x=jdbc.queryForMap("""
            select x.*,c.id_cancha,c.nombre_numero as cancha,s.nombre as sede,s.direccion,r.codigo_pase,r.fecha_reserva,r.hora_inicio,r.hora_fin,r.estado as reserva_estado,
            (select p.estado from mp_pago p where p.id_checkout=x.id order by p.actualizado_en desc,p.payment_id desc limit 1) as payment_status,
            exists(select 1 from mp_pago p where p.id_checkout=x.id and p.estado not in ('rejected','cancelled')) as payment_in_progress,
            er.nombre as reserva_estado_nombre,coalesce(a.ingresos_utilizados,0) as usados,a.estado as acceso_estado
            from mp_checkout x join reserva r on r.id_reserva=x.id_reserva join cancha c on c.id_cancha=r.id_cancha
            join sede s on s.id_sede=c.id_sede join estado_reserva er on er.id_estado_reserva=r.id_estado_reserva
            left join reserva_acceso a on a.id=x.id where x.id=?
            """,id);
        boolean pass="aprobado".equals(x.get("estado")) && "A".equals(x.get("reserva_estado")) && "activo".equals(x.get("acceso_estado")) && x.get("reserva_estado_nombre").toString().toLowerCase(Locale.ROOT).contains("confirm");
        int start=((java.sql.Time)x.get("hora_inicio")).toLocalTime().getHour();
        int end=((java.sql.Time)x.get("hora_fin")).toLocalTime().getHour();
        if(end==0)end=24;
        LocalDate date=((java.sql.Date)x.get("fecha_reserva")).toLocalDate();
        LocalTime finish=((java.sql.Time)x.get("hora_fin")).toLocalTime();
        Instant accessUntil=(finish.equals(LocalTime.MIDNIGHT)?date.plusDays(1).atStartOfDay():date.atTime(finish)).atZone(ZoneId.of("America/Lima")).toInstant();
        String passState=pass?"activo":"no_disponible";
        if("revocado".equals(x.get("acceso_estado")) || (x.get("acceso_estado")!=null && (!"A".equals(x.get("reserva_estado")) || x.get("reserva_estado_nombre").toString().toLowerCase(Locale.ROOT).contains("cancel"))))passState="revocado";
        if(pass && ((Number)x.get("usados")).intValue()>=((Number)x.get("cupos")).intValue())passState="agotado";
        if(pass && !Instant.now(clock).isBefore(accessUntil))passState="vencido";
        pass=pass && "activo".equals(passState);
        boolean resumable="pendiente".equals(x.get("estado")) && "A".equals(x.get("reserva_estado"))
                && x.get("reserva_estado_nombre").toString().toLowerCase(Locale.ROOT).startsWith("pend")
                && !Boolean.TRUE.equals(x.get("payment_in_progress"))
                && ((java.sql.Timestamp)x.get("vence_en")).toInstant().isAfter(Instant.now(clock));
        String token=pass?PaymentCrypto.pass(settings.passSecret(),id):null;
        String accessUrl=pass?settings.publicUrl().replaceAll("/$","")+"/accesos#"+token:null;
        String time=((java.sql.Time)x.get("hora_inicio")).toLocalTime().format(java.time.format.DateTimeFormatter.ofPattern("HH:mm"))+" - "+(end==24?"24:00":finish.format(java.time.format.DateTimeFormatter.ofPattern("HH:mm")));
        return new State(id,((Number)x.get("id_reserva")).intValue(),x.get("estado").toString(),(BigDecimal)x.get("monto"),x.get("cancha").toString(),x.get("sede").toString(),x.get("fecha_reserva").toString(),time,((Number)x.get("cupos")).intValue(),((Number)x.get("usados")).intValue(),token,((java.sql.Timestamp)x.get("vence_en")).toInstant().toString(),x.get("id_cancha").toString(),java.util.stream.IntStream.range(start,end).boxed().toList(),(String)x.get("payment_status"),resumable,(String)x.get("direccion"),(String)x.get("codigo_pase"),passState,accessUrl,true);
    }
    public State refresh(UUID id,String paymentId,AuthUserDto user){
        requireReady();requireOwner(id,user);
        var payment=mp.payment(paymentId);
        if(!id.toString().equals(payment.path("external_reference").asText()))throw error(HttpStatus.FORBIDDEN,"El pago no corresponde a esta operacion");
        reconcile(paymentId,payment);return state(id,user);
    }
    public void notify(String id){requireReady();reconcile(id,mp.payment(id));}

    void reconcile(String paymentId,JsonNode p){
        if(!paymentId.equals(p.path("id").asText()) || !settings.collectorId().equals(p.path("collector_id").asText())
                || p.path("live_mode").asBoolean(true) || !"PEN".equals(p.path("currency_id").asText()))
            throw error(HttpStatus.CONFLICT,"El pago no corresponde al vendedor, moneda o entorno de prueba");
        UUID id;try{id=UUID.fromString(p.path("external_reference").asText());}catch(RuntimeException ex){throw error(HttpStatus.BAD_REQUEST,"Referencia invalida");}
        // Validar la identidad del pago ANTES de cualquier mutacion.
        tx.executeWithoutResult(status->{
            var initial=row(id,false);
            int booking=((Number)initial.get("id_reserva")).intValue();
            jdbc.queryForList("select id_reserva from reserva where id_reserva=? for update",booking);
            var x=row(id,true);
            BigDecimal amount=p.path("transaction_amount").decimalValue();
            if(amount.compareTo((BigDecimal)x.get("monto"))!=0)throw error(HttpStatus.CONFLICT,"El importe del pago no coincide");
            var other=jdbc.queryForList("select id_checkout from mp_pago where payment_id=?",UUID.class,paymentId);
            if(!other.isEmpty() && !other.getFirst().equals(id))throw error(HttpStatus.CONFLICT,"Pago ya asociado");
            String providerStatus=p.path("status").asText();
            jdbc.update("""
                insert into mp_pago(payment_id,id_checkout,estado,monto) values(?,?,?,?)
                on conflict(payment_id) do update set estado=excluded.estado,actualizado_en=now()
                """,paymentId,id,providerStatus,amount);
            if(Set.of("refunded","charged_back").contains(providerStatus) || p.path("transaction_amount_refunded").decimalValue().signum()>0){
                String local="charged_back".equals(providerStatus)?"contracargo":"reembolsado";
                jdbc.update("update mp_checkout set estado=?,actualizado_en=now() where id=?",local,id);
                jdbc.update("update reserva set estado='I',usmod='MERCADOPAGO',fecmod=now() where id_reserva=?",booking);
                jdbc.update("update reserva_acceso set estado='revocado' where id=?",id);
                jdbc.update("update pago_reserva set estado_liquidacion=? where numero_operacion=?",local,"MP:"+paymentId);return;
            }
            if(!"approved".equals(providerStatus))return; // pendiente/rechazo permite reintentar durante la retencion.
            boolean applied=jdbc.queryForObject("select count(*) from pago_reserva where id_reserva=? and numero_operacion=?",Integer.class,booking,"MP:"+paymentId)>0;
            if(applied)return;
            boolean expired=!((java.sql.Timestamp)x.get("vence_en")).toInstant().isAfter(Instant.now(clock));
            String reservaEstado=jdbc.queryForObject("select r.estado || ':' || er.nombre from reserva r join estado_reserva er on er.id_estado_reserva=r.id_estado_reserva where r.id_reserva=?",String.class,booking);
            if(!"pendiente".equals(x.get("estado")) || expired || reservaEstado==null || !reservaEstado.toLowerCase(Locale.ROOT).startsWith("a:pend")){
                jdbc.update("update mp_checkout set estado='revision',actualizado_en=now() where id=?",id);
                // Nunca resucitar una retencion ni ocupar un horario vendido a otro jugador.
                if(expired)jdbc.update("update reserva set estado='I' where id_reserva=? and adelanto=0",booking);
                jdbc.update("update reserva_acceso set estado='revocado' where id=?",id);return;
            }
            bookings.applyVerifiedMercadoPago(booking,amount,paymentId);
            jdbc.update("update mp_checkout set estado='aprobado',actualizado_en=now() where id=?",id);
            jdbc.update("insert into reserva_acceso(id,token_hash,max_ingresos) values(?,?,?)",id,PaymentCrypto.hash(PaymentCrypto.pass(settings.passSecret(),id)),x.get("cupos"));
        });
    }
    @Scheduled(fixedDelay=30000,initialDelay=30000)
    public void expire(){
        if(!settings.enabled() || !schemaReady())return;
        var ids=jdbc.queryForList("select id from mp_checkout where estado='pendiente' and vence_en<=? order by vence_en limit 100",UUID.class,OffsetDateTime.now(clock));
        for(UUID id:ids)tx.executeWithoutResult(status->{
            var x=row(id,false);int booking=((Number)x.get("id_reserva")).intValue();
            jdbc.queryForList("select id_reserva from reserva where id_reserva=? for update",booking);x=row(id,true);
            if("pendiente".equals(x.get("estado")) && !((java.sql.Timestamp)x.get("vence_en")).toInstant().isAfter(Instant.now(clock))){
                jdbc.update("update reserva set estado='I',usmod='RETENCION_VENCIDA',fecmod=now() where id_reserva=? and adelanto=0",booking);
                jdbc.update("update mp_checkout set estado='expirado',actualizado_en=now() where id=?",id);
            }
        });
    }
    private static ResponseStatusException error(HttpStatus status,String message){return new ResponseStatusException(status,message);}
}
