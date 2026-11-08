package pe.canchero.backend.web.dto;

import com.fasterxml.jackson.annotation.JsonInclude;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record CourtReportResponse(
        int id,
        int canchaId,
        String nombreCancha,
        int sedeId,
        String nombreSede,
        String usuarioId,
        String usuarioNombre,
        String tipoProblema,
        String descripcion,
        String estado,
        String prioridad,
        String resolucion,
        String fechaResolucion,
        String fechaCreacion) {
}

