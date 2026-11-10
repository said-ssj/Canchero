package pe.canchero.backend.web.dto;

public record CreditPaymentDto(
        Integer id,
        Integer cuentaId,
        Integer sesionCajaId,
        String fecha,
        Double monto,
        String medioPago,
        String nroOperacion,
        String observacion,
        String cajeroNombre
) {
}
