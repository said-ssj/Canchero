package pe.canchero.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.UUID;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

/** Outbox persistente: se procesa después del commit, con reintentos y clave idempotente. */
@Service
public class BookingMailService {
    private final JdbcTemplate jdbc;
    private final MailService mail;
    private final boolean enabled;
    private final ObjectMapper json;
    private long schemaCheckedAt;
    private boolean schemaReady;
    public BookingMailService(JdbcTemplate jdbc, MailService mail, ObjectMapper json,
            @Value("${BOOKING_EMAILS_ENABLED:false}") boolean enabled) {
        this.jdbc=jdbc; this.mail=mail; this.enabled=enabled; this.json=json;
    }
    public boolean available() { return enabled && mail.resendConfigured() && schemaReady(); }
    private synchronized boolean schemaReady() {
        if (System.currentTimeMillis()-schemaCheckedAt > 60000) {
            schemaReady=Boolean.TRUE.equals(jdbc.queryForObject("""
                select to_regclass('public.reserva_correo_outbox') is not null
                    and to_regclass('public.preferencias_notificacion') is not null
                """,Boolean.class));
            schemaCheckedAt=System.currentTimeMillis();
        }
        return schemaReady;
    }
    @Scheduled(fixedDelayString="${BOOKING_EMAIL_POLL_MS:60000}", initialDelay=30000)
    public void process() {
        if (!enabled || !mail.resendConfigured()) return;
        try {
            if (!schemaReady()) return;
            enqueueReminders();
            for (int i=0;i<10;i++) {
                List<UUID> claimed=jdbc.query("""
                    update public.reserva_correo_outbox set estado='procesando',intentos=intentos+1,
                        proximo_intento=now()+interval '5 minutes'
                    where id = (
                        select id from public.reserva_correo_outbox
                        where estado in ('pendiente','procesando') and proximo_intento<=now() and intentos<5
                        order by creado_en for update skip locked limit 1
                    ) returning id
                    """,(rs,n) -> rs.getObject(1,UUID.class));
                if (claimed.isEmpty()) break;
                deliver(claimed.getFirst());
            }
            jdbc.update("update public.reserva_correo_outbox set estado='fallido' where estado='procesando' and proximo_intento<=now() and intentos>=5");
        } catch (RuntimeException ex) {
            LoggerFactory.getLogger(getClass()).warn("No se pudo procesar la cola de correos ({})",ex.getClass().getSimpleName());
        }
    }
    private void enqueueReminders() {
        jdbc.update("""
            insert into public.reserva_correo_outbox(id_reserva,id_usuario,evento,revision,datos)
            select r.id_reserva,coalesce(r.id_usuario,cl.id_usuario),'recordatorio',
                r.fecha_reserva::text || 'T' || r.hora_inicio::text,public.reserva_correo_datos(r.id_reserva)
            from public.reserva r join public.estado_reserva er on er.id_estado_reserva=r.id_estado_reserva
            left join public.cliente cl on cl.id_cliente=r.id_cliente
            left join public.preferencias_notificacion p on p.id_usuario=coalesce(r.id_usuario,cl.id_usuario)
            where r.estado='A' and coalesce(r.id_usuario,cl.id_usuario) is not null
                and (lower(er.nombre) like '%confirm%' or lower(er.nombre) like '%aprob%')
                and coalesce(p.correo_reservas,true) and coalesce(p.recordatorios,true)
                and (r.fecha_reserva+r.hora_inicio) at time zone 'America/Lima'
                    between now()+interval '15 minutes' and now()+interval '2 hours'
            on conflict(id_reserva,evento,revision) do nothing
            """);
    }
    record Delivery(String email,String event,String snapshot,String current,boolean allowed,boolean fresh) {}
    void deliver(UUID id) {
        var rows=jdbc.query("""
            select u.correo,q.evento,q.datos::text,public.reserva_correo_datos(r.id_reserva)::text,
                (coalesce(p.correo_reservas,true) and (q.evento<>'recordatorio' or coalesce(p.recordatorios,true))
                    and u.estado='A' and r.estado='A') as permitido,
                (q.creado_en>now()-interval '24 hours' and (q.evento<>'recordatorio'
                    or (r.fecha_reserva+r.hora_inicio) at time zone 'America/Lima'>now())) as reciente
            from public.reserva_correo_outbox q join public.reserva r on r.id_reserva=q.id_reserva
            join public.usuario u on u.id_usuario=q.id_usuario
            left join public.preferencias_notificacion p on p.id_usuario=q.id_usuario
            where q.id=? and q.estado='procesando'
            """,(rs,n) -> new Delivery(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getBoolean(5),rs.getBoolean(6)),id);
        if (rows.isEmpty()) return;
        Delivery d=rows.getFirst();
        try {
            JsonNode snapshot=json.readTree(d.snapshot()), current=json.readTree(d.current());
            if (!d.allowed() || !d.fresh() || d.email()==null || d.email().isBlank()
                    || !stillRelevant(d.event(),snapshot,current)) {
                jdbc.update("update public.reserva_correo_outbox set estado='omitido' where id=?",id);
                return;
            }
            String subject=switch(d.event()) {
                case "cancelada" -> "Tu reserva fue cancelada";
                case "reprogramada" -> "Tu reserva cambió de horario";
                case "recordatorio" -> "Tu partido se acerca";
                case "confirmada" -> "Tu reserva está confirmada";
                default -> "Registramos tu reserva";
            };
            String text=subject+" en Canchero.\n\n"+snapshot.path("sede").asText()+" · "+snapshot.path("cancha").asText()
                    +"\nFecha: "+snapshot.path("fecha").asText()+"\nHorario: "+snapshot.path("inicio").asText()+" - "+snapshot.path("fin").asText()
                    +"\n\nRevisa los detalles en "+mail.itineraryUrl()
                    +(d.event().equals("cancelada") ? "\nLa cancelación no implica una devolución automática. Consulta las condiciones de tu reserva." : "")
                    +"\n\nPuedes gestionar estos avisos en Perfil > Notificaciones.";
            mail.sendResend(d.email(),subject+" · Canchero",text,"booking-"+id);
            jdbc.update("update public.reserva_correo_outbox set estado='enviado',enviado_en=now() where id=?",id);
        } catch (Exception ex) {
            jdbc.update("update public.reserva_correo_outbox set estado=case when intentos>=5 then 'fallido' else 'pendiente' end where id=?",id);
            LoggerFactory.getLogger(getClass()).warn("Correo de reserva pendiente de reintento ({})",ex.getClass().getSimpleName());
        }
    }
    static boolean stillRelevant(String event,JsonNode saved,JsonNode current) {
        String state=current.path("estado").asText();
        if (event.equals("cancelada")) return state.contains("cancel");
        if (state.contains("cancel") || state.contains("complet") || state.contains("final")) return false;
        if (!saved.path("fecha").equals(current.path("fecha")) || !saved.path("inicio").equals(current.path("inicio"))
                || !saved.path("fin").equals(current.path("fin"))) return false;
        return !(event.equals("confirmada") || event.equals("recordatorio")) || state.contains("confirm") || state.contains("aprob");
    }
}
