package pe.canchero.backend.web.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

public record VentaResponse(
        String id,
        String sesionCajaId,
        String clienteId,
        String metodoPago,
        BigDecimal subtotal,
        BigDecimal igv,
        BigDecimal total,
        String estado,
        LocalDateTime fecha,
        List<VentaDetalleResponse> detalles) {
}