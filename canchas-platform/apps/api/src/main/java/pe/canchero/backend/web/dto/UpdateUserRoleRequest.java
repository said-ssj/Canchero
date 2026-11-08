package pe.canchero.backend.web.dto;

import jakarta.validation.constraints.NotBlank;

public record UpdateUserRoleRequest(
        @NotBlank(message = "El rol es obligatorio")
        String rol
) {}
