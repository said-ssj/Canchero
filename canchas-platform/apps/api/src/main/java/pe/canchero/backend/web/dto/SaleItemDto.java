package pe.canchero.backend.web.dto;

public record SaleItemDto(
        int productoId,
        String nombre,
        int cantidad,
        double precioUnitario,
        double subtotal
) {
}
