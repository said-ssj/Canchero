package pe.canchero.backend.service;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import static org.junit.jupiter.api.Assertions.*;

class CourtOperationServiceTest {
    private JdbcTemplate jdbc;
    private CourtOperationService service;
    private final AuthUserDto owner = new AuthUserDto("owner-a", "", "", "", "dueno");

    @BeforeEach
    void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("create table sede (id_sede int, id_dueno varchar(40), estado char(1))");
        jdbc.execute("create table cancha (id_cancha int, id_sede int, estado char(1), fecmod timestamp, usmod varchar(30), pcmod varchar(30))");
        jdbc.update("insert into sede values (1, 'owner-a', 'A'), (2, 'owner-b', 'A')");
        jdbc.update("insert into cancha (id_cancha, id_sede, estado) values (11, 1, 'A'), (22, 2, 'A')");
        service = new CourtOperationService(jdbc);
    }

    @Test
    void acceptsDatabaseManagementRolesWithoutAllowingPlayers() {
        assertTrue(CourtOperationService.isVenueManagerRole("Due\u00f1o"));
        assertTrue(CourtOperationService.isVenueManagerRole("DUENO SEDE"));
        assertTrue(CourtOperationService.isVenueManagerRole("Administrador"));
        assertFalse(CourtOperationService.isVenueManagerRole("jugador"));
        assertFalse(CourtOperationService.isVenueManagerRole(null));
    }

    @Test
    void pausesAndReopensPersistentlyWithoutTouchingAnotherVenue() {
        assertFalse(service.save(11, owner, new CourtOperationService.Operation(false)).disponible());
        assertEquals("I", jdbc.queryForObject("select estado from cancha where id_cancha = 11", String.class));
        assertEquals("API", jdbc.queryForObject("select usmod from cancha where id_cancha = 11", String.class));
        assertTrue(new CourtOperationService(jdbc).save(11, owner, new CourtOperationService.Operation(true)).disponible());
        assertEquals("A", jdbc.queryForObject("select estado from cancha where id_cancha = 11", String.class));
        assertEquals("A", jdbc.queryForObject("select estado from cancha where id_cancha = 22", String.class));
    }

    @Test
    void rejectsOtherOwnersAndNonOwnersBeforeWriting() {
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> service.save(22, owner, new CourtOperationService.Operation(false))).getStatusCode().value());
        var player = new AuthUserDto("owner-a", "", "", "", "jugador");
        assertEquals(403, assertThrows(ResponseStatusException.class,
                () -> service.save(11, player, new CourtOperationService.Operation(false))).getStatusCode().value());
        assertEquals("A", jdbc.queryForObject("select estado from cancha where id_cancha = 11", String.class));
    }

    @Test
    void rejectsMissingIdentityStateAndCourt() {
        assertEquals(401, assertThrows(ResponseStatusException.class,
                () -> service.save(11, null, new CourtOperationService.Operation(false))).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.save(11, owner, new CourtOperationService.Operation(null))).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class,
                () -> service.save(99, owner, new CourtOperationService.Operation(false))).getStatusCode().value());
    }
}
