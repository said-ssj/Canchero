package pe.canchero.backend.web.dto;

public record UserDto(
        String id,
        String nombre,
        String email,
        String telefono,
        String rol,
        String estado
) {}
