package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.CajaRequest;
import pe.canchero.backend.web.dto.CajaResponse;
import pe.canchero.backend.web.dto.ErrorResponse;

import java.util.List;

@RestController
@RequestMapping("/api/cajas")
public class CajaController {

    private final SupabaseDataService data;
    private final VenueAccessService access;

    public CajaController(SupabaseDataService data, VenueAccessService access) {
        this.data = data;
        this.access = access;
    }

    @GetMapping
    public ResponseEntity<List<CajaResponse>> list(@RequestParam(required = false) Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        if (sedeId != null) {
            access.requireOwnedVenue(sedeId, user);
            return ResponseEntity.ok(data.listCajas(sedeId));
        }
        return ResponseEntity.ok(data.listCajasForOwner(user.id()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable int id,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOwnedBox(id, user);
        return data.getCaja(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Caja no encontrada")));
    }

    @PostMapping
    public ResponseEntity<CajaResponse> create(@RequestBody CajaRequest request,
            @RequestParam(required = false) Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        Integer targetSedeId = request.sedeId() != null ? request.sedeId() : sedeId;
        int verifiedSedeId = access.requireOwnedVenue(targetSedeId, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(data.createCaja(request, verifiedSedeId));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        String msg = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(msg));
    }
}