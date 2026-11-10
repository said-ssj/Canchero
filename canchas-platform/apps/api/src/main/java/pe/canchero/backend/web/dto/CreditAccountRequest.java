package pe.canchero.backend.web.dto;

public record CreditAccountRequest(
        Integer sedeId,
        String clienteNombre,
        String clienteDocumento,
        String telefono,
        String equipo,
        Double montoOriginal,
        String concepto,
        String fechaVencimiento
) {
}
