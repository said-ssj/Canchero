package pe.canchero.backend.web.dto;

public record CourtRequest(
        String venueId,
        String nombre,
        String tipo,
        boolean techada,
        boolean disponible,
        double precioHora) {
}