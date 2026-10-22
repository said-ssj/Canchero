package pe.canchero.backend.web.dto;

public record CashSessionDto(
        int id,
        int cajaId,
        String cajaNombre,
        int sedeId,
        String cajeroNombre,
        String cajeroEmail,
        String fechaApertura,
        double montoApertura,
        String fechaCierre,
        Double montoCierre,
        Double montoSistema,
        Double diferencia,
        String estado,
        String estadoBalance
) {
}
