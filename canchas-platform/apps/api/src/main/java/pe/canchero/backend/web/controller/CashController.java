package pe.canchero.backend.web.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.CashVenueStateService;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.CashAuditDto;
import pe.canchero.backend.web.dto.CashBoxDto;
import pe.canchero.backend.web.dto.CashMovementDto;
import pe.canchero.backend.web.dto.CashMovementRequest;
import pe.canchero.backend.web.dto.CashSessionDto;
import pe.canchero.backend.web.dto.CloseCashSessionRequest;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.OpenCashSessionRequest;

import java.util.List;

@RestController
@RequestMapping("/api/cash")
public class CashController {

    private final SupabaseDataService dataService;
    private final CashVenueStateService venueState;
    private final VenueAccessService access;

    public CashController(SupabaseDataService dataService, CashVenueStateService venueState, VenueAccessService access) {
        this.dataService = dataService;
        this.venueState = venueState;
        this.access = access;
    }

    @GetMapping("/venues/{sedeId}/state")
    public CashVenueStateService.State venueState(@PathVariable int sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return venueState.read(sedeId, user);
    }

    @GetMapping("/boxes")
    public List<CashBoxDto> boxes(@RequestParam(required = false) Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        if (sedeId != null) {
            int verifiedSedeId = access.requireOwnedVenue(sedeId, user);
            return dataService.listCashBoxes(verifiedSedeId);
        }
        return dataService.listCashBoxesForOwner(user.id());
    }

    @GetMapping("/sessions/open")
    public ResponseEntity<CashSessionDto> openSession(@RequestParam(required = false) Integer cajaId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        if (cajaId != null) {
            access.requireOwnedBox(cajaId, user);
            return dataService.getOpenCashSession(cajaId)
                    .map(ResponseEntity::ok)
                    .orElseGet(() -> ResponseEntity.noContent().build());
        }
        return dataService.getOpenCashSessionForOwner(user.id())
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }

    @PostMapping("/sessions")
    public CashSessionDto createSession(@RequestBody OpenCashSessionRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOwnedBox(request.cajaId(), user);
        return dataService.openCashSession(request, user);
    }

    @PatchMapping("/sessions/{id}/close")
    public CashAuditDto closeSession(@PathVariable int id,
            @RequestBody CloseCashSessionRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOpenOwnedSession(id, user);
        return dataService.closeCashSession(id, request, user);
    }

    @GetMapping("/sessions/{id}/movements")
    public List<CashMovementDto> movements(@PathVariable int id,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOwnedSession(id, user);
        return dataService.listCashMovements(id);
    }

    @PostMapping("/movements")
    public CashMovementDto createMovement(@RequestBody CashMovementRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOpenOwnedSession(request.sesionId(), user);
        return dataService.registerCashMovement(request);
    }

    @GetMapping("/audits")
    public List<CashAuditDto> audits(@RequestParam(required = false) Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        if (sedeId != null) {
            access.requireOwnedVenue(sedeId, user);
            return dataService.listCashAuditsForVenue(sedeId);
        }
        return dataService.listCashAuditsForOwner(user.id());
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        String msg = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(msg));
    }
}
