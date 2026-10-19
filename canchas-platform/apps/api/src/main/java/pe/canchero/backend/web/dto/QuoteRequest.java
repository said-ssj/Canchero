package pe.canchero.backend.web.dto;

import java.util.List;

public record QuoteRequest(
        String fecha,
        List<Integer> hours) {
}
