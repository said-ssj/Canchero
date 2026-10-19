package pe.canchero.backend.web.dto;

public record ProductDto(
        int id,
        Integer sedeId,
        int categoriaId,
        String categoriaNombre,
        String codigoBarras,
        String nombre,
        double precioCompra,
        double precioVenta,
        int stock,
        int stockMinimo,
        String icono
) {
}
