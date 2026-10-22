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
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.VentaRequest;
import pe.canchero.backend.web.dto.VentaResponse;

import java.util.List;

@RestController
@RequestMapping("/api/ventas")
public class VentaController {

    private final SupabaseDataService data;
    private final VenueAccessService access;

    public VentaController(SupabaseDataService data, VenueAccessService access) {
        this.data = data;
        this.access = access;
    }

    @GetMapping
    public ResponseEntity<List<VentaResponse>> list(@RequestParam(required = false) String sesionCajaId,
            @RequestParam(required = false) Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        if (sesionCajaId != null && !sesionCajaId.isBlank()) {
            int sId;
            try {
                sId = Integer.parseInt(sesionCajaId);
            } catch (NumberFormatException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Turno de caja inválido");
            }
            access.requireOwnedSession(sId, user);
            return ResponseEntity.ok(data.listVentasBySession(sId));
        }
        if (sedeId != null) {
            access.requireOwnedVenue(sedeId, user);
            return ResponseEntity.ok(data.listVentasForVenue(sedeId));
        }
        return ResponseEntity.ok(data.listVentasForOwner(user.id()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable int id,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOwnedSale(id, user);
        return data.getVenta(id)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Venta no encontrada")));
    }

    @PostMapping
    public ResponseEntity<VentaResponse> create(@RequestBody VentaRequest request,
            @RequestParam(required = false) Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        if (request.sesionCajaId() == null || request.sesionCajaId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Se requiere un turno de caja abierto para registrar ventas");
        }
        int sesionId;
        try {
            sesionId = Integer.parseInt(request.sesionCajaId());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Turno de caja inválido");
        }
        var sessionInfo = access.requireOpenOwnedSession(sesionId, user);
        int sessionSedeId = sessionInfo.sedeId();
        if (sedeId != null && !sedeId.equals(sessionSedeId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La sede indicada no coincide con el turno de caja");
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(data.createVenta(request, sessionSedeId, user));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        String msg = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(msg));
    }
}