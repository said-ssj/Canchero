package pe.canchero.backend.web.dto;

import java.math.BigDecimal;

public record SesionCajaRequest(
        String cajaId,
        String usuarioId,
        BigDecimal montoInicial) {
}