package pe.canchero.backend.web.dto;

import java.util.List;

public record CourtRequest(
        String venueId,
        String nombre,
        String tipo,
        String superficie,
        String foto,
        List<String> equipamiento,
        boolean techada,
        boolean disponible,
        double precioHora,
        Double precioHoraNoche,
        String horaInicioNoche) {
    public CourtRequest(String venueId, String nombre, String tipo, String superficie, String foto,
            List<String> equipamiento, boolean techada, boolean disponible, double precioHora) {
        this(venueId, nombre, tipo, superficie, foto, equipamiento, techada, disponible, precioHora, null, null);
    }
}
