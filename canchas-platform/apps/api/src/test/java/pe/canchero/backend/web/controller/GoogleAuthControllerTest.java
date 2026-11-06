package pe.canchero.backend.web.controller;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.web.dto.AuthResponse;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class GoogleAuthControllerTest {
    private static final String USER_URL = "https://project.example.test/auth/v1/user";
    private final SupabaseDataService data = mock(SupabaseDataService.class);
    private MockRestServiceServer supabase;
    private GoogleAuthController controller;

    @BeforeEach
    void setUp() {
        var builder = RestClient.builder().baseUrl("https://project.example.test");
        supabase = MockRestServiceServer.bindTo(builder).build();
        controller = new GoogleAuthController(data, builder.build());
    }

    @Test
    void invalidTokenNeverReachesBusinessAccount() {
        supabase.expect(requestTo(USER_URL)).andRespond(withUnauthorizedRequest());
        var failure = assertThrows(ResponseStatusException.class,
                () -> controller.exchange(new GoogleAuthController.GoogleRequest("invalid", null, true)));
        assertEquals(HttpStatus.UNAUTHORIZED, failure.getStatusCode());
        verifyNoInteractions(data);
        supabase.verify();
    }

    @Test
    void passesOnlyTheIdentityVerifiedBySupabaseToTheAccountExchange() {
        UUID id = UUID.randomUUID();
        supabase.expect(requestTo(USER_URL)).andExpect(header("Authorization", "Bearer verified.jwt"))
                .andRespond(withSuccess("""
                        {"id":"%s","email":"jugador@example.test","email_confirmed_at":"2026-11-05T00:00:00Z",
                        "identities":[{"provider":"google"}],"user_metadata":{"full_name":"Jugador","role":"admin"}}
                        """.formatted(id), MediaType.APPLICATION_JSON));
        var session = new AuthResponse("app-session", null);
        when(data.loginGoogle(id, "jugador@example.test", "Jugador", "existing-password", false)).thenReturn(session);
        assertSame(session, controller.exchange(new GoogleAuthController.GoogleRequest("verified.jwt", "existing-password", false)));
        supabase.verify();
    }
}
