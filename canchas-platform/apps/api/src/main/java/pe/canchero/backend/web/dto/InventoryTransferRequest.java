package pe.canchero.backend.web.dto;

public record InventoryTransferRequest(
        Integer sourceSedeId,
        Integer targetSedeId,
        Integer productoId,
        Integer cantidad,
        String motivo
) {}
