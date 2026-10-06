package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.domain.entity.Court;
import pe.canchero.backend.domain.entity.Venue;
import pe.canchero.backend.repository.CourtRepository;
import pe.canchero.backend.repository.VenueRepository;
import pe.canchero.backend.web.dto.CourtDto;
import pe.canchero.backend.web.dto.CourtRequest;
import pe.canchero.backend.web.dto.ErrorResponse;

import java.util.List;
import java.util.Optional;

@RestController
@RequestMapping("/api/courts")
public class CourtController {

    private final CourtRepository courts;
    private final VenueRepository venues;

    public CourtController(CourtRepository courts, VenueRepository venues) {
        this.courts = courts;
        this.venues = venues;
    }

    @GetMapping
    public ResponseEntity<List<CourtDto>> list(@RequestParam(required = false) String venueId) {
        List<Court> result = venueId != null && !venueId.isBlank()
                ? courts.findByVenueId(venueId)
                : courts.findAll();
        return ResponseEntity.ok(result.stream().map(CourtDto::from).toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<CourtDto> detail(@PathVariable String id) {
        return courts.findById(id)
                .map(CourtDto::from)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody CourtRequest request) {
        if (request.venueId() == null || request.venueId().isBlank()) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Se requiere el venueId de la sede"));
        }
        Optional<Venue> venue = venues.findById(request.venueId());
        if (venue.isEmpty()) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Sede no existe"));
        }
        Court court = new Court();
        court.setId("c_" + System.nanoTime());
        apply(court, request);
        court.setVenue(venue.get());
        Court saved = courts.save(court);
        return ResponseEntity.status(HttpStatus.CREATED).body(CourtDto.from(saved));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody CourtRequest request) {
        Optional<Court> existing = courts.findById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Cancha no encontrada"));
        }
        apply(existing.get(), request);
        Court saved = courts.save(existing.get());
        return ResponseEntity.ok(CourtDto.from(saved));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id) {
        if (!courts.existsById(id)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Cancha no encontrada"));
        }
        courts.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private void apply(Court court, CourtRequest request) {
        court.setNombre(request.nombre());
        court.setTipo(request.tipo());
        court.setTechada(request.techada());
        court.setDisponible(request.disponible());
        court.setPrecioHora(request.precioHora());
    }
}