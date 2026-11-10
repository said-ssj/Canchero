package pe.canchero.backend.web.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.service.PosService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.InventoryAdjustmentRequest;
import pe.canchero.backend.web.dto.InventoryEntryRequest;
import pe.canchero.backend.web.dto.InventoryMovementDto;
import pe.canchero.backend.web.dto.InventorySummaryDto;
import pe.canchero.backend.web.dto.InventoryTransferRequest;
import pe.canchero.backend.web.dto.InventoryTransferResultDto;
import pe.canchero.backend.web.dto.ProcessSaleRequest;
import pe.canchero.backend.web.dto.ProductDto;
import pe.canchero.backend.web.dto.SaleDto;
import pe.canchero.backend.web.dto.TransformationRequest;
import pe.canchero.backend.web.dto.TransformationResultDto;

import java.util.List;

@RestController
@RequestMapping("/api/pos")
public class PosController {
    @org.springframework.web.bind.annotation.ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<pe.canchero.backend.web.dto.ErrorResponse> handle(org.springframework.web.server.ResponseStatusException ex) {
        return org.springframework.http.ResponseEntity.status(ex.getStatusCode()).body(new pe.canchero.backend.web.dto.ErrorResponse(ex.getReason()));
    }

    private final PosService dataService;
    private final VenueAccessService access;

    public PosController(PosService dataService, VenueAccessService access) {
        this.dataService = dataService;
        this.access = access;
    }

    @GetMapping("/products")
    public List<ProductDto> products(@RequestParam(required = false) Integer sedeId, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        return dataService.listProducts(access.requirePermission(sedeId, user, "producto.ver"));
    }

    @GetMapping("/payment-capabilities")
    public java.util.Map<String, Boolean> paymentCapabilities(@RequestParam Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        access.requirePermission(sedeId, user, "producto.ver");
        return java.util.Map.of("ready", dataService.salePaymentsReady());
    }

    @GetMapping("/inventory")
    public List<InventoryMovementDto> inventory(@RequestParam(required = false) Integer sedeId, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        return dataService.listInventoryMovements(access.requirePermission(sedeId, user, "inventario.ver"));
    }

    @GetMapping("/inventory/summary")
    public InventorySummaryDto inventorySummary(@RequestParam(required = false) Integer sedeId, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        return dataService.getInventorySummary(access.requirePermission(sedeId, user, "inventario.ver"));
    }

    @PostMapping("/inventory/entries")
    public InventoryMovementDto inventoryEntry(@RequestBody InventoryEntryRequest request, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        access.requirePermission(request.sedeId(), user, "inventario.ingresar");
        return dataService.registerInventoryEntry(request);
    }

    @PostMapping("/inventory/adjustments")
    public InventoryMovementDto inventoryAdjustment(@RequestBody InventoryAdjustmentRequest request, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        access.requirePermission(request.sedeId(), user, "inventario.ingresar");
        return dataService.registerInventoryAdjustment(request);
    }

    @PostMapping("/inventory/transformations")
    public TransformationResultDto executeTransformation(@RequestBody TransformationRequest request, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        access.requirePermission(request.sedeId(), user, "inventario.ingresar");
        return dataService.executeTransformation(request);
    }

    @PostMapping("/inventory/transfers")
    public InventoryTransferResultDto transferInventory(@RequestBody InventoryTransferRequest request, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        if (request == null) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.BAD_REQUEST, "Datos requeridos");
        access.requirePermission(request.sourceSedeId(), user, "producto.gestionar");
        access.requirePermission(request.targetSedeId(), user, "producto.gestionar");
        access.validateSameBusiness(request.sourceSedeId(), request.targetSedeId());
        return dataService.transferInventory(request, user);
    }

    @GetMapping("/sales")
    public List<SaleDto> sales(@RequestParam(required = false) Integer sedeId, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        return dataService.listSales(access.requirePermission(sedeId, user, "venta.ver"));
    }

    @PostMapping("/sales")
    public SaleDto processSale(@RequestBody ProcessSaleRequest request, @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        int sedeId = access.requirePermission(request.sedeId(), user, "venta.crear");
        access.requireOwnedSession(request.sesionCajaId(), user);
        return dataService.processSale(new ProcessSaleRequest(request.tipoComprobante(), request.metodoPago(),
                user.nombre(), request.clienteNombre(), request.clienteDocumento(), request.montoPagado(),
                request.sesionCajaId(), sedeId, user.id(), request.items(), request.pagos(), request.idempotencyKey()));
    }
}
