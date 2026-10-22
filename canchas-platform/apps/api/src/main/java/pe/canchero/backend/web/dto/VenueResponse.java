package pe.canchero.backend.web.dto;

import java.util.List;

public record VenueResponse(
        String id,
        String ownerId,
        String nombre,
        String direccion,
        String distrito,
        String ciudad,
        String descripcion,
        String portadaUrl,
        Double latitud,
        Double longitud,
        Double rating,
        String telefono,
        double tarifaBase,
        List<String> fotos,
        List<String> amenidades,
        List<CourtDto> canchas) {
}
