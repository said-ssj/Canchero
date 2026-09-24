package pe.canchero.backend.web.dto;

import pe.canchero.backend.domain.entity.Venue;

import java.util.List;

public record VenueResponse(
        String id,
        String nombre,
        String direccion,
        String distrito,
        String ciudad,
        String descripcion,
        String portadaUrl,
        double tarifaBase,
        List<String> fotos,
        List<String> amenidades,
        List<CourtDto> canchas) {

    public static VenueResponse from(Venue venue) {
        return new VenueResponse(
                venue.getId(),
                venue.getNombre(),
                venue.getDireccion(),
                venue.getDistrito(),
                venue.getCiudad(),
                venue.getDescripcion(),
                venue.getPortadaUrl(),
                venue.getTarifaBase(),
                venue.getFotos(),
                venue.getAmenidades(),
                venue.getCanchas().stream().map(CourtDto::from).toList());
    }
}