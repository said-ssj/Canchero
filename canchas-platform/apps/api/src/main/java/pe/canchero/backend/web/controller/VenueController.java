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
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.VenueRequest;
import pe.canchero.backend.web.dto.VenueResponse;

import java.util.List;

@RestController
@RequestMapping("/api/venues")
public class VenueController {

    private final SupabaseDataService data;

    public VenueController(SupabaseDataService data) {
        this.data = data;
    }

    @GetMapping
    public ResponseEntity<List<VenueResponse>> list(
            @RequestParam(required = false) String ciudad,
            @RequestParam(required = false) String distrito,
            @RequestParam(required = false) String deporte) {
        return ResponseEntity.ok(data.listVenues(ciudad, distrito, deporte));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> detail(@PathVariable String id) {
        return data.getVenue(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Sede no encontrada")));
    }

    @PostMapping
    public ResponseEntity<VenueResponse> create(@RequestBody VenueRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(data.createVenue(request));
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody VenueRequest request) {
        return data.updateVenue(id, request)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Sede no encontrada")));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id) {
        if (!data.deleteVenue(id)) {
            return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Sede no encontrada"));
        }
        return ResponseEntity.noContent().build();
    }
}
