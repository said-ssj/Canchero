package pe.canchero.backend.web.dto;

import java.util.List;

public record SaleDto(
        String id,
        Integer sedeId,
        String fecha,
        Integer cajaId,
        String cajeroNombre,
        String clienteNombre,
        String clienteDocumento,
        String tipoComprobante,
        String numeroComprobante,
        List<SaleItemDto> items,
        double subtotal,
        double igv,
        double total,
        String metodoPago,
        Double montoPagado,
        Double vuelto,
        String estado,
        List<SalePaymentDto> pagos
) {
}
