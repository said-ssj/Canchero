package pe.canchero.backend.web.dto;

public record InventoryMovementDto(
        int id,
        Integer sedeId,
        int productoId,
        String productoNombre,
        String fecha,
        String tipo,
        int cantidad,
        double precioUnitario,
        int saldoStock,
        String motivo,
        String documentoRef
) {
}
