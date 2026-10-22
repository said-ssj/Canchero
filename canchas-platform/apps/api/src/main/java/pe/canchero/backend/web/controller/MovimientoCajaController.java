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
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.MovimientoCajaRequest;
import pe.canchero.backend.web.dto.MovimientoCajaResponse;

import java.math.BigDecimal;
import java.util.List;

@RestController
@RequestMapping("/api/movimientos-caja")
public class MovimientoCajaController {

    private final SupabaseDataService data;
    private final VenueAccessService access;

    public MovimientoCajaController(SupabaseDataService data, VenueAccessService access) {
        this.data = data;
        this.access = access;
    }

    @GetMapping("/sesion/{sesionCajaId}")
    public ResponseEntity<List<MovimientoCajaResponse>> listBySesion(@PathVariable int sesionCajaId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOwnedSession(sesionCajaId, user);
        return ResponseEntity.ok(data.listMovimientosCaja(sesionCajaId));
    }

    @PostMapping
    public ResponseEntity<MovimientoCajaResponse> create(@RequestBody MovimientoCajaRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        if (request.sesionCajaId() == null || request.sesionCajaId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Turno de caja inválido");
        }
        int sesionId;
        try {
            sesionId = Integer.parseInt(request.sesionCajaId());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Turno de caja inválido");
        }
        access.requireOpenOwnedSession(sesionId, user);
        if (request.monto() == null || request.monto().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto debe ser mayor que cero");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(data.createMovimientoCaja(request));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        String msg = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(msg));
    }
}