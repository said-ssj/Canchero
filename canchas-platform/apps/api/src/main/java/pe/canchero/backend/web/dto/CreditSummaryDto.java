package pe.canchero.backend.web.dto;

public record CreditSummaryDto(
        Double totalPorCobrar,
        Double totalVencido,
        Double totalCobradoMes,
        Integer clientesDeudores,
        Integer cuentasVencidas
) {
}
