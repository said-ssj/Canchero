package pe.canchero.backend.web.dto;

public record InventoryEntryRequest(
        int productoId,
        int cantidad,
        double precioCompra,
        String motivo,
        Integer sedeId
) {
}
