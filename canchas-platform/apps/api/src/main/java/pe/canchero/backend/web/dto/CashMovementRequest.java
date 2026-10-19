package pe.canchero.backend.web.dto;

public record CashMovementRequest(
        int sesionId,
        String tipo,
        double monto,
        String concepto,
        String autorizadoPor
) {
}
