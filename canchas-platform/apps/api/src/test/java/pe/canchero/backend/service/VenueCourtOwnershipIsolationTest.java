package pe.canchero.backend.service;

import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.config.ApiAuthorizationInterceptor;
import pe.canchero.backend.web.controller.ApiExceptionHandler;
import pe.canchero.backend.web.controller.CourtController;
import pe.canchero.backend.web.controller.VenueController;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.VenueRequest;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Dueño A no puede crear, editar ni desactivar sedes o canchas del dueño B (y viceversa). */
class VenueCourtOwnershipIsolationTest {

    private final UUID ownerA = UUID.randomUUID();
    private final UUID ownerB = UUID.randomUUID();
    private final UUID admin = UUID.randomUUID();
    private final AuthTokenService tokens = new AuthTokenService("unit-test-only-secret");
    private VenueService data;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        var jdbc = new JdbcTemplate(new SingleConnectionDataSource(
                "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1;MODE=PostgreSQL", "sa", "", true));
        jdbc.execute("create table sede (id_sede int primary key, id_dueno varchar(40), estado char(1))");
        jdbc.execute("create table cancha (id_cancha int primary key, id_sede int)");
        jdbc.update("insert into sede values (1, ?, 'A'), (2, ?, 'A')", ownerA.toString(), ownerB.toString());
        jdbc.update("insert into cancha values (10, 1), (20, 2)");

        data = mock(VenueService.class);
        var auth = mock(AuthService.class);
        when(auth.currentUser(any())).thenAnswer(call -> {
            UUID id = call.getArgument(0);
            return Optional.of(new AuthUserDto(id.toString(), "Usuario", id + "@test", null, id.equals(admin) ? "superadmin" : "dueno"));
        });
        var access = new VenueAccessService(jdbc);
        mvc = MockMvcBuilders.standaloneSetup(
                        new VenueController(data, access),
                        new CourtController(data, null, null, access))
                .setControllerAdvice(new ApiExceptionHandler())
                .addInterceptors(new ApiAuthorizationInterceptor(tokens, auth))
                .build();
    }

    private String bearer(UUID user) {
        return "Bearer " + tokens.issue(user, true);
    }

    @Test
    void dueñoBNoPuedeTocarLaSedeNiCanchasDeA() throws Exception {
        String b = bearer(ownerB);
        mvc.perform(put("/api/venues/1").header("Authorization", b).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/venues/1").header("Authorization", b)).andExpect(status().isForbidden());
        mvc.perform(post("/api/courts").header("Authorization", b).contentType(MediaType.APPLICATION_JSON)
                .content("{\"venueId\":\"1\",\"nombre\":\"Intrusa\"}")).andExpect(status().isForbidden());
        mvc.perform(put("/api/courts/10").header("Authorization", b).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(delete("/api/courts/10").header("Authorization", b)).andExpect(status().isForbidden());

        verify(data, never()).updateVenue(any(), any());
        verify(data, never()).deleteVenue(any());
        verify(data, never()).createCourt(any());
        verify(data, never()).updateCourt(any(), any());
        verify(data, never()).deleteCourt(any());
    }

    @Test
    void dueñoAOperaSobreLoSuyo() throws Exception {
        String a = bearer(ownerA);
        when(data.deleteVenue("1")).thenReturn(true);
        when(data.deleteCourt("10")).thenReturn(true);
        mvc.perform(delete("/api/venues/1").header("Authorization", a)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/courts/10").header("Authorization", a)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/courts/20").header("Authorization", a)).andExpect(status().isForbidden());
    }

    @Test
    void elAdministradorGestionaCualquierSede() throws Exception {
        String adm = bearer(admin);
        when(data.deleteVenue("2")).thenReturn(true);
        when(data.deleteCourt("10")).thenReturn(true);
        mvc.perform(delete("/api/venues/2").header("Authorization", adm)).andExpect(status().isNoContent());
        mvc.perform(delete("/api/courts/10").header("Authorization", adm)).andExpect(status().isNoContent());
        mvc.perform(post("/api/courts").header("Authorization", adm).contentType(MediaType.APPLICATION_JSON)
                .content("{\"venueId\":\"1\",\"nombre\":\"Nueva\"}")).andExpect(status().isCreated());
    }

    @Test
    void soloElAdminReasignaElDueñoDeUnaSede() throws Exception {
        String body = "{\"email\":\"nuevo@test\"}";
        mvc.perform(put("/api/venues/1/owner").header("Authorization", bearer(ownerA))
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isForbidden());
        verify(data, never()).assignOwner(anyInt(), any());
        when(data.assignOwner(1, "nuevo@test")).thenReturn(Optional.empty());
        mvc.perform(put("/api/venues/1/owner").header("Authorization", bearer(admin))
                .contentType(MediaType.APPLICATION_JSON).content(body)).andExpect(status().isNotFound());
        verify(data).assignOwner(1, "nuevo@test");
    }

    @Test
    void reasignarRechazaCorreosSinCuentaODeJugador() {
        var jdbc = new JdbcTemplate(new SingleConnectionDataSource(
                "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1;MODE=PostgreSQL", "sa", "", true));
        jdbc.execute("create table rol (id_rol int primary key, nombre varchar(40), estado char(1))");
        jdbc.execute("create table usuario (id_usuario uuid primary key, id_rol int, correo varchar(120), estado char(1))");
        jdbc.update("insert into rol values (1, 'cliente', 'A')");
        jdbc.update("insert into usuario values (?, 1, 'jugador@test', 'A')", UUID.randomUUID());
        var venues = new VenueService(jdbc);
        assertEquals(404, assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> venues.assignOwner(1, "nadie@test")).getStatusCode().value());
        assertEquals(400, assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> venues.assignOwner(1, " Jugador@Test ")).getStatusCode().value());
    }

    @Test
    void crearSedeUsaElDueñoDeLaSesionNoElDelCuerpo() throws Exception {
        mvc.perform(post("/api/venues").header("Authorization", bearer(ownerA)).contentType(MediaType.APPLICATION_JSON)
                .content("{\"nombre\":\"Nueva\",\"ownerId\":\"" + ownerB + "\"}")).andExpect(status().isCreated());
        verify(data).createVenue(any(VenueRequest.class), eq(ownerA));
    }

    @Test
    void idsInvalidosDan400NoError500() throws Exception {
        String a = bearer(ownerA);
        mvc.perform(delete("/api/venues/abc").header("Authorization", a)).andExpect(status().isBadRequest());
        mvc.perform(post("/api/courts").header("Authorization", a).contentType(MediaType.APPLICATION_JSON)
                .content("{\"venueId\":\"abc\"}")).andExpect(status().isBadRequest());
        when(data.getCourtAvailability(eq("abc"), any(), any())).thenThrow(new NumberFormatException("abc"));
        mvc.perform(get("/api/courts/abc/availability?from=2026-11-07&to=2026-11-08")).andExpect(status().isBadRequest());
    }
}
