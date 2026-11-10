package pe.canchero.backend.web.dto;

public record TransformationResultDto(
        int productoOrigenId,
        String productoOrigenNombre,
        int cantidadOrigen,
        int stockFinalOrigen,
        int productoDestinoId,
        String productoDestinoNombre,
        int cantidadDestino,
        int stockFinalDestino,
        double costoUnitarioDestino,
        String fecha,
        String motivo
) {
}
