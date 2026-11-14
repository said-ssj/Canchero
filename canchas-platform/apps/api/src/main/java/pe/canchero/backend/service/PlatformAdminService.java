package pe.canchero.backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import pe.canchero.backend.web.dto.AuthUserDto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

@Service
public class PlatformAdminService extends JdbcSupport {
    public record RevenueSummary(LocalDate from, LocalDate to, long paymentCount,
            BigDecimal grossProcessed, BigDecimal commissionBeforeRefunds,
            BigDecimal registeredRefunds, BigDecimal estimatedNetCommission) {}
    public record AuditEvent(long id, String actorUserId, String actorName, String actorRole,
            String method, String path, int status, OffsetDateTime occurredAt) {}

    public PlatformAdminService(JdbcTemplate jdbc) { super(jdbc); }

    public RevenueSummary revenue(LocalDate from, LocalDate to, AuthUserDto actor) {
        requireSuperadmin(actor);
        LocalDate end = to == null ? LocalDate.now(LIMA_ZONE) : to;
        LocalDate start = from == null ? end.minusDays(29) : from;
        if (start.isAfter(end) || start.isBefore(end.minusYears(3))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El rango debe ser válido y no superar 3 años");
        }
        return jdbc.queryForObject("""
                with refunds as (
                  select id_reserva, sum(monto) amount from public.devolucion_pago_reserva
                  where estado='REGISTRADA' group by id_reserva
                ), approved_payments as (
                  select pr.id_pago_reserva, pr.id_reserva, pr.fecha_pago::date paid_on,
                         pr.monto, pr.comision_plataforma,
                         coalesce(r.amount,0) refund_amount,
                         sum(pr.monto) over(partition by pr.id_reserva) reservation_paid
                  from public.pago_reserva pr
                  left join refunds r on r.id_reserva=pr.id_reserva
                  where pr.estado='A' and lower(coalesce(pr.estado_liquidacion,''))='aprobado'
                ), period_payments as (
                  select * from approved_payments
                  where paid_on >= ? and paid_on < (?::date + interval '1 day')
                )
                select count(*), coalesce(sum(monto),0), coalesce(sum(comision_plataforma),0),
                       coalesce((select sum(amount) from refunds where id_reserva in
                                 (select distinct id_reserva from period_payments)),0),
                       coalesce(sum(greatest(comision_plataforma * (1 - least(refund_amount / nullif(reservation_paid,0),1)),0)),0)
                from period_payments
                """, (rs, row) -> new RevenueSummary(start, end, rs.getLong(1), rs.getBigDecimal(2),
                rs.getBigDecimal(3), rs.getBigDecimal(4), rs.getBigDecimal(5)), start, end);
    }

    public List<AuditEvent> audit(LocalDate from, LocalDate to, String query, int limit, AuthUserDto actor) {
        requireSuperadmin(actor);
        LocalDate end = to == null ? LocalDate.now(LIMA_ZONE) : to;
        LocalDate start = from == null ? end.minusDays(29) : from;
        if (start.isAfter(end) || start.isBefore(end.minusYears(3))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El rango debe ser válido y no superar 3 años");
        }
        int safeLimit = Math.max(1, Math.min(limit, 500));
        String needle = query == null ? "" : query.trim().toLowerCase();
        return jdbc.query("""
                select id, actor_user_id::text, actor_name, actor_role, http_method,
                       request_path, response_status, occurred_at
                from public.superadmin_audit_event
                where occurred_at >= ? and occurred_at < (?::date + interval '1 day')
                  and (? = '' or lower(actor_name) like ? or lower(actor_role) like ? or lower(request_path) like ?)
                order by occurred_at desc limit ?
                """, (rs, row) -> new AuditEvent(rs.getLong("id"), rs.getString("actor_user_id"),
                rs.getString("actor_name"), rs.getString("actor_role"), rs.getString("http_method"),
                rs.getString("request_path"), rs.getInt("response_status"),
                rs.getTimestamp("occurred_at").toInstant().atOffset(java.time.ZoneOffset.UTC)),
                start, end, needle, "%" + needle + "%", "%" + needle + "%", "%" + needle + "%", safeLimit);
    }

    public void recordMutation(AuthUserDto actor, String method, String path, int status) {
        if (actor == null || actor.id() == null || !Roles.isSuperAdmin(actor.rol())) return;
        try {
            jdbc.update("""
                    insert into public.superadmin_audit_event
                      (actor_user_id, actor_name, actor_role, http_method, request_path, response_status)
                    values (?::uuid, ?, ?, ?, ?, ?)
                    """, actor.id(), actor.nombre() == null ? "" : actor.nombre(), actor.rol(),
                    method, path, status);
        } catch (Exception ex) {
            // Audit failures must not break the business request; the audit page will expose the gap.
            org.slf4j.LoggerFactory.getLogger(getClass()).error("No se pudo guardar un evento de auditoría superadmin", ex);
        }
    }

    private void requireSuperadmin(AuthUserDto actor) {
        if (actor == null || !Roles.isSuperAdmin(actor.rol())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo superadmin puede consultar estos datos");
        }
    }
}
