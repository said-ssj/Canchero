package pe.canchero.backend.web.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.AuthService;
import pe.canchero.backend.service.MailService;
import pe.canchero.backend.web.dto.ErrorResponse;

/** "Olvidé mi contraseña": pedir enlace por correo y fijar la nueva contraseña con ese enlace. */
@RestController
@RequestMapping("/api/auth/password")
public class PasswordResetController {
    // Misma respuesta exista o no la cuenta, para no revelar qué correos están registrados.
    private static final String GENERIC = "Si el correo tiene una cuenta, te enviamos un enlace para cambiar tu contraseña.";

    public record ForgotRequest(String email) {}
    public record ResetRequest(String token, String password) {}

    private final AuthService auth;
    private final MailService mail;

    public PasswordResetController(AuthService auth, MailService mail) {
        this.auth = auth;
        this.mail = mail;
    }

    @PostMapping("/forgot")
    public ResponseEntity<ErrorResponse> forgot(@RequestBody(required = false) ForgotRequest request) {
        String email = request == null ? null : request.email();
        auth.requestPasswordReset(email).ifPresent(token -> mail.sendResetLink(email, "Cambia tu contraseña de Canchero",
                "Recibimos un pedido para cambiar tu contraseña.", token));
        return ResponseEntity.ok(new ErrorResponse(GENERIC));
    }

    @PostMapping("/reset")
    public ResponseEntity<ErrorResponse> reset(@RequestBody(required = false) ResetRequest request) {
        try {
            auth.resetPassword(request == null ? null : request.token(), request == null ? null : request.password());
            return ResponseEntity.ok(new ErrorResponse("Contraseña actualizada. Ya puedes iniciar sesión."));
        } catch (ResponseStatusException ex) {
            return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
        }
    }
}
