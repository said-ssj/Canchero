package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import java.text.Normalizer;
import java.util.Locale;

@Service
public class CourtOperationService {
    public record Operation(Boolean disponible) {}
    public record SavedOperation(int id, boolean disponible) {}
    private final JdbcTemplate jdbc;

    public CourtOperationService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    static boolean isVenueManagerRole(String role) {
        String normalized = Normalizer.normalize(role == null ? "" : role, Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT).trim();
        return normalized.contains("dueno") || normalized.equals("owner")
                || normalized.contains("propietario") || normalized.contains("admin");
    }

    @Transactional
    public SavedOperation save(int id, AuthUserDto user, Operation request) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (request == null || request.disponible() == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica la operatividad");
        }
        var owners = jdbc.queryForList("""
                select s.id_dueno from cancha c join sede s on s.id_sede = c.id_sede
                where c.id_cancha = ? and s.estado = 'A' for update
                """, String.class, id);
        if (owners.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cancha no encontrada");
        if (!isVenueManagerRole(user.rol()) || !user.id().equals(owners.get(0))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La cancha no pertenece a tu cuenta");
        }
        // Only operation changes here; do not rewrite tariffs, photos or existing bookings.
        jdbc.update("""
                update cancha set estado = ?, fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                where id_cancha = ?
                """, request.disponible() ? "A" : "I", id);
        return new SavedOperation(id, request.disponible());
    }
}
