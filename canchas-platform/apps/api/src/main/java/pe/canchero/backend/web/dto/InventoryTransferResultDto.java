package pe.canchero.backend.web.dto;

public record InventoryTransferResultDto(
        int sourceSedeId,
        int targetSedeId,
        int productoId,
        int cantidad,
        int stockOrigenFinal,
        int stockDestinoFinal,
        int sourceKardexId,
        int targetKardexId,
        String mensaje
) {}
