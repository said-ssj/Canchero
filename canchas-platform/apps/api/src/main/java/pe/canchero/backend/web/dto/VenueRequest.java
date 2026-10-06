package pe.canchero.backend.web.dto;

import java.util.List;

public record VenueRequest(
        String nombre,
        String direccion,
        String distrito,
        String ciudad,
        String descripcion,
        String portadaUrl,
        double tarifaBase,
        String ownerId,
        List<String> fotos,
        List<String> amenidades,
        List<CourtRequest> canchas) {

    public record CourtRequest(
            String nombre,
            String tipo,
            boolean techada,
            boolean disponible,
            double precioHora) {
    }
}