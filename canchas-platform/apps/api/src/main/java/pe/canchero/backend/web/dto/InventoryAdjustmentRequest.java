package pe.canchero.backend.web.dto;

public record InventoryAdjustmentRequest(
        int productoId,
        Integer sedeId,
        String tipoAjuste, // MERMA, ROTURA, VENCIMIENTO, SOBRANTE, FALTANTE
        int cantidad,
        String motivo
) {
}
