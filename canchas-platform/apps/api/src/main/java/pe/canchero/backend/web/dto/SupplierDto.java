package pe.canchero.backend.web.dto;

public record SupplierDto(
        int id,
        Integer sedeId,
        String ruc,
        String razonSocial,
        String contacto,
        String telefono,
        String correo,
        String direccion,
        String estado
) {
}
