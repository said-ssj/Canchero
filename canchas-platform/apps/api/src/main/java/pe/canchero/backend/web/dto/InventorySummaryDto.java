package pe.canchero.backend.web.dto;

import java.math.BigDecimal;
import java.util.List;

public record InventorySummaryDto(
        int sedeId,
        BigDecimal totalValorizado,
        int totalUnidades,
        int totalProductos,
        int productosBajoStock,
        int productosAgotados,
        int movimientosMes,
        List<ProductVelocityDto> proyeccionesAgotamiento
) {
}
