package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import java.sql.PreparedStatement;
import java.text.Normalizer;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.Locale;

@Service
public class CourtOperationService {
    public record Operation(Boolean disponible) {}
    public record SavedOperation(int id, boolean disponible) {}
    public record BlockRequest(String motivo, String fechaInicio, String fechaFin) {}
    public record SavedBlock(int id, int canchaId) {}
    private static final ZoneId LIMA_ZONE = ZoneId.of("America/Lima");
    private final JdbcTemplate jdbc;

    public CourtOperationService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public SavedOperation save(int id, AuthUserDto user, Operation request) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (request == null || request.disponible() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica la operatividad");
        }
        requireOwnedCourt(id, user);
        // Only operation changes here; do not rewrite tariffs, photos or existing bookings.
        jdbc.update("""
                update cancha set estado = ?, fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                where id_cancha = ?
                """, request.disponible() ? "A" : "I", id);
        return new SavedOperation(id, request.disponible());
    }

    @Transactional
    public SavedBlock createBlock(int courtId, AuthUserDto user, BlockRequest request) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        requireOwnedCourt(courtId, user);
        if (request == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Datos del cierre obligatorios");
        LocalDateTime inicio = request.fechaInicio() == null || request.fechaInicio().isBlank()
                ? LocalDateTime.now(LIMA_ZONE) : limaDateTime(request.fechaInicio());
        // Sin fecha fin (cierre inmediato) se bloquea 24 h, igual que hacía la interfaz.
        LocalDateTime fin = request.fechaFin() == null || request.fechaFin().isBlank()
                ? inicio.plusDays(1) : limaDateTime(request.fechaFin());
        if (!fin.isAfter(inicio)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fecha fin debe ser posterior al inicio");
        }
        String motivo = request.motivo() == null || request.motivo().isBlank()
                ? "Mantenimiento preventivo" : request.motivo().trim();
        if (motivo.length() > 200) motivo = motivo.substring(0, 200);
        String finalMotivo = motivo;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into bloqueo_mantenimiento (id_cancha, motivo, fecha_inicio, fecha_fin, estado, usucre, pccre)
                    values (?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """, new String[]{"id_bloqueo"});
            ps.setInt(1, courtId);
            ps.setString(2, finalMotivo);
            ps.setObject(3, inicio);
            ps.setObject(4, fin);
            return ps;
        }, keyHolder);
        return new SavedBlock(keyHolder.getKey().intValue(), courtId);
    }

    @Transactional
    public void reopenBlock(int blockId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        var courts = jdbc.queryForList("select id_cancha from bloqueo_mantenimiento where id_bloqueo = ?", Integer.class, blockId);
        if (courts.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cierre no encontrado");
        requireOwnedCourt(courts.get(0), user);
        jdbc.update("update bloqueo_mantenimiento set estado = 'I' where id_bloqueo = ?", blockId);
    }

    private void requireOwnedCourt(int courtId, AuthUserDto user) {
        var owners = jdbc.queryForList("""
                select s.id_dueno from cancha c join sede s on s.id_sede = c.id_sede
                where c.id_cancha = ? and s.estado = 'A' for update
                """, String.class, courtId);
        if (owners.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cancha no encontrada");
        if (!Roles.isOwnerOrAdmin(user.rol()) || !VenueAccessService.canManage(user, owners.get(0))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La cancha no pertenece a tu cuenta");
        }
    }

    /** Acepta "2026-11-05T10:00" (hora de Lima) o ISO con zona ("...Z"), y lo guarda en hora de Lima. */
    static LocalDateTime limaDateTime(String raw) {
        String value = raw.trim();
        try {
            return OffsetDateTime.parse(value).atZoneSameInstant(LIMA_ZONE).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            try {
                return LocalDateTime.parse(value);
            } catch (DateTimeParseException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Fecha inválida: " + value);
            }
        }
    }
}
