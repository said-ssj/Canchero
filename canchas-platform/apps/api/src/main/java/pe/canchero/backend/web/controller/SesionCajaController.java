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
import pe.canchero.backend.web.dto.SesionCajaRequest;
import pe.canchero.backend.web.dto.SesionCajaResponse;

import java.util.List;

@RestController
@RequestMapping("/api/sesiones-caja")
public class SesionCajaController {

    private final SupabaseDataService data;
    private final VenueAccessService access;

    public SesionCajaController(SupabaseDataService data, VenueAccessService access) {
        this.data = data;
        this.access = access;
    }

    @GetMapping
    public ResponseEntity<List<SesionCajaResponse>> list(@RequestParam(required = false) String cajaId,
            @RequestParam(required = false) Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        if (cajaId != null && !cajaId.isBlank()) {
            int cId;
            try {
                cId = Integer.parseInt(cajaId);
            } catch (NumberFormatException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Caja inválida");
            }
            access.requireOwnedBox(cId, user);
            return ResponseEntity.ok(data.listSesionesCaja(cId));
        }
        if (sedeId != null) {
            access.requireOwnedVenue(sedeId, user);
            return ResponseEntity.ok(data.listSesionesCajaForVenue(sedeId));
        }
        return ResponseEntity.ok(data.listSesionesCajaForOwner(user.id()));
    }

    @PostMapping("/abrir")
    public ResponseEntity<SesionCajaResponse> open(@RequestBody SesionCajaRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        if (request.cajaId() == null || request.cajaId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Caja inválida");
        }
        int cId;
        try {
            cId = Integer.parseInt(request.cajaId());
        } catch (NumberFormatException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Caja inválida");
        }
        access.requireOwnedBox(cId, user);
        return ResponseEntity.status(HttpStatus.CREATED).body(data.openSesionCaja(request, user));
    }

    @PostMapping("/{id}/cerrar")
    public ResponseEntity<?> close(@PathVariable int id,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOpenOwnedSession(id, user);
        return data.closeSesionCaja(id, user)
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Sesión de caja no encontrada o ya cerrada")));
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        String msg = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(msg));
    }
}