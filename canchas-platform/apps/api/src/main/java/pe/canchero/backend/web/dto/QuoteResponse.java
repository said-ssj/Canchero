package pe.canchero.backend.web.dto;

import java.util.List;

public record QuoteResponse(
        boolean valid,
        String errorMessage,
        String courtId,
        String fecha,
        String timeStart,
        String timeEnd,
        String displayRange,
        int durationHours,
        List<QuoteTrancheDto> tranches,
        double subtotal,
        double total) {

    public record QuoteTrancheDto(
            int hour,
            String timeStart,
            String timeEnd,
            String displayTime,
            double price,
            boolean isNight,
            String rateType) {
    }
}
