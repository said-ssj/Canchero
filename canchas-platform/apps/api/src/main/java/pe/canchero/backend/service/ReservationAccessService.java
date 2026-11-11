package pe.canchero.backend.service;

import java.time.*;
import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class ReservationAccessService {
    public record Scan(String token,UUID requestId) {}
    public record Result(UUID movimientoId,int reservaId,String cancha,String sede,int usados,int maximo,boolean repetido) {}
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    private final Clock clock;
    @org.springframework.beans.factory.annotation.Autowired
    public ReservationAccessService(JdbcTemplate jdbc,PlatformTransactionManager manager){this(jdbc,manager,Clock.systemUTC());}
    public ReservationAccessService(JdbcTemplate jdbc,PlatformTransactionManager manager,Clock clock){this.jdbc=jdbc;this.tx=new TransactionTemplate(manager);this.clock=clock;}
    public Result scan(Scan scan,AuthUserDto user){
        if(user==null)throw error(HttpStatus.UNAUTHORIZED,"Inicia sesion como personal");
        if(scan==null || scan.requestId()==null || scan.token()==null || !scan.token().matches("CAN1_[A-Za-z0-9_-]{43}"))throw error(HttpStatus.BAD_REQUEST,"Codigo de acceso invalido");
        return tx.execute(status->{
            var info=jdbc.queryForList("select x.id_reserva,x.id from reserva_acceso a join mp_checkout x on x.id=a.id where a.token_hash=?",PaymentCrypto.hash(scan.token()));
            if(info.isEmpty())throw error(HttpStatus.NOT_FOUND,"Pase no valido");
            int reservation=((Number)info.getFirst().get("id_reserva")).intValue();UUID access=(UUID)info.getFirst().get("id");
            jdbc.queryForList("select id_reserva from reserva where id_reserva=? for update",reservation);
            var x=jdbc.queryForMap("""
                select a.*,x.estado as pago_estado,r.estado as reserva_estado,er.nombre as reserva_estado_nombre,
                 r.fecha_reserva,r.hora_inicio,r.hora_fin,c.nombre_numero as cancha,s.nombre as sede,s.id_sede
                from reserva_acceso a join mp_checkout x on x.id=a.id join reserva r on r.id_reserva=x.id_reserva
                join estado_reserva er on er.id_estado_reserva=r.id_estado_reserva
                join cancha c on c.id_cancha=r.id_cancha join sede s on s.id_sede=c.id_sede where a.id=? for update of a
                """,access);
            new TenantPermissions(jdbc).require(user,((Number)x.get("id_sede")).intValue(),"pase.verificar");
            var previous=jdbc.queryForList("select id from registro_ingreso where id_acceso=? and id_peticion=? and tipo='ingreso'",UUID.class,access,scan.requestId());
            if(!previous.isEmpty())return result(previous.getFirst(),reservation,x,true);
            if(!"activo".equals(x.get("estado")) || !"aprobado".equals(x.get("pago_estado")) || !"A".equals(x.get("reserva_estado")) || !x.get("reserva_estado_nombre").toString().toLowerCase(Locale.ROOT).contains("confirm"))
                throw error(HttpStatus.CONFLICT,"El pase no tiene una reserva confirmada con pago aprobado");
            LocalDate date=((java.sql.Date)x.get("fecha_reserva")).toLocalDate();
            LocalTime start=((java.sql.Time)x.get("hora_inicio")).toLocalTime(),end=((java.sql.Time)x.get("hora_fin")).toLocalTime();
            Instant from=date.atTime(start).atZone(ZoneId.of("America/Lima")).toInstant().minusSeconds(900);
            Instant until=(end.equals(LocalTime.MIDNIGHT)?date.plusDays(1).atStartOfDay():date.atTime(end)).atZone(ZoneId.of("America/Lima")).toInstant();
            if(Instant.now(clock).isBefore(from) || !Instant.now(clock).isBefore(until))throw error(HttpStatus.CONFLICT,"El pase esta fuera de su horario de ingreso");
            int used=((Number)x.get("ingresos_utilizados")).intValue(),max=((Number)x.get("max_ingresos")).intValue();
            if(used>=max)throw error(HttpStatus.CONFLICT,"El pase ya consumio todos sus cupos");
            UUID movement=UUID.randomUUID();
            jdbc.update("update reserva_acceso set ingresos_utilizados=ingresos_utilizados+1 where id=? and ingresos_utilizados<max_ingresos",access);
            jdbc.update("insert into registro_ingreso(id,id_acceso,id_empleado,id_sede,id_peticion,tipo) values(?,?,?,?,?,'ingreso')",movement,access,UUID.fromString(user.id()),x.get("id_sede"),scan.requestId());
            x.put("ingresos_utilizados",used+1);return result(movement,reservation,x,false);
        });
    }
    public void reverse(UUID movement,String reason,AuthUserDto user){
        if(reason==null || reason.trim().length()<5 || reason.length()>300)throw error(HttpStatus.BAD_REQUEST,"Indica un motivo de 5 a 300 caracteres");
        tx.executeWithoutResult(status->{
            var found=jdbc.queryForList("select * from registro_ingreso where id=? and tipo='ingreso'",movement);
            if(found.isEmpty())throw error(HttpStatus.NOT_FOUND,"Ingreso no encontrado");
            var event=found.getFirst();new TenantPermissions(jdbc).require(user,((Number)event.get("id_sede")).intValue(),"pase.revertir");
            jdbc.queryForList("select id from reserva_acceso where id=? for update",event.get("id_acceso"));
            if(jdbc.queryForObject("select count(*) from registro_ingreso where revierte_id=?",Integer.class,movement)>0)return;
            jdbc.update("insert into registro_ingreso(id,id_acceso,id_empleado,id_sede,id_peticion,revierte_id,tipo,motivo) values(?,?,?,?,?,?,'reversion',?)",UUID.randomUUID(),event.get("id_acceso"),UUID.fromString(user.id()),event.get("id_sede"),UUID.randomUUID(),movement,reason.trim());
            jdbc.update("update reserva_acceso set ingresos_utilizados=ingresos_utilizados-1 where id=? and ingresos_utilizados>0",event.get("id_acceso"));
        });
    }
    private static Result result(UUID movement,int reservation,Map<String,Object>x,boolean replay){return new Result(movement,reservation,x.get("cancha").toString(),x.get("sede").toString(),((Number)x.get("ingresos_utilizados")).intValue(),((Number)x.get("max_ingresos")).intValue(),replay);}
    private static ResponseStatusException error(HttpStatus status,String text){return new ResponseStatusException(status,text);}
}
