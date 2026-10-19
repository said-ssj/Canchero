package pe.canchero.backend.config;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;
import pe.canchero.backend.service.AuthTokenService;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.web.dto.AuthUserDto;

import java.io.IOException;
import java.util.Locale;
import java.util.UUID;

@Component
public class ApiAuthorizationInterceptor implements HandlerInterceptor {

    private final AuthTokenService authTokenService;
    private final SupabaseDataService data;

    public ApiAuthorizationInterceptor(AuthTokenService authTokenService, SupabaseDataService data) {
        this.authTokenService = authTokenService;
        this.data = data;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) throws Exception {
        String method = request.getMethod();
        if ("OPTIONS".equalsIgnoreCase(method)) {
            return true;
        }

        String path = request.getRequestURI();
        if (!path.startsWith("/api/") || isPublicEndpoint(path, method)) {
            return true;
        }

        AuthUserDto user = currentUser(request);
        if (requiresOwnerOrAdmin(path, method) && !isOwnerOrAdmin(user.rol())) {
            writeError(response, HttpStatus.FORBIDDEN, "No tienes permisos para realizar esta operación");
            return false;
        }

        request.setAttribute("auth.user", user);
        return true;
    }

    private boolean isPublicEndpoint(String path, String method) {
        if (path.startsWith("/api/auth/login") || path.startsWith("/api/auth/register")) return true;
        if (path.startsWith("/api/catalog")) return true;
        if ("GET".equalsIgnoreCase(method) && (path.startsWith("/api/venues") || path.startsWith("/api/courts"))) return true;
        if ("GET".equalsIgnoreCase(method) && path.startsWith("/api/bookings/pase/")) return true;
        if ("GET".equalsIgnoreCase(method) && path.startsWith("/api/reviews")) return true;
        return false;
    }

    private static final java.util.Set<String> OWNER_OR_ADMIN_ROLES = java.util.Set.of(
            "admin", "administrador",
            "dueno", "dueño", "owner", "propietario"
    );

    private boolean requiresOwnerOrAdmin(String path, String method) {
        if (path.startsWith("/api/cash")) return true;
        if (path.startsWith("/api/pos")) return true;
        if (path.startsWith("/api/cajas")) return true;
        if (path.startsWith("/api/sesiones-caja")) return true;
        if (path.startsWith("/api/movimientos-caja")) return true;
        if (path.startsWith("/api/ventas")) return true;
        if (path.startsWith("/api/productos")) return true;
        if ("GET".equalsIgnoreCase(method) && path.matches("^/api/pagos-reserva/reserva/\\d+$")) {
            return false;
        }
        if (path.startsWith("/api/pagos-reserva")) return true;
        if (path.startsWith("/api/venues") && !"GET".equalsIgnoreCase(method)) return true;
        if (path.startsWith("/api/courts") && !"GET".equalsIgnoreCase(method)) return true;
        if ("PATCH".equalsIgnoreCase(method) && path.matches("^/api/bookings/\\d+/cancel$")) {
            return false;
        }
        return path.startsWith("/api/bookings") && !"GET".equalsIgnoreCase(method) && !"POST".equalsIgnoreCase(method);
    }

    private AuthUserDto currentUser(HttpServletRequest request) throws IOException {
        String authorization = request.getHeader("Authorization");
        if (authorization == null || !authorization.startsWith("Bearer ")) {
            throwUnauthorized();
        }

        UUID userId = authTokenService.verify(authorization.substring("Bearer ".length()).trim());
        return data.currentUser(userId).orElseThrow(() -> unauthorizedException());
    }

    private boolean isOwnerOrAdmin(String role) {
        String normalized = role == null ? "" : role.trim().toLowerCase(Locale.ROOT);
        return OWNER_OR_ADMIN_ROLES.contains(normalized);
    }

    private void throwUnauthorized() {
        throw unauthorizedException();
    }

    private RuntimeException unauthorizedException() {
        return new org.springframework.web.server.ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
    }

    private void writeError(HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType("application/json");
        response.setCharacterEncoding("UTF-8");
        response.getWriter().write("{\"message\":\"" + message.replace("\"", "\\\"") + "\"}");
    }
}
