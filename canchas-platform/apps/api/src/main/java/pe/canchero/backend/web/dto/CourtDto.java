package pe.canchero.backend.web.dto;

public record CourtDto(
        String id,
        String nombre,
        String tipo,
        String formato,
        String superficie,
        String cobertura,
        boolean techada,
        boolean disponible,
        double precioHora,
        Double precioHoraNoche,
        String horaInicioNoche,
        String foto,
        Integer venueId) {

    public CourtDto(String id, String nombre, String tipo, String formato, String superficie,
            String cobertura, boolean techada, boolean disponible, double precioHora,
            Double precioHoraNoche, String horaInicioNoche, String foto) {
        this(id, nombre, tipo, formato, superficie, cobertura, techada, disponible,
                precioHora, precioHoraNoche, horaInicioNoche, foto, null);
    }

    public CourtDto(
            String id,
            String nombre,
            String tipo,
            String formato,
            String superficie,
            String cobertura,
            boolean techada,
            boolean disponible,
            double precioHora,
            String foto) {
        this(id, nombre, tipo, formato, superficie, cobertura, techada, disponible, precioHora, precioHora, "18:00", foto);
    }
}

