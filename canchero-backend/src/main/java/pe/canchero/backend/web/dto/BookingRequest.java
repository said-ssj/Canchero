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
        List<String> jugadores) {
}