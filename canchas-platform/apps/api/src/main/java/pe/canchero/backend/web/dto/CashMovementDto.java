package pe.canchero.backend.web.dto;

public record CashMovementDto(
        String id,
        int sesionId,
        String tipo,
        double monto,
        String concepto,
        String hora,
        String autorizadoPor
) {
}
