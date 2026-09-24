package pe.canchero.backend.web.dto;

public record RegisterRequest(
        String nombre,
        String email,
        String telefono,
        String rol,
        String password) {
}