package pe.canchero.backend.web.dto;

import pe.canchero.backend.domain.entity.User;

public record AuthResponse(
        String token,
        AuthUserDto user) {

    public static AuthResponse from(User user) {
        return new AuthResponse(
                "demo-token-" + user.getId(),
                new AuthUserDto(user.getId(), user.getNombre(), user.getEmail(), user.getTelefono(), user.getRol().name()));
    }
}