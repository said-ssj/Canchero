package pe.canchero.backend.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import pe.canchero.backend.service.AuthService;
import pe.canchero.backend.service.AuthTokenService;
import pe.canchero.backend.web.dto.AuthUserDto;
import java.util.Optional;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ApiAuthorizationInterceptorTest {
    @Test void blocksPlayerFromPanel() throws Exception { check("jugador", false, "/api/pos/sales", "POST", false); }
    @Test void permitsOwnerThroughPanelGate() throws Exception { check("dueno", false, "/api/pos/sales", "POST", true); }
    @Test void permitsAssignedCashierThroughPanelGate() throws Exception { check("cajero", true, "/api/pos/sales", "POST", true); }
    @Test void blocksUnassignedCashier() throws Exception { check("cajero", false, "/api/pos/sales", "POST", false); }
    @Test void permitsPlayerCancellationForControllerOwnershipValidation() throws Exception { check("jugador", false, "/api/bookings/12/cancel", "PATCH", true); }
    @Test void requiresSessionForPrivateProfile() {
        var interceptor = new ApiAuthorizationInterceptor(mock(AuthTokenService.class), mock(AuthService.class));
        assertThrows(org.springframework.web.server.ResponseStatusException.class,
            () -> interceptor.preHandle(new MockHttpServletRequest("GET", "/api/auth/profile"), new MockHttpServletResponse(), new Object()));
    }
    private void check(String role, boolean assigned, String path, String method, boolean allowed) throws Exception {
        var tokens = mock(AuthTokenService.class); var auth = mock(AuthService.class);
        UUID id = UUID.randomUUID(); var user = new AuthUserDto(id.toString(), "Prueba", "prueba@example.test", "", role);
        when(tokens.verify("test-token")).thenReturn(id);
        when(auth.currentUser(id)).thenReturn(Optional.of(user));
        when(auth.hasStaffAssignment(user)).thenReturn(assigned);
        var request = new MockHttpServletRequest(method, path); request.addHeader("Authorization", "Bearer test-token");
        var response = new MockHttpServletResponse();
        assertEquals(allowed, new ApiAuthorizationInterceptor(tokens, auth).preHandle(request, response, new Object()));
        if (allowed) assertSame(user, request.getAttribute("auth.user"));
        else assertEquals(403, response.getStatus());
    }
}
