package pe.canchero.backend.web.dto;

import java.util.List;

public record PurchaseRequest(
        Integer sedeId,
        int proveedorId,
        String numeroComprobante,
        String tipoComprobante,
        String fechaEntregaEstimada,
        String observacion,
        boolean recibirInmediatamente,
        List<PurchaseItemRequest> items
) {
}
