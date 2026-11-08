package pe.canchero.backend.web.dto;

import java.util.List;
import jakarta.validation.constraints.NotBlank;

public record VenueRequest(
        String nombre,
        @NotBlank(message = "La dirección de la sede es obligatoria") String direccion,
        String distrito,
        String ciudad,
        String descripcion,
        String telefono,
        String portadaUrl,
        Double latitud,
        Double longitud,
        double tarifaBase,
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
