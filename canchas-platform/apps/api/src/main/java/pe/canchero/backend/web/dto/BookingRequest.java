package pe.canchero.backend.web.dto;

import java.util.List;

public record BookingRequest(
        String courtName,
        String venueName,
        String venueId,
        String courtId,
        String playerId,
        String fecha,
        String horario,
        double total,
        String metodoPago,
        List<String> jugadores,
        List<Integer> hours,
        String idempotencyKey,
        String paymentOutcome,
        String cardNumber,
        String cardHolder) {

    public BookingRequest(
            String courtName,
            String venueName,
            String venueId,
            String courtId,
            String playerId,
            String fecha,
            String horario,
            double total,
            String metodoPago,
            List<String> jugadores,
            List<Integer> hours,
            String idempotencyKey) {
        this(courtName, venueName, venueId, courtId, playerId, fecha, horario, total, metodoPago, jugadores, hours, idempotencyKey, null, null, null);
    }

    public BookingRequest(
            String courtName,
            String venueName,
            String venueId,
            String courtId,
            String playerId,
            String fecha,
            String horario,
            double total,
            String metodoPago,
            List<String> jugadores) {
        this(courtName, venueName, venueId, courtId, playerId, fecha, horario, total, metodoPago, jugadores, null, null, null, null, null);
    }
}