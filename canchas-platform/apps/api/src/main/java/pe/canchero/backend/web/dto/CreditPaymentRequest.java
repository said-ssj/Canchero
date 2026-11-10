package pe.canchero.backend.web.dto;

public record CreditPaymentRequest(
        Integer cuentaId,
        Double monto,
        String medioPago,
        String nroOperacion,
        Integer sesionCajaId,
        String observacion
) {
}
