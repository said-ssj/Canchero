package pe.canchero.backend.web.dto;

import java.math.BigDecimal;
import java.time.LocalDateTime;

public record CajaResponse(
        String id,
        String nombre,
        String descripcion,
        String estado,
        BigDecimal saldoInicial,
        BigDecimal saldoActual,
        LocalDateTime fechaApertura,
        LocalDateTime fechaCierre) {
}