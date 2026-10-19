package pe.canchero.backend.web.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.InventoryEntryRequest;
import pe.canchero.backend.web.dto.InventoryMovementDto;
import pe.canchero.backend.web.dto.ProcessSaleRequest;
import pe.canchero.backend.web.dto.ProductDto;
import pe.canchero.backend.web.dto.SaleDto;

import java.util.List;

@RestController
@RequestMapping("/api/pos")
public class PosController {
    @org.springframework.web.bind.annotation.ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<pe.canchero.backend.web.dto.ErrorResponse> handle(org.springframework.web.server.ResponseStatusException ex) {
        return org.springframework.http.ResponseEntity.status(ex.getStatusCode()).body(new pe.canchero.backend.web.dto.ErrorResponse(ex.getReason()));
    }

    private final SupabaseDataService dataService;
    private final VenueAccessService access;

    public PosController(SupabaseDataService dataService, VenueAccessService access) {
        this.dataService = dataService;
        this.access = access;
    }

    @GetMapping("/products")
    public List<ProductDto> products(@RequestParam(required = false) Integer sedeId, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        return dataService.listProducts(access.requireOwnedVenue(sedeId, user));
    }

    @GetMapping("/payment-capabilities")
    public java.util.Map<String, Boolean> paymentCapabilities(@RequestParam Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requireOwnedVenue(sedeId, user);
        return java.util.Map.of("ready", dataService.salePaymentsReady());
    }

    @GetMapping("/inventory")
    public List<InventoryMovementDto> inventory(@RequestParam(required = false) Integer sedeId, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        return dataService.listInventoryMovements(access.requireOwnedVenue(sedeId, user));
    }

    @PostMapping("/inventory/entries")
    public InventoryMovementDto inventoryEntry(@RequestBody InventoryEntryRequest request, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        access.requireOwnedVenue(request.sedeId(), user);
        return dataService.registerInventoryEntry(request);
    }

    @GetMapping("/sales")
    public List<SaleDto> sales(@RequestParam(required = false) Integer sedeId, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        return dataService.listSales(access.requireOwnedVenue(sedeId, user));
    }

    @PostMapping("/sales")
    public SaleDto processSale(@RequestBody ProcessSaleRequest request, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        int sedeId = access.requireOwnedVenue(request.sedeId(), user);
        return dataService.processSale(new ProcessSaleRequest(request.tipoComprobante(), request.metodoPago(),
                user.nombre(), request.clienteNombre(), request.clienteDocumento(), request.montoPagado(),
                request.sesionCajaId(), sedeId, user.id(), request.items(), request.pagos(), request.idempotencyKey()));
    }
}
