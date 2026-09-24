package pe.canchero.backend.web.dto;

import pe.canchero.backend.domain.entity.Booking;
import pe.canchero.backend.domain.enums.BookingStatus;

import java.util.List;

public record BookingResponse(
        String id,
        String codigoPase,
        String courtName,
        String venueName,
        String venueId,
        String fecha,
        String horario,
        double total,
        String status,
        List<String> jugadores) {

    public static BookingResponse from(Booking booking) {
        return new BookingResponse(
                booking.getId(),
                booking.getCodigoPase(),
                booking.getCourtName(),
                booking.getVenueName(),
                booking.getVenueId(),
                booking.getFecha(),
                booking.getHorario(),
                booking.getMontoTotal(),
                toFrontendStatus(booking.getEstado()),
                booking.getJugadores());
    }

    private static String toFrontendStatus(BookingStatus status) {
        return switch (status) {
            case PENDING -> "PENDIENTE";
            case CONFIRMED -> "CONFIRMADO";
            case COMPLETED -> "FINALIZADO";
            case CANCELLED -> "CANCELADO";
        };
    }
}