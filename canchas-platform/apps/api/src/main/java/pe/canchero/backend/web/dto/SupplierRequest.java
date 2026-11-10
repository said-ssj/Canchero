package pe.canchero.backend.web.dto;

public record SupplierRequest(
        Integer sedeId,
        String ruc,
        String razonSocial,
        String contacto,
        String telefono,
        String correo,
        String direccion
) {
}
