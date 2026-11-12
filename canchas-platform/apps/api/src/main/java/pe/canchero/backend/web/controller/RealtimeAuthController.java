package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.AuthService;
import pe.canchero.backend.service.AuthTokenService;
import pe.canchero.backend.service.SupabaseRealtimeTokenService;

@RestController
@RequestMapping("/api/auth/realtime-token")
public class RealtimeAuthController {
    private final AuthTokenService sessions;
    private final AuthService accounts;
    private final SupabaseRealtimeTokenService realtime;

    public RealtimeAuthController(AuthTokenService sessions, AuthService accounts, SupabaseRealtimeTokenService realtime) {
        this.sessions = sessions;
        this.accounts = accounts;
        this.realtime = realtime;
    }

    @PostMapping
    public ResponseEntity<SupabaseRealtimeTokenService.Token> exchange(
            @RequestHeader(value = "Authorization", required = false) String authorization) {
        if (authorization == null || !authorization.startsWith("Bearer ")) throw unauthorized();
        String token = authorization.substring(7).trim();
        var userId = sessions.verify(token);
        // Ni el navegador ni los metadatos de Google deciden la identidad o sus permisos.
        if (accounts.currentUser(userId).isEmpty()) throw unauthorized();
        return ResponseEntity.ok().header("Cache-Control", "no-store").header("Pragma", "no-cache")
                .body(realtime.issue(userId, sessions.expiresAt(token)));
    }

    private ResponseStatusException unauthorized() {
        return new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
    }
}
