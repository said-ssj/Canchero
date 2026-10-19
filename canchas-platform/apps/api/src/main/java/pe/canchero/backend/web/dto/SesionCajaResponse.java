package pe.canchero.backend.web.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record SesionCajaResponse(
        String id,
        String cajaId,
        String usuarioId,
        BigDecimal montoInicial,
        BigDecimal montoFinal,
        BigDecimal totalVentas,
        BigDecimal totalIngresos,
        BigDecimal totalEgresos,
        String estado,
        LocalDateTime fechaApertura,
        LocalDateTime fechaCierre) {
}