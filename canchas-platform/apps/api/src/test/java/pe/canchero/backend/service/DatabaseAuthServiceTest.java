package pe.canchero.backend.service;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import pe.canchero.backend.config.PasswordUtil;
import pe.canchero.backend.web.dto.LoginRequest;
import pe.canchero.backend.web.dto.RegisterRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.config.ApiAuthorizationInterceptor;
import pe.canchero.backend.web.controller.AuthController;
import java.time.Clock;
import java.time.ZoneOffset;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.junit.jupiter.api.Assertions.*;

class DatabaseAuthServiceTest {
    private JdbcTemplate jdbc;
    private SupabaseDataService service;
    private final UUID owner = UUID.randomUUID();

    @BeforeEach
    void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1;MODE=PostgreSQL", "sa", ""));
        jdbc.execute("create table rol (id_rol int primary key, nombre varchar, estado varchar)");
        jdbc.execute("create table usuario (id_usuario uuid primary key, id_rol int, nombre varchar, correo varchar unique, telefono varchar, password_hash varchar, estado varchar, usucre varchar, pccre varchar)");
        jdbc.update("insert into rol values (1, 'admin', 'A'), (2, 'cliente', 'A')");
        jdbc.update("insert into usuario (id_usuario,id_rol,nombre,correo,password_hash,estado) values (?,1,'Dueno','dueno@canchero.pe',?,'A')", owner, PasswordUtil.hash("unit-test-only-password"));
        service = new SupabaseDataService(jdbc, new AuthTokenService("unit-test-only-secret"));
    }

    @Test
    void usesCorreoAndReturnsTheExistingOwnerIdentity() {
        var auth = service.login(new LoginRequest(" DUENO@CANCHERO.PE ", "unit-test-only-password")).orElseThrow();
        assertEquals(owner.toString(), auth.user().id());
        assertEquals("dueno@canchero.pe", auth.user().email());
        assertEquals(owner, new AuthTokenService("unit-test-only-secret").verify(auth.token()));
        assertEquals(owner.toString(), service.currentUser(owner).orElseThrow().id());
    }

    @Test
    void rejectsIncorrectPasswordInactiveUserAndInactiveRole() {
        assertTrue(service.login(new LoginRequest("dueno@canchero.pe", "wrong")).isEmpty());
        jdbc.update("update usuario set estado='I'");
        assertTrue(service.login(new LoginRequest("dueno@canchero.pe", "unit-test-only-password")).isEmpty());
        assertTrue(service.currentUser(owner).isEmpty());
        jdbc.update("update usuario set estado='A'");
        jdbc.update("update rol set estado='I' where id_rol=1");
        assertTrue(service.login(new LoginRequest("dueno@canchero.pe", "unit-test-only-password")).isEmpty());
        assertTrue(service.currentUser(owner).isEmpty());
    }

    @Test
    void registersUsingCorreoWithoutAParallelEmailColumn() {
        var auth = service.register(new RegisterRequest("Jugador", "jugador@example.test", "", "cliente", "unit-test-only-password")).orElseThrow();
        assertEquals("jugador@example.test", auth.user().email());
        assertEquals("cliente", auth.user().rol());
    }

    private MockMvc refreshMvc(AuthTokenService tokens) {
        return MockMvcBuilders.standaloneSetup(new AuthController(service, tokens))
                .addInterceptors(new ApiAuthorizationInterceptor(tokens, service)).build();
    }

    @Test
    void loginHonorsExplicitPolicyAndLegacyDefaults() throws Exception {
        service = new SupabaseDataService(jdbc, AuthTokenServiceTest.at(AuthTokenServiceTest.NOW));
        ObjectMapper mapper = new ObjectMapper();
        for (String policy : new String[]{"", ",\"rememberMe\":null", ",\"rememberMe\":true", ",\"rememberMe\":false"}) {
            LoginRequest request = mapper.readValue("{\"email\":\"dueno@canchero.pe\",\"password\":\"unit-test-only-password\"" + policy + "}", LoginRequest.class);
            String token = service.login(request).orElseThrow().token();
            long ttl = policy.endsWith("false") ? 900 : 604800;
            assertEquals(owner, AuthTokenServiceTest.at(AuthTokenServiceTest.NOW.plusSeconds(ttl - 1)).verify(token));
            assertThrows(org.springframework.web.server.ResponseStatusException.class,
                    () -> AuthTokenServiceTest.at(AuthTokenServiceTest.NOW.plusSeconds(ttl)).verify(token));
        }
        assertTrue(new LoginRequest("email", "password").rememberMe());
    }

    @Test
    void refreshAllowsPlayerAndIgnoresBodyPolicy() throws Exception {
        jdbc.update("update usuario set id_rol=2");
        AuthTokenService tokens = AuthTokenServiceTest.at(AuthTokenServiceTest.NOW.plusSeconds(600));
        String token = AuthTokenServiceTest.at(AuthTokenServiceTest.NOW).issue(owner, false);
        String body = refreshMvc(tokens).perform(post("/api/auth/refresh")
                        .header("Authorization", "Bearer " + token).contentType("application/json")
                        .content("{\"rememberMe\":true,\"userId\":\"" + UUID.randomUUID() + "\"}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.id").value(owner.toString()))
                .andExpect(jsonPath("$.user.rol").value("cliente"))
                .andReturn().getResponse().getContentAsString();
        String renewed = new ObjectMapper().readTree(body).get("token").asText();
        assertNotEquals(token, renewed);
        assertEquals(owner, AuthTokenServiceTest.at(AuthTokenServiceTest.NOW.plusSeconds(1499)).verify(renewed));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> AuthTokenServiceTest.at(AuthTokenServiceTest.NOW.plusSeconds(1500)).verify(renewed));
    }

    @Test
    void refreshRejectsMissingInvalidExpiredAndInactiveSessions() throws Exception {
        AuthTokenService tokens = AuthTokenServiceTest.at(AuthTokenServiceTest.NOW);
        MockMvc mvc = refreshMvc(tokens);
        mvc.perform(post("/api/auth/refresh")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").header("Authorization", "Basic invalid")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer invalid")).andExpect(status().isUnauthorized());
        String expired = new AuthTokenService(AuthTokenServiceTest.SECRET,
                Clock.fixed(AuthTokenServiceTest.NOW.minusSeconds(900), ZoneOffset.UTC)).issue(owner, false);
        mvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer " + expired)).andExpect(status().isUnauthorized());
        String token = tokens.issue(owner, true);
        jdbc.update("update usuario set estado='I'");
        mvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        jdbc.update("update usuario set estado='A'");
        jdbc.update("update rol set estado='I' where id_rol=1");
        mvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
        jdbc.update("update rol set estado='A' where id_rol=1");
        jdbc.update("delete from usuario");
        mvc.perform(post("/api/auth/refresh").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
    }

    @Test
    void refreshAcceptsLegacyTokenWithoutBody() throws Exception {
        String legacy = AuthTokenServiceTest.signed(owner + ":" + AuthTokenServiceTest.NOW.plusSeconds(900).getEpochSecond());
        String body = refreshMvc(AuthTokenServiceTest.at(AuthTokenServiceTest.NOW)).perform(post("/api/auth/refresh")
                        .header("Authorization", "Bearer " + legacy))
                .andExpect(status().isOk()).andExpect(jsonPath("$.user.id").value(owner.toString()))
                .andReturn().getResponse().getContentAsString();
        String token = new ObjectMapper().readTree(body).get("token").asText();
        assertEquals(owner, AuthTokenServiceTest.at(AuthTokenServiceTest.NOW.plusSeconds(604799)).verify(token));
    }

    @Test
    void registerAllowsPlayerAndOwnerRolesViaPublicEndpoint() throws Exception {
        MockMvc mvc = refreshMvc(new AuthTokenService("unit-test-only-secret"));
        jdbc.update("insert into rol values (3, 'dueño', 'A')");

        // Player registration with 'jugador'
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Carlos Jugador",
                            "email": "carlos.jugador@example.com",
                            "telefono": "999888777",
                            "rol": "jugador",
                            "password": "valid-password-123"
                        }
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.email").value("carlos.jugador@example.com"))
                .andExpect(jsonPath("$.user.rol").value("cliente"));

        // Player registration with 'player'
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Pedro Player",
                            "email": "pedro.player@example.com",
                            "telefono": "999888778",
                            "rol": "player",
                            "password": "valid-password-123"
                        }
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.rol").value("cliente"));

        // Owner registration with 'dueno'
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Mario Dueño",
                            "email": "mario.dueno@example.com",
                            "telefono": "999888779",
                            "rol": "dueno",
                            "password": "valid-password-123"
                        }
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.rol").value("dueño"));

        // Owner registration with 'owner'
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Oscar Owner",
                            "email": "oscar.owner@example.com",
                            "telefono": "999888780",
                            "rol": "owner",
                            "password": "valid-password-123"
                        }
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.rol").value("dueño"));

        // Default role when omitted or blank -> 'cliente'
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Default Player",
                            "email": "default.player@example.com",
                            "telefono": "999888781",
                            "password": "valid-password-123"
                        }
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.user.rol").value("cliente"));
    }

    @Test
    void registerRejectsAdminAndPrivilegeEscalationAttemptsViaEndpointWithoutWriting() throws Exception {
        MockMvc mvc = refreshMvc(new AuthTokenService("unit-test-only-secret"));
        String[] privilegedRoles = new String[]{"admin", "administrador", "ADMIN", "ADMINISTRADOR", "admin_dueno", "dueno_admin", "superadmin", "root"};

        for (String privilegedRole : privilegedRoles) {
            String testEmail = "escalation." + privilegedRole.toLowerCase() + "@example.com";
            mvc.perform(post("/api/auth/register").contentType("application/json")
                    .content("""
                            {
                                "nombre": "Hacker Attempt",
                                "email": "%s",
                                "telefono": "999000111",
                                "rol": "%s",
                                "password": "valid-password-123"
                            }
                            """.formatted(testEmail, privilegedRole)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("Rol de registro no permitido"));

            Integer count = jdbc.queryForObject("select count(*) from usuario where lower(correo) = ?", Integer.class, testEmail);
            assertEquals(0, count, "Privilege escalation attempt must not write to database: " + privilegedRole);
        }
    }

    @Test
    void registerRejectsUnknownAndInternalRolesViaEndpointWithoutWriting() throws Exception {
        MockMvc mvc = refreshMvc(new AuthTokenService("unit-test-only-secret"));
        String[] invalidRoles = new String[]{"operador", "cajero", "caja", "arbitrario", "guest", "undefined"};

        for (String invalidRole : invalidRoles) {
            String testEmail = "invalid." + invalidRole.toLowerCase() + "@example.com";
            mvc.perform(post("/api/auth/register").contentType("application/json")
                    .content("""
                            {
                                "nombre": "Invalid Role Attempt",
                                "email": "%s",
                                "telefono": "999000222",
                                "rol": "%s",
                                "password": "valid-password-123"
                            }
                            """.formatted(testEmail, invalidRole)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("Rol de registro no permitido"));

            Integer count = jdbc.queryForObject("select count(*) from usuario where lower(correo) = ?", Integer.class, testEmail);
            assertEquals(0, count, "Invalid role attempt must not write to database: " + invalidRole);
        }
    }

    @Test
    void registerRejectsWhenCatalogLacksRequestedRoleWithoutFallingBackToAdmin() throws Exception {
        MockMvc mvc = refreshMvc(new AuthTokenService("unit-test-only-secret"));
        // Make 'cliente' inactive so ONLY 'admin' (id_rol = 1) is active in the catalog
        jdbc.update("update rol set estado = 'I' where id_rol = 2");

        String testEmail = "no.fallback@example.com";
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "No Fallback Player",
                            "email": "%s",
                            "telefono": "999000333",
                            "rol": "jugador",
                            "password": "valid-password-123"
                        }
                        """.formatted(testEmail)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("El rol solicitado no se encuentra disponible"));

        // Crucial security check: Ensure the user was NEVER inserted with admin (id_rol = 1) or any role
        Integer count = jdbc.queryForObject("select count(*) from usuario where lower(correo) = ?", Integer.class, testEmail);
        assertEquals(0, count, "No user must be created when the requested role is unavailable");
    }

    @Test
    void registerRejectsInvalidInputWithoutWritingToDatabase() throws Exception {
        MockMvc mvc = refreshMvc(new AuthTokenService("unit-test-only-secret"));

        // 1. Missing/blank name
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "   ",
                            "email": "valid@example.com",
                            "telefono": "999000444",
                            "rol": "jugador",
                            "password": "valid-password-123"
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("El nombre es obligatorio"));

        // 2. Missing/blank email
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Valid Name",
                            "email": "   ",
                            "telefono": "999000444",
                            "rol": "jugador",
                            "password": "valid-password-123"
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("El correo electrónico es obligatorio"));

        // 3. Malformed email
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Valid Name",
                            "email": "not-an-email",
                            "telefono": "999000444",
                            "rol": "jugador",
                            "password": "valid-password-123"
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("El correo electrónico no es válido"));

        // 4. Short password (< 8 chars)
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Valid Name",
                            "email": "shortpass@example.com",
                            "telefono": "999000444",
                            "rol": "jugador",
                            "password": "123"
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("La contraseña debe contener al menos 8 caracteres"));

        // 5. Password > 72 bytes
        String tooLongPass = "a".repeat(73);
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Valid Name",
                            "email": "longpass@example.com",
                            "telefono": "999000444",
                            "rol": "jugador",
                            "password": "%s"
                        }
                        """.formatted(tooLongPass)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("La contraseña no debe exceder 72 bytes"));

        // 6. Duplicate email
        mvc.perform(post("/api/auth/register").contentType("application/json")
                .content("""
                        {
                            "nombre": "Duplicate Test",
                            "email": "dueno@canchero.pe",
                            "telefono": "999000444",
                            "rol": "jugador",
                            "password": "valid-password-123"
                        }
                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("El email ya está registrado"));

        // Verify no stray users were written
        Integer count = jdbc.queryForObject("select count(*) from usuario where lower(correo) in ('valid@example.com', 'shortpass@example.com', 'longpass@example.com')", Integer.class);
        assertEquals(0, count, "No invalid user must be written to the database");
    }

    @Test
    void loginAndSessionAuthenticationRemainFunctionalWithoutRegression() throws Exception {
        MockMvc mvc = refreshMvc(new AuthTokenService("unit-test-only-secret"));

        // Existing owner login
        String loginBody = mvc.perform(post("/api/auth/login").contentType("application/json")
                .content("""
                        {
                            "email": "dueno@canchero.pe",
                            "password": "unit-test-only-password"
                        }
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.user.email").value("dueno@canchero.pe"))
                .andExpect(jsonPath("$.user.rol").value("admin"))
                .andReturn().getResponse().getContentAsString();

        String token = new ObjectMapper().readTree(loginBody).get("token").asText();
        assertNotNull(token);

        // Access /api/auth/me with the issued token
        mvc.perform(get("/api/auth/me").header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.email").value("dueno@canchero.pe"));
    }
}
