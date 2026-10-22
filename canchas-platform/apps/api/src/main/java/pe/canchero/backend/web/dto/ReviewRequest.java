package pe.canchero.backend.web.dto;

import com.fasterxml.jackson.annotation.JsonAlias;

public record ReviewRequest(
        @JsonAlias({"sedeId", "venueId"}) int sedeId,
        @JsonAlias({"clienteId", "playerId"}) String clienteId,
        @JsonAlias({"reservaId", "bookingId"}) String reservaId,
        int puntuacion,
        String comentario) {
}