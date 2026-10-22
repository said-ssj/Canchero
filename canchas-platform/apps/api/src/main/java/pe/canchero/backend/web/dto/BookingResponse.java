package pe.canchero.backend.web.dto;

import java.util.List;

public record BookingResponse(
        String id,
        String codigoPase,
        String courtId,
        String courtName,
        String venueName,
        String venueId,
        String fecha,
        String horario,
        double total,
        String status,
        List<String> jugadores,
        List<QuoteResponse.QuoteTrancheDto> tranches,
        String idempotencyKey,
        String paymentStatus,
        String retentionStatus,
        double paidAmount,
        double balanceAmount,
        String paymentMethod,
        String paymentOperationNumber) {

    public BookingResponse(
            String id,
            String codigoPase,
            String courtId,
            String courtName,
            String venueName,
            String venueId,
            String fecha,
            String horario,
            double total,
            String status,
            List<String> jugadores,
            List<QuoteResponse.QuoteTrancheDto> tranches,
            String idempotencyKey) {
        this(id, codigoPase, courtId, courtName, venueName, venueId, fecha, horario, total, status, jugadores, tranches, idempotencyKey,
                "aprobado", "sin_retencion", total, 0.0, "Tarjeta", null);
    }

    public BookingResponse(
            String id,
            String codigoPase,
            String courtId,
            String courtName,
            String venueName,
            String venueId,
            String fecha,
            String horario,
            double total,
            String status,
            List<String> jugadores) {
        this(id, codigoPase, courtId, courtName, venueName, venueId, fecha, horario, total, status, jugadores, List.of(), null,
                "aprobado", "sin_retencion", total, 0.0, "Tarjeta", null);
    }

    public BookingResponse(
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
        this(id, codigoPase, null, courtName, venueName, venueId, fecha, horario, total, status, jugadores, List.of(), null,
                "aprobado", "sin_retencion", total, 0.0, "Tarjeta", null);
    }
}