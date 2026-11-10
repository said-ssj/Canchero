package pe.canchero.backend.web.dto;

import java.util.List;

public record PurchaseDto(
        int id,
        int sedeId,
        int proveedorId,
        String proveedorNombre,
        String proveedorRuc,
        String numeroComprobante,
        String tipoComprobante,
        String fechaEmision,
        String fechaEntregaEstimada,
        String fechaRecepcion,
        double subtotal,
        double igv,
        double total,
        String estado,
        String observacion,
        List<PurchaseItemDto> items
) {
}
