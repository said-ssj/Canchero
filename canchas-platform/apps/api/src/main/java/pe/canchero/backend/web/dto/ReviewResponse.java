package pe.canchero.backend.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record ReviewResponse(
        String id,
        String sedeId,
        String clienteNombre,
        int puntuacion,
        String comentario,
        String fecha,
        Integer canchaId,
        String canchaNombre) {

    public ReviewResponse(String id, String sedeId, String clienteNombre, int puntuacion, String comentario, String fecha) {
        this(id, sedeId, clienteNombre, puntuacion, comentario, fecha, null, null);
    }
}
