package pe.canchero.backend.web.controller;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.*;
import pe.canchero.backend.web.dto.AuthUserDto;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RealtimeAuthControllerTest {
    final AuthTokenService sessions = new AuthTokenService("local-session-test-secret");
    final AuthService accounts = mock(AuthService.class);
    final SupabaseRealtimeTokenService realtime = mock(SupabaseRealtimeTokenService.class);
    final RealtimeAuthController controller = new RealtimeAuthController(sessions, accounts, realtime);

    @Test void rejectsMissingForgedAndInactiveAccounts() {
        for (String token : Arrays.asList(null, "Bearer forged", "Bearer " + sessions.issue(UUID.randomUUID()))) {
            assertEquals(HttpStatus.UNAUTHORIZED, assertThrows(ResponseStatusException.class,
                    () -> controller.exchange(token)).getStatusCode());
        }
        verifyNoInteractions(realtime);
    }
    @Test void derivesIdentityFromTheVerifiedSessionAndNeverFromRequestData() {
        UUID id = UUID.randomUUID();
        String session = sessions.issue(id, false);
        when(accounts.currentUser(id)).thenReturn(Optional.of(new AuthUserDto(id.toString(), "Dueño", "owner@example.test", "", "dueno")));
        when(realtime.issue(id, sessions.expiresAt(session))).thenReturn(new SupabaseRealtimeTokenService.Token("jwt", 123L, id.toString()));
        var response = controller.exchange("Bearer " + session);
        assertEquals("no-store", response.getHeaders().getFirst("Cache-Control"));
        assertEquals(id.toString(), response.getBody().userId());
        verify(realtime).issue(id, sessions.expiresAt(session));
    }
}
