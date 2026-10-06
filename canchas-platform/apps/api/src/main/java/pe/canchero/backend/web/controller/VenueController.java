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
import pe.canchero.backend.domain.entity.User;
import pe.canchero.backend.domain.entity.Venue;
import pe.canchero.backend.repository.CourtRepository;
import pe.canchero.backend.repository.UserRepository;
import pe.canchero.backend.repository.VenueRepository;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.VenueRequest;
import pe.canchero.backend.web.dto.VenueResponse;

import java.util.List;
import java.util.Objects;
import java.util.Optional;

@RestController
@RequestMapping("/api/venues")
public class VenueController {

    private final VenueRepository venues;
    private final CourtRepository courts;
    private final UserRepository users;

    public VenueController(VenueRepository venues, CourtRepository courts, UserRepository users) {
        this.venues = venues;
        this.courts = courts;
        this.users = users;
    }

    @GetMapping
    public ResponseEntity<List<VenueResponse>> list(
            @RequestParam(required = false) String ciudad,
            @RequestParam(required = false) String distrito,
            @RequestParam(required = false) String deporte) {
        List<Venue> result;
        if (ciudad != null && !ciudad.isBlank() && distrito != null && !distrito.isBlank()) {
            result = venues.findByCiudadIgnoreCaseAndDistritoIgnoreCase(ciudad.trim(), distrito.trim());
        } else if (ciudad != null && !ciudad.isBlank()) {
            result = venues.findByCiudadIgnoreCase(ciudad.trim());
        } else {
            result = venues.findAll();
        }
        if (deporte != null && !deporte.isBlank()) {
            result = filterByDeporte(result, deporte.trim().toLowerCase());
        }
        return ResponseEntity.ok(result.stream().map(VenueResponse::from).toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable String id) {
        Optional<Venue> venue = venues.findById(id);
        if (venue.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Sede no encontrada"));
        }
        return ResponseEntity.ok(VenueResponse.from(venue.get()));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody VenueRequest request) {
        if (request.ownerId() == null || request.ownerId().isBlank()) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Se requiere el dueño de la sede (ownerId)"));
        }
        Optional<User> owner = users.findById(request.ownerId());
        if (owner.isEmpty()) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Owner no existe"));
        }
        Venue saved = venues.save(toEntity(request, owner.get(), true));
        return ResponseEntity.status(HttpStatus.CREATED).body(VenueResponse.from(saved));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody VenueRequest request) {
        Optional<Venue> existing = venues.findById(id);
        if (existing.isEmpty()) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Sede no encontrada"));
        }
        if (!owns(existing.get(), request.ownerId())) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse("No tienes permisos sobre esta sede"));
        }
        Venue updated = toEntity(request, existing.get().getOwner(), false);
        updated.setId(id);
        Venue saved = venues.save(updated);
        return ResponseEntity.ok(VenueResponse.from(saved));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(
            @PathVariable String id,
            @RequestParam(required = false) String ownerId) {
        if (!venues.existsById(id)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Sede no encontrada"));
        }
        Optional<Venue> venue = venues.findById(id);
        if (venue.isEmpty() || !owns(venue.get(), ownerId)) {
            return ResponseEntity.status(HttpStatus.FORBIDDEN).body(new ErrorResponse("No tienes permisos sobre esta sede"));
        }
        venues.deleteById(id);
        return ResponseEntity.noContent().build();
    }

    private boolean owns(Venue venue, String ownerId) {
        return ownerId != null
                && venue.getOwner() != null
                && ownerId.equals(venue.getOwner().getId());
    }

    private Venue toEntity(VenueRequest request, User owner, boolean freshIds) {
        Venue venue = new Venue();
        venue.setNombre(request.nombre());
        venue.setDireccion(request.direccion());
        venue.setDistrito(request.distrito());
        venue.setCiudad(request.ciudad());
        venue.setDescripcion(request.descripcion());
        venue.setPortadaUrl(request.portadaUrl());
        venue.setTarifaBase(request.tarifaBase());
        venue.setFotos(request.fotos() == null ? List.of() : request.fotos());
        venue.setAmenidades(request.amenidades() == null ? List.of() : request.amenidades());
        venue.setOwner(owner);
        if (request.canchas() != null) {
            for (VenueRequest.CourtRequest cr : request.canchas()) {
                Court court = new Court();
                court.setId(freshIds ? "c_" + System.nanoTime() + "_" + cr.hashCode() : cr.hashCode() + "-court");
                court.setNombre(cr.nombre());
                court.setTipo(cr.tipo());
                court.setTechada(cr.techada());
                court.setDisponible(cr.disponible());
                court.setPrecioHora(cr.precioHora());
                court.setVenue(venue);
                venue.getCanchas().add(court);
            }
        }
        return venue;
    }

    private List<Venue> filterByDeporte(List<Venue> result, String deporte) {
        return result.stream().filter(v -> matchesDeporte(v, deporte)).toList();
    }

    private boolean matchesDeporte(Venue venue, String deporte) {
        boolean matchesType = venue.getCanchas().stream()
                .map(Court::getTipo)
                .filter(Objects::nonNull)
                .map(tipo -> tipo.toLowerCase().replace(' ', '-'))
                .anyMatch(tipo -> tipo.equals(deporte) || tipo.endsWith("-" + deporte.replace("futbol-", "")));
        if (matchesType) {
            return true;
        }
        String amenidades = String.join(" ", venue.getAmenidades()).toLowerCase();
        return switch (deporte) {
            case "futbol-5" -> amenidades.contains("fútbol 5") || amenidades.contains("grass 5");
            case "futbol-7" -> amenidades.contains("fútbol 7") || amenidades.contains("grass 7");
            case "futbol-11" -> amenidades.contains("fútbol 11");
            case "techado" -> amenidades.contains("techado");
            case "sintetico" -> amenidades.contains("sintético");
            case "natural" -> amenidades.contains("natural");
            default -> true;
        };
    }
}