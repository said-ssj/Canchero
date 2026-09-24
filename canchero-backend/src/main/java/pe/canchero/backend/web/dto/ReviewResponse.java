package pe.canchero.backend.web.dto;

import pe.canchero.backend.domain.entity.Review;

public record ReviewResponse(
        String id,
        String venueId,
        String playerName,
        int puntuacion,
        String comentario,
        String bookingCodigoPase,
        String fecha) {

    public static ReviewResponse from(Review review) {
        return new ReviewResponse(
                review.getId(),
                review.getVenue().getId(),
                review.getPlayer().getNombre(),
                review.getPuntuacion(),
                review.getComentario(),
                review.getBooking().getCodigoPase(),
                review.getFecha() != null ? review.getFecha().toString() : null);
    }
}