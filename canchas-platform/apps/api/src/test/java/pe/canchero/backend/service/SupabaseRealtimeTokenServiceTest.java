package pe.canchero.backend.service;

import com.nimbusds.jose.crypto.MACVerifier;
import com.nimbusds.jwt.SignedJWT;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.*;
import java.util.UUID;
import static org.junit.jupiter.api.Assertions.*;

class SupabaseRealtimeTokenServiceTest {
    private static final String SECRET = "unit-test-supabase-signature-at-least-32-bytes";
    private static final long NOW = 1794434400L;
    private SupabaseRealtimeTokenService service() {
        return new SupabaseRealtimeTokenService(true, "https://project.supabase.co", SECRET,
                Clock.fixed(Instant.ofEpochSecond(NOW), ZoneOffset.UTC));
    }
    @Test void signsARealJwtWithoutGrantingAppRolesOrPersonalInformation() throws Exception {
        UUID id = UUID.randomUUID();
        var result = service().issue(id, NOW + 900);
        var jwt = SignedJWT.parse(result.accessToken());
        assertTrue(jwt.verify(new MACVerifier(SECRET)));
        assertFalse(jwt.verify(new MACVerifier("different-unit-test-secret-at-least-32-bytes")));
        var claims = jwt.getJWTClaimsSet();
        assertEquals(id.toString(), claims.getSubject());
        assertEquals("authenticated", claims.getStringClaim("role"));
        assertEquals(java.util.List.of("authenticated"), claims.getAudience());
        assertEquals("https://project.supabase.co/auth/v1", claims.getIssuer());
        assertEquals(NOW + 300, result.expiresAt());
        assertNull(claims.getClaim("email"));
        assertNull(claims.getClaim("user_metadata"));
        assertNull(claims.getClaim("app_metadata"));
    }
    @Test void neverOutlivesTheSpringSession() {
        assertEquals(NOW + 20, service().issue(UUID.randomUUID(), NOW + 20).expiresAt());
        var error = assertThrows(ResponseStatusException.class, () -> service().issue(UUID.randomUUID(), NOW));
        assertEquals(HttpStatus.UNAUTHORIZED, error.getStatusCode());
    }
    @Test void configurationFailsClosedWithoutARealSigningSecret() {
        assertThrows(IllegalArgumentException.class, () -> new SupabaseRealtimeTokenService(true,
                "https://project.supabase.co", "", Clock.systemUTC()));
        assertThrows(IllegalArgumentException.class, () -> new SupabaseRealtimeTokenService(true,
                "http://external.invalid", SECRET, Clock.systemUTC()));
        var disabled = new SupabaseRealtimeTokenService(false, "", "", Clock.systemUTC());
        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, assertThrows(ResponseStatusException.class,
                () -> disabled.issue(UUID.randomUUID(), Long.MAX_VALUE)).getStatusCode());
    }
}
