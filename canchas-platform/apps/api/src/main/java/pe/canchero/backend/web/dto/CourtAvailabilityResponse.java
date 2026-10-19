package pe.canchero.backend.web.dto;

import java.util.List;

public record CourtAvailabilityResponse(
        String courtId,
        String venueId,
        String from,
        String to,
        List<ScheduleWindowDto> horarios,
        List<TariffRuleDto> tarifas,
        List<MaintenanceBlockDto> bloqueos,
        List<OccupiedIntervalDto> ocupaciones) {

    public record ScheduleWindowDto(
            int idSede,
            int diaSemana,
            String apertura,
            String cierre,
            String estado) {
    }

    public record TariffRuleDto(
            int idCancha,
            int diaSemana,
            String horaInicio,
            String horaFin,
            double precio,
            String estado) {
    }

    public record MaintenanceBlockDto(
            int idBloqueo,
            int idCancha,
            String motivo,
            String fechaInicio,
            String fechaFin,
            String estado) {
    }

    public record OccupiedIntervalDto(
            int idCancha,
            String fechaReserva,
            String horaInicio,
            String horaFin,
            String estado) {
    }
}
