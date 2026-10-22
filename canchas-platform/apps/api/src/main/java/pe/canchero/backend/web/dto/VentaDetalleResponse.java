package pe.canchero.backend.web.dto;

import java.math.BigDecimal;

public record VentaDetalleResponse(
        String id,
        String ventaId,
        String productoId,
        String productoNombre,
        int cantidad,
        BigDecimal precioUnitario,
        BigDecimal subtotal) {
}