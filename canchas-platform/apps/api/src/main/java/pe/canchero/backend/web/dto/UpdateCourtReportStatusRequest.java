package pe.canchero.backend.web.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

public record UpdateCourtReportStatusRequest(
        @JsonAlias({"estado", "status"}) String estado,
        @JsonAlias({"resolucion", "resolution", "comentario"}) String resolucion) {
}

