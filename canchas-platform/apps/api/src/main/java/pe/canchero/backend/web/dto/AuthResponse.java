package pe.canchero.backend.web.dto;

public record AuthResponse(
        String token,
        AuthUserDto user) {
}