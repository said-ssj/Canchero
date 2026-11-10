package pe.canchero.backend.web.dto;

import java.util.List;

public record CreditAccountDto(
        Integer id,
        Integer sedeId,
        String clienteNombre,
        String clienteDocumento,
        String telefono,
        String equipo,
        Double montoOriginal,
        Double saldo,
        Double totalAbonado,
        String concepto,
        String fechaEmision,
        String fechaVencimiento,
        String estado,
        List<CreditPaymentDto> abonos
) {
}
