package pe.canchero.backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;
import pe.canchero.backend.web.dto.AuthUserDto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class PlatformAdminService extends JdbcSupport {
    public record RevenueSummary(LocalDate from, LocalDate to, long paymentCount,
            BigDecimal grossProcessed, BigDecimal commissionBeforeRefunds,
            BigDecimal registeredRefunds, BigDecimal estimatedNetCommission) {}
    public record AuditEvent(long id, String actorUserId, String actorName, String actorRole,
            String method, String path, int status, OffsetDateTime occurredAt) {}
    public record DailyMetric(LocalDate date, long bookings, BigDecimal paidGross) {}
    public record CourtMetric(int id, String name, boolean active, long bookings, BigDecimal reservedGross,
            BigDecimal paidGross, BigDecimal platformCommission, long reports, long openReports) {}
    public record VenueMetric(int id, String name, String ownerName, boolean active, long bookings,
            BigDecimal reservedGross, BigDecimal paidGross, BigDecimal platformCommission,
            long reports, long openReports, List<CourtMetric> courts) {}
    public record DashboardOverview(LocalDate from, LocalDate to, long activeVenues, long activeCourts,
            long bookings, long bookingsToday, long pendingReports, BigDecimal reservedGross,
            BigDecimal paidGross, List<DailyMetric> daily, List<VenueMetric> venues) {}

    private static final class VenueAccumulator {
        final int id;
        final String name;
        final String ownerName;
        final boolean active;
        final List<CourtMetric> courts = new ArrayList<>();
        long bookings;
        BigDecimal reservedGross = BigDecimal.ZERO;
        BigDecimal paidGross = BigDecimal.ZERO;
        BigDecimal platformCommission = BigDecimal.ZERO;
        long reports;
        long openReports;

        VenueAccumulator(int id, String name, String ownerName, boolean active) {
            this.id = id;
            this.name = name;
            this.ownerName = ownerName;
            this.active = active;
        }
    }

    public PlatformAdminService(JdbcTemplate jdbc) { super(jdbc); }

    public DashboardOverview dashboard(LocalDate from, LocalDate to, AuthUserDto actor) {
        requireSuperadmin(actor);
        LocalDate end = to == null ? LocalDate.now(LIMA_ZONE) : to;
        LocalDate start = from == null ? end.minusDays(29) : from;
        if (start.isAfter(end) || start.isBefore(end.minusYears(3))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El rango debe ser válido y no superar 3 años");
        }
        LocalDate today = LocalDate.now(LIMA_ZONE);

        List<Map<String, Object>> rows = jdbc.queryForList("""
                with booking_stats as (
                  select r.id_cancha,
                         count(*) filter (where lower(er.nombre) not like '%cancel%') as bookings,
                         count(*) filter (where r.fecha_reserva = ? and lower(er.nombre) not like '%cancel%') as bookings_today,
                         coalesce(sum(r.monto_total) filter (where lower(er.nombre) not like '%cancel%'), 0) as reserved_gross
                  from public.reserva r
                  join public.estado_reserva er on er.id_estado_reserva = r.id_estado_reserva
                  where r.estado = 'A' and r.fecha_reserva between ? and ?
                  group by r.id_cancha
                ), payment_stats as (
                  select r.id_cancha, count(pr.id_pago_reserva) as payments,
                         coalesce(sum(pr.monto), 0) as paid_gross,
                         coalesce(sum(pr.comision_plataforma), 0) as platform_commission
                  from public.pago_reserva pr
                  join public.reserva r on r.id_reserva = pr.id_reserva
                  where pr.estado = 'A' and lower(coalesce(pr.estado_liquidacion, '')) = 'aprobado'
                    and pr.fecha_pago::date between ? and ?
                  group by r.id_cancha
                ), report_stats as (
                  select id_cancha,
                         count(*) filter (where fecha_creacion::date between ? and ?) as reports,
                         count(*) filter (where upper(estado) in ('PENDIENTE', 'EN_REVISION')) as open_reports
                  from public.reporte_cancha
                  group by id_cancha
                )
                select s.id_sede, s.nombre as sede_nombre, s.estado as sede_estado,
                       coalesce(u.nombre, 'Sin propietario asignado') as owner_name,
                       c.id_cancha, c.nombre_numero as cancha_nombre, c.estado as cancha_estado,
                       coalesce(bs.bookings, 0) as bookings,
                       coalesce(bs.bookings_today, 0) as bookings_today,
                       coalesce(bs.reserved_gross, 0) as reserved_gross,
                       coalesce(ps.paid_gross, 0) as paid_gross,
                       coalesce(ps.platform_commission, 0) as platform_commission,
                       coalesce(rs.reports, 0) as reports,
                       coalesce(rs.open_reports, 0) as open_reports
                from public.sede s
                left join public.usuario u on u.id_usuario = s.id_dueno
                left join public.cancha c on c.id_sede = s.id_sede
                left join booking_stats bs on bs.id_cancha = c.id_cancha
                left join payment_stats ps on ps.id_cancha = c.id_cancha
                left join report_stats rs on rs.id_cancha = c.id_cancha
                order by s.estado desc, s.nombre, c.estado desc, c.nombre_numero
                """, today, start, end, start, end, start, end);

        Map<Integer, VenueAccumulator> byVenue = new LinkedHashMap<>();
        long bookingsToday = 0;
        for (Map<String, Object> row : rows) {
            int venueId = ((Number) row.get("id_sede")).intValue();
            VenueAccumulator venue = byVenue.computeIfAbsent(venueId, id -> new VenueAccumulator(
                    id, String.valueOf(row.get("sede_nombre")), String.valueOf(row.get("owner_name")),
                    "A".equalsIgnoreCase(String.valueOf(row.get("sede_estado")))));
            Object courtIdValue = row.get("id_cancha");
            if (courtIdValue == null) continue;
            long courtBookings = number(row.get("bookings"));
            long courtToday = number(row.get("bookings_today"));
            long reports = number(row.get("reports"));
            long openReports = number(row.get("open_reports"));
            BigDecimal reserved = decimal(row.get("reserved_gross"));
            BigDecimal paid = decimal(row.get("paid_gross"));
            BigDecimal commission = decimal(row.get("platform_commission"));
            venue.courts.add(new CourtMetric(((Number) courtIdValue).intValue(),
                    String.valueOf(row.get("cancha_nombre")), "A".equalsIgnoreCase(String.valueOf(row.get("cancha_estado"))),
                    courtBookings, reserved, paid, commission, reports, openReports));
            venue.bookings += courtBookings;
            bookingsToday += courtToday;
            venue.reservedGross = venue.reservedGross.add(reserved);
            venue.paidGross = venue.paidGross.add(paid);
            venue.platformCommission = venue.platformCommission.add(commission);
            venue.reports += reports;
            venue.openReports += openReports;
        }

        List<DailyMetric> daily = jdbc.query("""
                with days as (
                  select generate_series(greatest(?::date, ?::date - interval '89 days')::date, ?::date, interval '1 day')::date as day
                ), booking_daily as (
                  select r.fecha_reserva as day, count(*) as bookings
                  from public.reserva r
                  join public.estado_reserva er on er.id_estado_reserva = r.id_estado_reserva
                  where r.estado = 'A' and r.fecha_reserva between greatest(?::date, ?::date - interval '89 days') and ?
                    and lower(er.nombre) not like '%cancel%'
                  group by r.fecha_reserva
                ), payment_daily as (
                  select pr.fecha_pago::date as day, sum(pr.monto) as paid_gross
                  from public.pago_reserva pr
                  where pr.estado = 'A' and lower(coalesce(pr.estado_liquidacion, '')) = 'aprobado'
                    and pr.fecha_pago::date between greatest(?::date, ?::date - interval '89 days') and ?
                  group by pr.fecha_pago::date
                )
                select days.day, coalesce(booking_daily.bookings, 0) as bookings,
                       coalesce(payment_daily.paid_gross, 0) as paid_gross
                from days
                left join booking_daily on booking_daily.day = days.day
                left join payment_daily on payment_daily.day = days.day
                order by days.day
                """, (rs, row) -> new DailyMetric(rs.getObject("day", LocalDate.class),
                rs.getLong("bookings"), rs.getBigDecimal("paid_gross")), start, end, end,
                start, end, end, start, end, end);

        long activeVenues = byVenue.values().stream().filter(v -> v.active).count();
        long activeCourts = byVenue.values().stream().flatMap(v -> v.courts.stream()).filter(CourtMetric::active).count();
        long totalBookings = byVenue.values().stream().mapToLong(v -> v.bookings).sum();
        long pendingReports = byVenue.values().stream().mapToLong(v -> v.openReports).sum();
        BigDecimal reservedGross = byVenue.values().stream().map(v -> v.reservedGross).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal paidGross = byVenue.values().stream().map(v -> v.paidGross).reduce(BigDecimal.ZERO, BigDecimal::add);
        List<VenueMetric> venues = byVenue.values().stream()
                .sorted((a, b) -> Long.compare(b.bookings, a.bookings))
                .map(v -> new VenueMetric(v.id, v.name, v.ownerName, v.active, v.bookings,
                        v.reservedGross, v.paidGross, v.platformCommission, v.reports, v.openReports,
                        v.courts.stream().sorted((a, b) -> Long.compare(b.bookings(), a.bookings())).toList()))
                .toList();
        return new DashboardOverview(start, end, activeVenues, activeCourts, totalBookings,
                bookingsToday, pendingReports, reservedGross, paidGross, daily, venues);
    }

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

    private long number(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }

    private BigDecimal decimal(Object value) {
        if (value instanceof BigDecimal amount) return amount;
        if (value instanceof Number number) return BigDecimal.valueOf(number.doubleValue());
        return BigDecimal.ZERO;
    }
}
