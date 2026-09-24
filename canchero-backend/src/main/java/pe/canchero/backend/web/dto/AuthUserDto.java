package pe.canchero.backend.web.dto;

public record AuthUserDto(
        String id,
        String nombre,
        String email,
        String telefono,
        String rol) {
}