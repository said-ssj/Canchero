package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.service.VenueService;
import pe.canchero.backend.service.CourtOperationService;
import pe.canchero.backend.service.CourtRecoveryService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.CourtAvailabilityResponse;
import pe.canchero.backend.web.dto.CourtDto;
import pe.canchero.backend.web.dto.CourtRequest;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.QuoteRequest;
import pe.canchero.backend.web.dto.QuoteResponse;

import java.util.List;

@RestController
@RequestMapping("/api/courts")
public class CourtController {

    private final VenueService data;
    private final CourtOperationService operation;
    private final CourtRecoveryService recovery;
    private final VenueAccessService access;

    public CourtController(VenueService data, CourtOperationService operation, CourtRecoveryService recovery,
            VenueAccessService access) {
        this.data = data;
        this.operation = operation;
        this.recovery = recovery;
        this.access = access;
    }

    @PostMapping("/recover")
    public CourtDto recover(@RequestAttribute("auth.user") AuthUserDto user, @RequestBody CourtRequest request) {
        return recovery.recover(user, request);
    }

    @PutMapping("/{id}/operation")
    public CourtOperationService.SavedOperation operation(@PathVariable int id,
            @RequestAttribute("auth.user") AuthUserDto user,
            @RequestBody CourtOperationService.Operation request) {
        return operation.save(id, user, request);
    }

    @PostMapping("/{id}/bloqueos")
    public ResponseEntity<CourtOperationService.SavedBlock> createBlock(@PathVariable int id,
            @RequestAttribute("auth.user") AuthUserDto user,
            @RequestBody CourtOperationService.BlockRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(operation.createBlock(id, user, request));
    }

    @PatchMapping("/bloqueos/{bloqueoId}/reabrir")
    public ResponseEntity<Void> reopenBlock(@PathVariable int bloqueoId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        operation.reopenBlock(bloqueoId, user);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public ResponseEntity<List<CourtDto>> list(@RequestParam(required = false) String venueId) {
        return ResponseEntity.ok(data.listCourts(venueId));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable String id) {
        return data.getCourt(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Cancha no encontrada")));
    }

    @GetMapping("/{id}/availability")
    public ResponseEntity<CourtAvailabilityResponse> availability(
            @PathVariable String id,
            @RequestParam String from,
            @RequestParam String to) {
        return ResponseEntity.ok(data.getCourtAvailability(id, from, to));
    }

    @PostMapping("/{id}/quote")
    public ResponseEntity<QuoteResponse> quote(
            @PathVariable String id,
            @RequestBody QuoteRequest request) {
        return ResponseEntity.ok(data.quoteCourtBooking(id, request));
    }

    @PostMapping
    public ResponseEntity<CourtDto> create(@RequestAttribute("auth.user") AuthUserDto user,
            @RequestBody CourtRequest request) {
        access.requireOwnedVenue(parseId(request.venueId()), user);
        return ResponseEntity.status(HttpStatus.CREATED).body(data.createCourt(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable int id, @RequestAttribute("auth.user") AuthUserDto user,
            @RequestBody CourtRequest request) {
        access.requireOwnedCourt(id, user);
        return data.updateCourt(String.valueOf(id), request)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Cancha no encontrada")));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable int id, @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOwnedCourt(id, user);
        if (!data.deleteCourt(String.valueOf(id))) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Cancha no encontrada"));
        }
        return ResponseEntity.noContent().build();
    }

    private static Integer parseId(String raw) {
        try {
            return raw == null ? null : Integer.valueOf(raw.trim());
        } catch (NumberFormatException ex) {
            return null; // requireOwnedVenue responde 400 "Selecciona una sede"
        }
    }
}
