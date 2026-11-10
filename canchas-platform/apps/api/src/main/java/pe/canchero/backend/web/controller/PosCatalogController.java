package pe.canchero.backend.web.controller;

import java.util.List;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.PosCatalogService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.ErrorResponse;

@RestController
@RequestMapping("/api/pos/catalog")
public class PosCatalogController {
    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handle(org.springframework.web.server.ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode()).body(new ErrorResponse(ex.getReason()));
    }

    private final PosCatalogService catalog;
    public PosCatalogController(PosCatalogService catalog) { this.catalog = catalog; }

    @GetMapping("/categories")
    public List<PosCatalogService.Category> categories(
            @RequestParam Integer sedeId,
            @RequestParam(required = false, defaultValue = "false") boolean includeInactive,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return catalog.categories(sedeId, user, includeInactive);
    }

    @PostMapping("/categories")
    public PosCatalogService.Category category(
            @RequestBody PosCatalogService.CategoryRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return catalog.createCategory(request, user);
    }

    @PutMapping("/categories/{id}")
    public PosCatalogService.Category updateCategory(
            @PathVariable int id,
            @RequestBody PosCatalogService.CategoryRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return catalog.updateCategory(id, request, user);
    }

    @PatchMapping("/categories/{id}/status")
    public Map<String, String> toggleCategoryStatus(
            @PathVariable int id,
            @RequestParam Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        String estado = catalog.toggleCategoryStatus(id, sedeId, user);
        return Map.of("id", String.valueOf(id), "estado", estado);
    }

    @GetMapping("/products")
    public List<PosCatalogService.ProductDetail> products(
            @RequestParam Integer sedeId,
            @RequestParam(required = false) String estado,
            @RequestParam(required = false) Integer categoriaId,
            @RequestParam(required = false) String buscar,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return catalog.listProducts(sedeId, user, estado, categoriaId, buscar);
    }

    @GetMapping("/products/{id}")
    public PosCatalogService.ProductDetail product(
            @PathVariable int id,
            @RequestParam Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return catalog.getProduct(id, sedeId, user);
    }

    @PostMapping("/products")
    public Map<String, Integer> createProduct(
            @RequestBody PosCatalogService.ProductRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        return Map.of("id", catalog.createProduct(request, user));
    }

    @PutMapping("/products/{id}")
    public Map<String, Object> updateProduct(
            @PathVariable int id,
            @RequestBody PosCatalogService.ProductRequest request,
            @RequestAttribute("auth.user") AuthUserDto user) {
        catalog.updateProduct(id, request, user);
        return Map.of("id", id, "success", true);
    }

    @PatchMapping("/products/{id}/status")
    public Map<String, String> toggleProductStatus(
            @PathVariable int id,
            @RequestParam Integer sedeId,
            @RequestAttribute("auth.user") AuthUserDto user) {
        String estado = catalog.toggleProductStatus(id, sedeId, user);
        return Map.of("id", String.valueOf(id), "estado", estado);
    }
}
