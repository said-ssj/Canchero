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
import pe.canchero.backend.service.AuthService;
import pe.canchero.backend.service.LoginIpLimiter;
import pe.canchero.backend.service.MailService;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.AuthResponse;
import pe.canchero.backend.web.dto.LoginRequest;
import pe.canchero.backend.web.dto.RegisterRequest;

import jakarta.servlet.http.HttpServletRequest;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService data;
    private final AuthTokenService authTokenService;
    private final LoginIpLimiter ipLimiter;
    private final MailService mail;

    public AuthController(AuthService data, AuthTokenService authTokenService, LoginIpLimiter ipLimiter, MailService mail) {
        this.data = data;
        this.authTokenService = authTokenService;
        this.ipLimiter = ipLimiter;
        this.mail = mail;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request, HttpServletRequest http) {
        String ip = LoginIpLimiter.clientIp(http);
        if (ipLimiter.bloqueada(ip)) {
            return ResponseEntity.status(HttpStatus.TOO_MANY_REQUESTS).body(new ErrorResponse(
                    "Demasiados intentos fallidos desde tu conexión. Espera 15 minutos o usa \"¿Olvidaste tu contraseña?\"."));
        }
        try {
            var result = data.login(request);
            if (result.isPresent()) return ResponseEntity.ok(result.get());
            ipLimiter.registrarFallo(ip);
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Credenciales inválidas"));
        } catch (org.springframework.web.server.ResponseStatusException ex) {
            ipLimiter.registrarFallo(ip);
            if (ex instanceof AuthService.CuentaRecienBloqueada bloqueo) avisarBloqueo(bloqueo.email);
            return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
        }
    }

    /** El dueño real se entera del bloqueo y puede desbloquear la cuenta con un solo clic. */
    private void avisarBloqueo(String email) {
        String intro = "Tu cuenta se bloqueó tras " + AuthService.INTENTOS_ANTES_DE_BLOQUEO + " intentos fallidos de inicio de sesión. "
                + "Si no fuiste tú, alguien intentó entrar con tu correo. Para desbloquearla, cambia tu contraseña.";
        String asunto = "Tu cuenta de Canchero fue bloqueada";
        data.requestPasswordReset(email).ifPresentOrElse(
                token -> mail.sendResetLink(email, asunto, intro, token),
                // Ya hay un enlace vigente enviado antes: no se reemplaza, solo se avisa.
                () -> mail.sendLater(email, asunto, intro + "\n\nUsa el enlace que ya te enviamos o pide uno nuevo en "
                        + mail.recoverUrl() + " cuando venza."));
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
