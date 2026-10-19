package pe.canchero.backend.web.dto;

public record CashAuditDto(
        String id,
        int sesionId,
        String cajaNombre,
        String cajeroNombre,
        String fechaArqueo,
        double totalEfectivoFisico,
        double montoApertura,
        double totalPagosEfectivo,
        double totalIngresos,
        double totalEgresos,
        double montoSistema,
        double diferencia,
        String balanceEstado,
        String observaciones,
        boolean desgloseDisponible
) {
    public CashAuditDto(String id, int sesion, String caja, String cajero, String fecha,
            double fisico, double apertura, double pagos, double ingresos, double egresos,
            double sistema, double diferencia, String balance, String observaciones) {
        this(id, sesion, caja, cajero, fecha, fisico, apertura, pagos, ingresos, egresos,
                sistema, diferencia, balance, observaciones, false);
    }
}
