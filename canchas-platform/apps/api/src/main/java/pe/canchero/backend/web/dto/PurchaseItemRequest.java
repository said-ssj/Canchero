package pe.canchero.backend.web.dto;

public record PurchaseItemRequest(
        int productoId,
        int cantidad,
        double costoUnitario
) {
}
