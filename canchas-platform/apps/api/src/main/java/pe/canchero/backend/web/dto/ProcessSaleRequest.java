package pe.canchero.backend.web.dto;

import java.util.List;

public record ProcessSaleRequest(
        String tipoComprobante,
        String metodoPago,
        String cajeroNombre,
        String clienteNombre,
        String clienteDocumento,
        Double montoPagado,
        Integer sesionCajaId,
        Integer sedeId,
        String usuarioId,
        List<SaleItemDto> items,
        List<SalePaymentDto> pagos,
        String idempotencyKey
) {
    public ProcessSaleRequest(String tipo, String metodo, String cajero, String cliente,
            String documento, Double recibido, Integer sesion, Integer sede, String usuario,
            List<SaleItemDto> items) {
        this(tipo, metodo, cajero, cliente, documento, recibido, sesion, sede, usuario, items, null, null);
    }
}
