package pe.canchero.backend.web.dto;

public record OpenCashSessionRequest(
        int cajaId,
        String cajeroNombre,
        String cajeroEmail,
        double montoApertura,
        String usuarioId
) {
}
