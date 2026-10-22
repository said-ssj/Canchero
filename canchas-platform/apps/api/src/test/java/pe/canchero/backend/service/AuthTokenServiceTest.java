package pe.canchero.backend.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

class AuthTokenServiceTest {
    static final String SECRET = "unit-test-only-secret";
    static final Instant NOW = Instant.parse("2026-10-16T12:00:00Z");
    private final UUID userId = UUID.randomUUID();

    static AuthTokenService at(Instant instant) {
        return new AuthTokenService(SECRET, Clock.fixed(instant, ZoneOffset.UTC));
    }

    static String signed(String payload) throws Exception {
        String encoded = Base64.getUrlEncoder().withoutPadding().encodeToString(payload.getBytes(StandardCharsets.UTF_8));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String signature = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(mac.doFinal(encoded.getBytes(StandardCharsets.UTF_8)));
        return "canchero.v1." + encoded + "." + signature;
    }

    private void assertUnauthorized(Runnable action) {
        assertEquals(HttpStatus.UNAUTHORIZED, assertThrows(ResponseStatusException.class, action::run).getStatusCode());
    }

    @Test
    void expiresAtExactBoundaryForBothPolicies() {
        for (boolean remember : new boolean[]{true, false}) {
            long ttl = remember ? 604800 : 900;
            String token = at(NOW).issue(userId, remember);
            assertEquals(userId, at(NOW.plusSeconds(ttl - 1)).verify(token));
            assertUnauthorized(() -> at(NOW.plusSeconds(ttl)).verify(token));
            assertUnauthorized(() -> at(NOW.plusSeconds(ttl)).renew(token));
        }
    }

    @Test
    void renewsFromCurrentTimeAndPreservesSignedPolicy() {
        for (boolean remember : new boolean[]{true, false}) {
            long ttl = remember ? 604800 : 900;
            String token = at(NOW).issue(userId, remember);
            String renewed = at(NOW.plusSeconds(600)).renew(token);
            assertNotEquals(token, renewed);
            assertEquals(userId, at(NOW.plusSeconds(600 + ttl - 1)).verify(renewed));
            assertUnauthorized(() -> at(NOW.plusSeconds(600 + ttl)).verify(renewed));
        }
    }

    @Test
    void acceptsLegacyTokensAndRenewsWithSevenDayPolicy() throws Exception {
        String legacy = signed(userId + ":" + NOW.plusSeconds(1200).getEpochSecond());
        assertEquals(userId, at(NOW).verify(legacy));
        String renewed = at(NOW.plusSeconds(600)).renew(legacy);
        assertEquals(userId, at(NOW.plusSeconds(600 + 604799)).verify(renewed));
        assertUnauthorized(() -> at(NOW.plusSeconds(600 + 604800)).verify(renewed));
        assertUnauthorized(() -> at(NOW.plusSeconds(1200)).renew(legacy));
        String compatibilityToken = at(NOW).issue(userId);
        assertEquals(userId, at(NOW.plusSeconds(604799)).verify(compatibilityToken));
    }

    @Test
    void rejectsPolicyTamperingAndMalformedSignedClaims() throws Exception {
        String token = at(NOW).issue(userId, false);
        String[] parts = token.split("\\.");
        String payload = new String(Base64.getUrlDecoder().decode(parts[2]), StandardCharsets.UTF_8);
        String changed = Base64.getUrlEncoder().withoutPadding()
                .encodeToString(payload.replace(":false", ":true").getBytes(StandardCharsets.UTF_8));
        String tampered = "canchero.v1." + changed + "." + parts[3];
        assertUnauthorized(() -> at(NOW).verify(tampered));
        assertUnauthorized(() -> at(NOW).renew(tampered));
        for (String malformed : new String[]{userId + ":invalid:false", "invalid:9999999999:true",
                userId + ":9999999999:yes", userId + ":9999999999:", userId + ":9999999999:true:extra"}) {
            String signed = signed(malformed);
            assertUnauthorized(() -> at(NOW).verify(signed));
        }
        for (String invalid : new String[]{null, "", "invalid", token + ".", token.substring(0, token.lastIndexOf('.'))}) {
            assertUnauthorized(() -> at(NOW).verify(invalid));
        }
    }
}
