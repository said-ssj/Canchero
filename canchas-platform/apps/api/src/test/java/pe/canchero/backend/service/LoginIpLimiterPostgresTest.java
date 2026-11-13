package pe.canchero.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.it.PostgresTestServer;
import pe.canchero.backend.it.PostgresTestSupport;
import pe.canchero.backend.web.controller.AuthController;
import pe.canchero.backend.web.dto.*;
import java.util.Optional;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class LoginIpLimiterPostgresTest {
    JdbcTemplate jdbc;
    LoginIpLimiter limiter;

    @BeforeEach void setup() {
        PostgresTestServer.requireAvailable();
        PostgresTestServer.resetSchema();
        jdbc = PostgresTestSupport.jdbc();
        jdbc.execute("create table if not exists public.login_intento_ip (huella char(64) primary key, fallos integer not null check(fallos>=0), inicio_ventana timestamptz not null)");
        limiter = new LoginIpLimiter(jdbc, "");
    }

    @Test void firstAttemptWithEmptyTableIsNotBlockedAndDoesNotCreateFailures() {
        assertFalse(limiter.bloqueada("192.0.2.1", "first@example.invalid"));
        assertEquals(0, jdbc.queryForObject("select count(*) from public.login_intento_ip", Integer.class));
    }

    @Test void activeWindowStillBlocksAtTheLimit() {
        for (int i=0;i<LoginIpLimiter.MAX_FALLOS-1;i++) limiter.registrarFallo("192.0.2.1", "player@example.invalid");
        assertFalse(limiter.bloqueada("192.0.2.1", "player@example.invalid"));
        limiter.registrarFallo("192.0.2.1", "player@example.invalid");
        assertTrue(limiter.bloqueada("192.0.2.1", "player@example.invalid"));
    }

    @Test void expiredWindowAllowsAccessAndRestartsFailureCount() {
        for (int i=0;i<LoginIpLimiter.MAX_FALLOS;i++) limiter.registrarFallo("192.0.2.1", "player@example.invalid");
        jdbc.update("update public.login_intento_ip set inicio_ventana=now()-interval '16 minutes'");
        assertFalse(limiter.bloqueada("192.0.2.1", "player@example.invalid"));
        limiter.registrarFallo("192.0.2.1", "player@example.invalid");
        assertEquals(1,jdbc.queryForObject("select fallos from public.login_intento_ip",Integer.class));
        assertFalse(limiter.bloqueada("192.0.2.1", "player@example.invalid"));
    }

    @Test void countersAreSharedAcrossInstancesAndIsolatedByAccountAndIp() {
        for (int i=0;i<LoginIpLimiter.MAX_FALLOS;i++) limiter.registrarFallo("192.0.2.1", " PLAYER@example.invalid ");
        var other = new LoginIpLimiter(jdbc, "");
        assertTrue(other.bloqueada("192.0.2.1", "player@example.invalid"));
        assertFalse(other.bloqueada("192.0.2.1", "other@example.invalid"));
        assertFalse(other.bloqueada("192.0.2.2", "player@example.invalid"));
    }

    @Test void genuineDatabaseFailureDoesNotDisableTheLimiter() {
        jdbc.execute("drop table public.login_intento_ip");
        assertThrows(DataAccessException.class, () -> limiter.bloqueada("192.0.2.1", "player@example.invalid"));
    }

    @Test void httpLoginReachesCredentialValidationOnFirstVisit() throws Exception {
        var auth = mock(AuthService.class);
        var user = new AuthUserDto("11111111-1111-1111-1111-111111111111", "QA", "first@example.invalid", "", "cliente");
        when(auth.login(any(LoginRequest.class))).thenReturn(Optional.of(new AuthResponse("test-only-token",user)));
        var mvc=MockMvcBuilders.standaloneSetup(new AuthController(auth,new AuthTokenService("test-only-secret"),limiter,
                new MailService("","test@example.invalid","http://localhost"))).build();
        mvc.perform(post("/api/auth/login").contentType("application/json")
                .content("{\"email\":\"first@example.invalid\",\"password\":\"test-only-password\"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.token").value("test-only-token"));
        verify(auth).login(any(LoginRequest.class));
    }
}
