package pe.canchero.backend.web.dto;

public record TransformationRequest(
        Integer sedeId,
        int productoOrigenId,
        int cantidadOrigen,
        int productoDestinoId,
        int cantidadDestino,
        String motivo
) {
}
