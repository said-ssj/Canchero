package pe.canchero.backend.web.dto;

import pe.canchero.backend.domain.entity.User;

public record LoginRequest(
        String email,
        String password) {
}