package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.CourtDto;
import pe.canchero.backend.web.dto.CourtRequest;

@Service
public class CourtRecoveryService {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CourtRecoveryService.class);
    private final JdbcTemplate jdbc;
    private final VenueService data;

    public CourtRecoveryService(JdbcTemplate jdbc, VenueService data) {
        this.jdbc = jdbc;
        this.data = data;
    }

    @Transactional
    public CourtDto recover(AuthUserDto user, CourtRequest request) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (request == null || request.nombre() == null || request.nombre().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica el nombre de la cancha");
        }
        int venueId;
        try { venueId = Integer.parseInt(request.venueId()); }
        catch (RuntimeException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sede invalida"); }
        // Serializes recovery across tabs and retries without a new schema or client-controlled owner.
        var owners = jdbc.queryForList("select id_dueno from sede where id_sede = ? and estado = 'A' for update", String.class, venueId);
        if (owners.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sede no encontrada");
        if (!new VenueAccessService(jdbc).can(user, venueId, owners.get(0), VenueAccessService.CANCHA_GESTIONAR)) {
            log.warn("Court recovery rejected: venueOwnership={}", user.id().equals(owners.get(0)));
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La sede no pertenece a tu cuenta");
        }
        var existing = jdbc.queryForList("""
                select id_cancha from cancha where id_sede = ?
                and lower(trim(nombre_numero)) = lower(trim(?))
                """, Integer.class, venueId, request.nombre());
        if (existing.size() > 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "Hay varias canchas con ese nombre; revisa su identidad");
        if (existing.size() == 1) return data.getCourt(existing.get(0).toString()).orElseThrow();
        return data.createCourt(request);
    }
}
