package pe.canchero.backend.service;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class PlayerActivityService {
    private final JdbcTemplate jdbc;
    public PlayerActivityService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    private UUID identity(AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        return UUID.fromString(user.id());
    }
    private void favoritesReady() {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select to_regclass('public.favorito_sede') is not null", Boolean.class)))
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Los favoritos aún no están configurados");
    }
    public List<String> favorites(AuthUserDto user) {
        UUID id = identity(user);
        favoritesReady();
        return jdbc.query("select f.id_sede from favorito_sede f join sede s using(id_sede) where f.id_usuario=? and s.estado='A' order by f.fecha_creacion desc, f.id_sede",
            (r,n) -> String.valueOf(r.getInt(1)), id);
    }
    public void favorite(AuthUserDto user, int venue, boolean save) {
        UUID id = identity(user);
        favoritesReady();
        if (!save) { jdbc.update("delete from favorito_sede where id_usuario=? and id_sede=?", id, venue); return; }
        int changed = jdbc.update("""
            insert into favorito_sede(id_usuario,id_sede)
            select ?, s.id_sede from sede s where s.id_sede=? and s.estado='A'
            on conflict(id_usuario,id_sede) do nothing
            """, id, venue);
        if (changed == 0 && !Boolean.TRUE.equals(jdbc.queryForObject(
            "select exists(select 1 from sede where id_sede=? and estado='A')",Boolean.class,venue)))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"La sede ya no está disponible");
    }
    public record Payment(String id, String bookingId, String venueId, String venueName,
        String courtName, LocalDate bookingDate, String startTime, String endTime,
        BigDecimal amount, String method, LocalDateTime paidAt, String reference, boolean advance) {}
    public record PaymentPage(List<Payment> items, boolean hasMore) {}
    public PaymentPage payments(AuthUserDto user, int page) {
        UUID id = identity(user);
        if (page < 0 || page > 10000) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
        List<Payment> rows = jdbc.query("""
            select p.id_pago_reserva,p.id_reserva,s.id_sede,s.nombre as sede,c.nombre_numero as cancha,
                r.fecha_reserva,r.hora_inicio,r.hora_fin,p.monto,mp.nombre as metodo,
                p.fecha_pago,p.numero_operacion,p.es_adelanto
            from pago_reserva p join reserva r on r.id_reserva=p.id_reserva
            join cancha c on c.id_cancha=r.id_cancha join sede s on s.id_sede=c.id_sede
            left join metodo_pago mp on mp.id_metodo_pago=p.id_metodo_pago
            where p.estado='A' and exists(
                select 1 from cliente cli where cli.id_cliente=r.id_cliente and cli.id_usuario=?)
            order by p.fecha_pago desc nulls last,p.id_pago_reserva desc limit 51 offset ?
            """, (r,n) -> new Payment(r.getString("id_pago_reserva"),r.getString("id_reserva"),
                r.getString("id_sede"),r.getString("sede"),r.getString("cancha"),
                r.getObject("fecha_reserva",LocalDate.class),r.getString("hora_inicio"),r.getString("hora_fin"),
                r.getBigDecimal("monto"),r.getString("metodo"),r.getObject("fecha_pago",LocalDateTime.class),
                r.getString("numero_operacion"),r.getBoolean("es_adelanto")),id,page*50);
        return new PaymentPage(rows.stream().limit(50).toList(),rows.size()>50);
    }
}
