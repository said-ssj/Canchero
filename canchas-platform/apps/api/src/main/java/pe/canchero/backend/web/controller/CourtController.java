package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.service.CourtOperationService;
import pe.canchero.backend.service.CourtRecoveryService;
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

    private final SupabaseDataService data;
    private final CourtOperationService operation;
    private final CourtRecoveryService recovery;

    public CourtController(SupabaseDataService data, CourtOperationService operation, CourtRecoveryService recovery) {
        this.data = data;
        this.operation = operation;
        this.recovery = recovery;
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
    public ResponseEntity<CourtDto> create(@RequestBody CourtRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(data.createCourt(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody CourtRequest request) {
        return data.updateCourt(id, request)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Cancha no encontrada")));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id) {
        if (!data.deleteCourt(id)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Cancha no encontrada"));
        }
        return ResponseEntity.noContent().build();
    }
}
