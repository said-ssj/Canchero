package pe.canchero.backend.web.dto;

import java.math.BigDecimal;
import java.util.List;

public record VentaRequest(
        String sesionCajaId,
        String clienteId,
        String metodoPago,
        List<VentaDetalleRequest> detalles) {
    
    public record VentaDetalleRequest(
            String productoId,
            int cantidad,
            BigDecimal precioUnitario) {
    }
}
