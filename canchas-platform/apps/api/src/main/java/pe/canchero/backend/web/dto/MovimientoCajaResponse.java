package pe.canchero.backend.web.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record MovimientoCajaResponse(
        String id,
        String sesionCajaId,
        String tipo,
        String concepto,
        BigDecimal monto,
        String metodoPago,
        String referencia,
        LocalDateTime fecha) {
}