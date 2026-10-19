package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.PagoReservaResponse;

import java.util.List;

@RestController
@RequestMapping("/api/pagos-reserva")
public class PagoReservaController {

    private final SupabaseDataService data;
    private final VenueAccessService access;

    public PagoReservaController(SupabaseDataService data, VenueAccessService access) {
        this.data = data;
        this.access = access;
    }

    @GetMapping("/reserva/{reservaId}")
    public ResponseEntity<List<PagoReservaResponse>> listByReserva(@PathVariable int reservaId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireReservationAccess(reservaId, user);
        return ResponseEntity.ok(data.listPagosByReserva(reservaId));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        String msg = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(msg));
    }
}