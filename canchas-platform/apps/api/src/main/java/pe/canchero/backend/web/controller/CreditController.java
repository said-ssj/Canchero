package pe.canchero.backend.web.controller;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.CreditService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.*;

import java.util.List;

@RestController
@RequestMapping("/api/credits")
public class CreditController {
    private final CreditService creditService;
    private final VenueAccessService access;

    public CreditController(CreditService creditService, VenueAccessService access) {
        this.creditService = creditService;
        this.access = access;
    }

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatus(ResponseStatusException ex) {
        String msg = ex.getReason() != null ? ex.getReason() : ex.getStatusCode().toString();
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(msg));
    }

    @GetMapping
    public List<CreditAccountDto> listCredits(
            @RequestParam(required = false) Integer sedeId,
            @RequestParam(required = false) String estado,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return creditService.listCredits(sedeId, user, estado);
    }

    @GetMapping("/summary")
    public CreditSummaryDto summary(
            @RequestParam(required = false) Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return creditService.getSummary(sedeId, user);
    }

    @GetMapping("/{id}")
    public CreditAccountDto getCredit(
            @PathVariable int id,
            @RequestParam(required = false) Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return creditService.getCredit(id, sedeId, user);
    }

    @PostMapping
    public CreditAccountDto createCredit(
            @RequestBody CreditAccountRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return creditService.createCredit(request, user);
    }

    @PostMapping("/{id}/payments")
    public CreditAccountDto registerPayment(
            @PathVariable int id,
            @RequestBody CreditPaymentRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return creditService.registerPayment(id, request, user);
    }
}
