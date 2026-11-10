package pe.canchero.backend.web.dto;

public record PurchaseItemDto(
        int productoId,
        String productoNombre,
        int cantidad,
        double costoUnitario,
        double subtotal
) {
}
