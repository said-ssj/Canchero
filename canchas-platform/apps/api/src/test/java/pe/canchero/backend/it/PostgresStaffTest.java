package pe.canchero.backend.it;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.StaffService;
import pe.canchero.backend.service.StaffTestSchema;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.StaffAssignmentRequest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static pe.canchero.backend.it.PostgresTestSupport.*;

class PostgresStaffTest {
    private JdbcTemplate jdbc;
    private StaffService staff;
    private VenueAccessService access;

    @BeforeAll
    static void requirePostgres() {
        PostgresTestServer.requireAvailable();
    }

    @BeforeEach
    void setup() {
        PostgresTestServer.resetSchema();
        jdbc = jdbc();
        seedTwoVenues(jdbc);
        StaffTestSchema.create(jdbc);
        // En Supabase un trigger crea el negocio de cada dueño; aquí basta con un id por sede.
        jdbc.update("update sede set id_negocio = id_sede");
        jdbc.update("insert into rol (id_rol, nombre, descripcion, estado) values (12, 'cajero', 'Cajero', 'A'), (13, 'admin', 'Admin', 'A')");
        access = new VenueAccessService(jdbc);
        staff = new StaffService(jdbc, access);
    }

    private int status(Runnable call) {
        return assertThrows(ResponseStatusException.class, call::run).getStatusCode().value();
    }

    @Test
    void ownerAssignsStaffAndPermissionsFollowTheRoleMatrix() {
        var asignado = staff.assign(new StaffAssignmentRequest(VENUE_A, "JUGADOR1@canchero.pe", "cajero"), OWNER_A);
        assertEquals("cajero", asignado.rol());
        assertTrue(asignado.permisos().contains("venta.crear"));
        assertEquals("cajero", jdbc.queryForObject(
                "select r.nombre from usuario u join rol r on r.id_rol = u.id_rol where u.id_usuario = ?", String.class, PLAYER_1_ID));
        // Repetir la asignación no duplica.
        assertEquals(asignado.id(), staff.assign(new StaffAssignmentRequest(VENUE_A, "jugador1@canchero.pe", "cajero"), OWNER_A).id());

        var cajero = new AuthUserDto(PLAYER_1_ID.toString(), "Jugador Uno", "", "", "cajero");
        assertEquals(1, staff.mine(cajero).size());
        assertTrue(access.can(cajero, VENUE_A, OWNER_A_ID.toString(), VenueAccessService.VENTA_CREAR));
        assertFalse(access.can(cajero, VENUE_A, OWNER_A_ID.toString(), VenueAccessService.INVENTARIO_INGRESAR));
        assertFalse(access.can(cajero, VENUE_B, OWNER_B_ID.toString(), VenueAccessService.VENTA_CREAR));

        // Un dueño no asigna personal en sedes ajenas ni puede asignar a otro dueño.
        assertEquals(403, status(() -> staff.assign(new StaffAssignmentRequest(VENUE_B, "jugador2@canchero.pe", "cajero"), OWNER_A)));
        assertEquals(400, status(() -> staff.assign(new StaffAssignmentRequest(VENUE_A, "dueno.b@canchero.pe", "cajero"), OWNER_A)));
        assertEquals(400, status(() -> staff.assign(new StaffAssignmentRequest(VENUE_A, "jugador2@canchero.pe", "dueno"), OWNER_A)));

        // El admin asignado gestiona personal de su sede, pero no da ni quita el rol admin.
        staff.assign(new StaffAssignmentRequest(VENUE_A, "jugador2@canchero.pe", "admin"), OWNER_A);
        var admin = new AuthUserDto(PLAYER_2_ID.toString(), "Jugador Dos", "", "", "admin");
        assertEquals(2, staff.listForVenue(VENUE_A, admin).size());
        assertEquals(403, status(() -> staff.listForVenue(VENUE_B, admin)));
        assertEquals(403, status(() -> staff.assign(new StaffAssignmentRequest(VENUE_A, "jugador1@canchero.pe", "admin"), admin)));
        assertEquals(403, status(() -> staff.listForVenue(VENUE_A, cajero)));

        staff.remove(asignado.id(), admin);
        assertFalse(access.can(cajero, VENUE_A, OWNER_A_ID.toString(), VenueAccessService.VENTA_CREAR));
        assertTrue(staff.mine(cajero).isEmpty());
    }
}
