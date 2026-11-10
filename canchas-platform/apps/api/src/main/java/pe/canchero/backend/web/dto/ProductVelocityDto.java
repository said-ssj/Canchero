package pe.canchero.backend.web.dto;

public record ProductVelocityDto(
        int productoId,
        String nombre,
        int stockActual,
        int stockMinimo,
        double promedioDiarioVenta,
        Double diasRestantesEstimados,
        String nivelAlerta // "AGOTADO", "CRITICO", "ADVERTENCIA", "OPTIMO"
) {
}
