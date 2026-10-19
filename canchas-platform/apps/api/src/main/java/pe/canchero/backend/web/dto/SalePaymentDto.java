package pe.canchero.backend.web.dto;

import java.math.BigDecimal;

public record SalePaymentDto(String metodoPago, BigDecimal monto, BigDecimal montoRecibido) {}
