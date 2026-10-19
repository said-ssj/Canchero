package pe.canchero.backend.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Base64;
import java.util.UUID;

@Service
public class AuthTokenService {

    private static final String PREFIX = "canchero.v1";
    private static final long TOKEN_TTL_SECONDS = 60L * 60L * 24L * 7L;
    private static final long SESSION_TTL_SECONDS = 60L * 15L;

    private final String secret;
    private final Clock clock;

    @Autowired
    public AuthTokenService(@Value("${app.auth.token-secret:${SUPABASE_JWT_SECRET}}") String secret) {
        this(secret, Clock.systemUTC());
    }

    public AuthTokenService(String secret, Clock clock) {
        this.secret = secret;
        this.clock = clock;
    }

    public String issue(UUID userId) {
        return issue(userId, true);
    }

    public String issue(UUID userId, boolean rememberMe) {
        long expiresAt = clock.instant().getEpochSecond() + (rememberMe ? TOKEN_TTL_SECONDS : SESSION_TTL_SECONDS);
        String payload = userId + ":" + expiresAt + ":" + rememberMe;
        String encodedPayload = base64Url(payload.getBytes(StandardCharsets.UTF_8));
        String signature = sign(encodedPayload);
        return PREFIX + "." + encodedPayload + "." + signature;
    }

    public UUID verify(String token) {
        return verifiedClaims(token).userId();
    }

    public String renew(String token) {
        TokenClaims claims = verifiedClaims(token);
        return issue(claims.userId(), claims.rememberMe());
    }

    private TokenClaims verifiedClaims(String token) {
        if (token == null || token.isBlank()) {
            throw unauthorized();
        }
        String[] parts = token.split("\\.", -1);
        if (parts.length != 4 || !PREFIX.equals(parts[0] + "." + parts[1])) {
            throw unauthorized();
        }
        String encodedPayload = parts[2];
        String expectedSignature = sign(encodedPayload);
        if (!constantTimeEquals(expectedSignature, parts[3])) {
            throw unauthorized();
        }

        try {
            String payload = new String(Base64.getUrlDecoder().decode(encodedPayload), StandardCharsets.UTF_8);
            String[] payloadParts = payload.split(":", -1);
            if (payloadParts.length != 2 && payloadParts.length != 3) {
                throw unauthorized();
            }
            boolean rememberMe = true;
            if (payloadParts.length == 3) {
                if (!"true".equals(payloadParts[2]) && !"false".equals(payloadParts[2])) {
                    throw unauthorized();
                }
                rememberMe = Boolean.parseBoolean(payloadParts[2]);
            }
            long expiresAt = Long.parseLong(payloadParts[1]);
            if (clock.instant().getEpochSecond() >= expiresAt) {
                throw unauthorized();
            }
            return new TokenClaims(UUID.fromString(payloadParts[0]), rememberMe);
        } catch (IllegalArgumentException ex) {
            throw unauthorized();
        }
    }

    private record TokenClaims(UUID userId, boolean rememberMe) {}

    private String sign(String encodedPayload) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return base64Url(mac.doFinal(encodedPayload.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException("No se pudo firmar el token de autenticación", ex);
        }
    }

    private String base64Url(byte[] bytes) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private boolean constantTimeEquals(String a, String b) {
        if (a == null || b == null) return false;
        int result = a.length() ^ b.length();
        for (int i = 0; i < Math.min(a.length(), b.length()); i++) {
            result |= a.charAt(i) ^ b.charAt(i);
        }
        return result == 0;
    }

    private ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
    }
}
