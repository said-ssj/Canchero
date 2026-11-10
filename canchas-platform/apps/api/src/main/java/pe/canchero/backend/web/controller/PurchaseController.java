package pe.canchero.backend.web.controller;

import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.PurchaseService;
import pe.canchero.backend.web.dto.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/pos")
public class PurchaseController {
    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<ErrorResponse> handle(org.springframework.web.server.ResponseStatusException ex) {
        return org.springframework.http.ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
    }

    private final PurchaseService purchaseService;

    public PurchaseController(PurchaseService purchaseService) {
        this.purchaseService = purchaseService;
    }

    // =========================================================================
    // PROVEEDORES
    // =========================================================================

    @GetMapping("/suppliers")
    public List<SupplierDto> suppliers(
            @RequestParam Integer sedeId,
            @RequestParam(required = false, defaultValue = "false") boolean includeInactive,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return purchaseService.listSuppliers(sedeId, user, includeInactive);
    }

    @PostMapping("/suppliers")
    public SupplierDto createSupplier(
            @RequestBody SupplierRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return purchaseService.createSupplier(request, user);
    }

    @PutMapping("/suppliers/{id}")
    public SupplierDto updateSupplier(
            @PathVariable int id,
            @RequestBody SupplierRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return purchaseService.updateSupplier(id, request, user);
    }

    @PatchMapping("/suppliers/{id}/status")
    public Map<String, Object> toggleSupplierStatus(
            @PathVariable int id,
            @RequestParam Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        String estado = purchaseService.toggleSupplierStatus(id, sedeId, user);
        return Map.of("id", id, "estado", estado);
    }

    // =========================================================================
    // COMPRAS
    // =========================================================================

    @GetMapping("/purchases")
    public List<PurchaseDto> purchases(
            @RequestParam Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return purchaseService.listPurchases(sedeId, user);
    }

    @GetMapping("/purchases/{id}")
    public PurchaseDto purchase(
            @PathVariable int id,
            @RequestParam Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return purchaseService.getPurchase(id, sedeId, user);
    }

    @PostMapping("/purchases")
    public PurchaseDto createPurchase(
            @RequestBody PurchaseRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return purchaseService.createPurchase(request, user);
    }

    @PostMapping("/purchases/{id}/receive")
    public PurchaseDto receivePurchase(
            @PathVariable int id,
            @RequestParam Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return purchaseService.receivePurchase(id, sedeId, user);
    }

    @PostMapping("/purchases/{id}/cancel")
    public PurchaseDto cancelPurchase(
            @PathVariable int id,
            @RequestParam Integer sedeId,
            @RequestBody(required = false) Map<String, String> body,
            @RequestAttribute("auth.user") AuthUserDto user) {
        String motivo = body != null ? body.get("motivo") : null;
        return purchaseService.cancelPurchase(id, sedeId, motivo, user);
    }
}
