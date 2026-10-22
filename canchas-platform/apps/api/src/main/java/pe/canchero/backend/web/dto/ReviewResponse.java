package pe.canchero.backend.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReviewResponse(
        String id,
        String sedeId,
        String clienteNombre,
        int puntuacion,
        String comentario,
        String fecha) {
}