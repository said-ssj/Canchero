package pe.canchero.backend.web.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

public record CourtReportRequest(
        @JsonAlias({"idCancha", "courtId"}) int canchaId,
        @JsonAlias({"tipoProblema", "tipo", "issueType"}) String tipoProblema,
        @JsonAlias({"descripcion", "description", "detalle"}) String descripcion,
        @JsonAlias({"prioridad", "priority"}) String prioridad) {
}

