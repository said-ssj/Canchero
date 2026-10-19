package pe.canchero.backend.web.dto;

public record CloseCashSessionRequest(
        double totalEfectivoFisico,
        double montoSistema,
        double diferencia,
        double totalDigital,
        String observaciones,
        String usuarioId
) {
}
