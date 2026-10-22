package pe.canchero.backend.web.dto;

import java.math.BigDecimal;

public record ProductoResponse(
        String id,
        String nombre,
        String descripcion,
        String categoria,
        BigDecimal precioVenta,
        BigDecimal precioCompra,
        int stockActual,
        int stockMinimo,
        String unidadMedida,
        String estado) {
}