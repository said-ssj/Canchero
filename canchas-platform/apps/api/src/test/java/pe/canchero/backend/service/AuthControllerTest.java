package pe.canchero.backend.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.CannotGetJdbcConnectionException;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.web.controller.AuthController;
import java.util.Optional;
import java.util.UUID;
import pe.canchero.backend.web.dto.AuthResponse;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.LoginRequest;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthControllerTest {
    private static class UnavailableData extends SupabaseDataService {
        int reads;
        UnavailableData() { super(null, null); }
        @Override public Optional<AuthResponse> login(LoginRequest request) {
            reads++;
            throw new CannotGetJdbcConnectionException("private connection details");
        }
        @Override public Optional<AuthUserDto> currentUser(UUID id) {
            reads++;
            throw new CannotGetJdbcConnectionException("private connection details");
        }
    }
    private UnavailableData data;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        data = new UnavailableData();
        mvc = MockMvcBuilders.standaloneSetup(new AuthController(data, new AuthTokenService("unit-test-only-secret"))).build();
    }

    @Test
    void refusesLoginWhenDatabaseIsUnavailableWithoutExposingConnectionDetails() throws Exception {
        mvc.perform(post("/api/auth/login").contentType("application/json")
                .content("{\"email\":\"dueno@canchero.pe\",\"password\":\"unit-test-only\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.message").value("No se pudo validar la cuenta con la base de datos. Intentalo nuevamente."));
    }

    @Test
    void rejectsMissingTokenWithoutReadingUserProfiles() throws Exception {
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        assertEquals(0, data.reads);
    }
}
