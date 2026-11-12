package pe.canchero.backend.web.controller;

import com.fasterxml.jackson.databind.JsonNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.time.Duration;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.AuthService;
import pe.canchero.backend.web.dto.AuthResponse;

@RestController
@RequestMapping("/api/auth/google")
@ConditionalOnProperty(name = "GOOGLE_AUTH_ENABLED", havingValue = "true")
public class GoogleAuthController {
    private final RestClient supabase;
    private final AuthService data;

    @Autowired
    public GoogleAuthController(AuthService data,
            @Value("${SUPABASE_URL}") String projectUrl,
            @Value("${SUPABASE_ANON_KEY}") String publicKey) {
        this(data, buildClient(projectUrl, publicKey));
    }

    GoogleAuthController(AuthService data, RestClient supabase) {
        this.data = data;
        this.supabase = supabase;
    }

    private static RestClient buildClient(String projectUrl, String publicKey) {
        URI uri = URI.create(projectUrl);
        if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null
                || uri.getQuery() != null || uri.getFragment() != null
                || !uri.getPath().matches("/?") || publicKey.isBlank() || publicKey.startsWith("sb_secret_")) {
            throw new IllegalArgumentException("Configura SUPABASE_URL y la clave pública de Supabase para Google Auth");
        }
        var factory = new JdkClientHttpRequestFactory(HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5)).build());
        factory.setReadTimeout(Duration.ofSeconds(7));
        return RestClient.builder().baseUrl(projectUrl.replaceAll("/+$", ""))
                .defaultHeader("apikey", publicKey).requestFactory(factory).build();
    }

    @PostMapping
    public AuthResponse exchange(@RequestBody GoogleRequest request) {
        if (request.accessToken() == null || !request.accessToken().matches("[A-Za-z0-9._-]{1,8192}")) {
            throw invalidIdentity();
        }
        JsonNode user;
        try {
            user = supabase.get().uri("/auth/v1/user")
                    .headers(headers -> headers.setBearerAuth(request.accessToken()))
                    .retrieve().body(JsonNode.class);
        } catch (HttpClientErrorException ex) {
            if (ex.getResponseBodyAsString().contains("Invalid API key")) {
                throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                        "La clave pública de Supabase necesita actualizarse en el servidor");
            }
            if (ex.getStatusCode().value() == 401 || ex.getStatusCode().value() == 403) throw invalidIdentity();
            throw unavailable();
        } catch (RestClientException ex) {
            throw unavailable();
        }
        if (user == null || user.path("email_confirmed_at").asText("").isBlank()) throw invalidIdentity();
        boolean google = false;
        for (JsonNode identity : user.path("identities")) {
            if ("google".equals(identity.path("provider").asText())) google = true;
        }
        if (!google) throw invalidIdentity();
        UUID authId;
        try {
            authId = UUID.fromString(user.path("id").asText());
        } catch (IllegalArgumentException ex) {
            throw invalidIdentity();
        }
        return data.loginGoogle(authId, user.path("email").asText(),
                user.path("user_metadata").path("full_name").asText(""),
                request.password(), request.rememberMe());
    }

    private ResponseStatusException invalidIdentity() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No se pudo verificar la cuenta de Google");
    }

    private ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google no está disponible en este momento");
    }

    public record GoogleRequest(String accessToken, String password, boolean rememberMe) {}
}
