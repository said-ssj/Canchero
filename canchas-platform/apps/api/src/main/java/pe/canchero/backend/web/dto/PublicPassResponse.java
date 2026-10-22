package pe.canchero.backend.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record PublicPassResponse(
        String id,
        String codigoPase,
        String courtName,
        String venueName,
        String fecha,
        String horario,
        String status,
        String titularNombre) {
}
