package pe.canchero.backend.web.dto;

import java.math.BigDecimal;

public record CashBalanceDto(int sesionId, BigDecimal pagosEfectivo, BigDecimal pagosDigital,
        BigDecimal montoSistema) {}
