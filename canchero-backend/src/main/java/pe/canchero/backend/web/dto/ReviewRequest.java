package pe.canchero.backend.web.dto;

public record ReviewRequest(
        String venueId,
        String playerId,
        String bookingId,
        int puntuacion,
        String comentario) {
}