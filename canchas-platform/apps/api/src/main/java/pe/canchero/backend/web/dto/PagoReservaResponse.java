package pe.canchero.backend.web.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record PagoReservaResponse(
        String id,
        String reservaId,
        String metodoPago,
        BigDecimal monto,
        LocalDateTime fechaPago,
        String numeroOperacion,
        boolean esAdelanto,
        BigDecimal comisionPlataforma,
        BigDecimal montoNetoDueno,
        String estadoLiquidacion) {
}