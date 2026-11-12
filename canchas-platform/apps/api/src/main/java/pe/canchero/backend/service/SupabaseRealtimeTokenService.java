package pe.canchero.backend.service;

import com.nimbusds.jose.JOSEException;
import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JOSEObjectType;
import com.nimbusds.jose.crypto.MACSigner;
import com.nimbusds.jwt.JWTClaimsSet;
import com.nimbusds.jwt.SignedJWT;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.util.Date;
import java.util.UUID;

/** Puente explícito: la sesión de Spring nunca se envía como JWT a Supabase. */
@Service
public class SupabaseRealtimeTokenService {
    private final boolean enabled;
    private final String projectUrl;
    private final String secret;
    private final Clock clock;

    @Autowired
    public SupabaseRealtimeTokenService(@Value("${SUPABASE_REALTIME_AUTH_ENABLED:false}") boolean enabled,
            @Value("${SUPABASE_URL:}") String projectUrl,
            @Value("${SUPABASE_REALTIME_JWT_SECRET:}") String secret) {
        this(enabled, projectUrl, secret, Clock.systemUTC());
    }

    SupabaseRealtimeTokenService(boolean enabled, String projectUrl, String secret, Clock clock) {
        this.enabled = enabled;
        this.projectUrl = projectUrl.replaceAll("/+$", "");
        this.secret = secret;
        this.clock = clock;
        if (enabled) {
            URI url = URI.create(this.projectUrl);
            if (!"https".equals(url.getScheme()) || url.getHost() == null || url.getUserInfo() != null
                    || !url.getPath().isEmpty() || url.getQuery() != null || url.getFragment() != null
                    || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
                throw new IllegalArgumentException("Configura el proyecto y su firma JWT de Realtime en el servidor");
            }
        }
    }

    public Token issue(UUID userId, long sessionExpiresAt) {
        if (!enabled) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "La autenticación de Realtime todavía no está configurada");
        long now = clock.instant().getEpochSecond();
        long expires = Math.min(now + 300, sessionExpiresAt);
        if (expires <= now) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión expirada");
        var claims = new JWTClaimsSet.Builder()
                .issuer(projectUrl + "/auth/v1").audience("authenticated")
                .subject(userId.toString()).issueTime(new Date(now * 1000)).expirationTime(new Date(expires * 1000))
                .jwtID(UUID.randomUUID().toString()).claim("role", "authenticated")
                .claim("canchero_user_id", userId.toString()).build();
        var jwt = new SignedJWT(new JWSHeader.Builder(JWSAlgorithm.HS256).type(JOSEObjectType.JWT).build(), claims);
        try {
            jwt.sign(new MACSigner(secret.getBytes(StandardCharsets.UTF_8)));
        } catch (JOSEException ex) {
            throw new IllegalStateException("No se pudo emitir la credencial de Realtime", ex);
        }
        return new Token(jwt.serialize(), expires, userId.toString());
    }

    public record Token(String accessToken, long expiresAt, String userId) {}
}
