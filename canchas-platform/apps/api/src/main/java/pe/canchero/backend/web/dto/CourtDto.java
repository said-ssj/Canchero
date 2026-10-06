package pe.canchero.backend.web.dto;

import pe.canchero.backend.domain.entity.Court;

public record CourtDto(
        String id,
        String nombre,
        String tipo,
        boolean techada,
        boolean disponible,
        double precioHora) {

    public static CourtDto from(Court court) {
        return new CourtDto(
                court.getId(),
                court.getNombre(),
                court.getTipo(),
                court.isTechada(),
                court.isDisponible(),
                court.getPrecioHora());
    }
}