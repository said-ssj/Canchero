package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.service.AuthTokenService;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.AuthResponse;
import pe.canchero.backend.web.dto.LoginRequest;
import pe.canchero.backend.web.dto.RegisterRequest;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final SupabaseDataService data;
    private final AuthTokenService authTokenService;

    public AuthController(SupabaseDataService data, AuthTokenService authTokenService) {
        this.data = data;
        this.authTokenService = authTokenService;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        return data.login(request)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Credenciales inválidas")));
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody(required = false) RegisterRequest request) {
        try {
            return data.register(request)
                    .<ResponseEntity<?>>map(r -> ResponseEntity.status(HttpStatus.CREATED).body(r))
                    .orElse(ResponseEntity.badRequest().body(new ErrorResponse("Error al registrar")));
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
        } catch (IllegalArgumentException ex) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Datos de registro invalidos; revisa la longitud de la contrasena."));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@RequestHeader(value = "Authorization", required = false) String authorization) {
        try {
            UUID userId = authTokenService.verify(extractBearerToken(authorization));
            return data.currentUser(userId)
                    .<ResponseEntity<?>>map(ResponseEntity::ok)
                    .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Sesión inválida o expirada")));
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
        }
    }

    @PostMapping("/refresh")
    public ResponseEntity<?> refresh(@RequestHeader(value = "Authorization", required = false) String authorization) {
        try {
            String token = extractBearerToken(authorization);
            UUID userId = authTokenService.verify(token);
            return data.currentUser(userId)
                    .<ResponseEntity<?>>map(user -> ResponseEntity.ok(new AuthResponse(authTokenService.renew(token), user)))
                    .orElse(ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Sesion invalida o expirada")));
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
        }
    }

    private String extractBearerToken(String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throw new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        }
        return authorization.substring("Bearer ".length()).trim();
    }

    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<ErrorResponse> databaseUnavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(new ErrorResponse("No se pudo validar la cuenta con la base de datos. Intentalo nuevamente."));
    }
}
