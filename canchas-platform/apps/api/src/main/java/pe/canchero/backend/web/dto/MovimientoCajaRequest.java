package pe.canchero.backend.web.dto;

import java.math.BigDecimal;

public record MovimientoCajaRequest(
        String sesionCajaId,
        String tipo,
        String concepto,
        BigDecimal monto,
        String metodoPago,
        String referencia) {
}