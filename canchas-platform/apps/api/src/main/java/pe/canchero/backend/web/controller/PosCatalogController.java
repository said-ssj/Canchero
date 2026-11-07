package pe.canchero.backend.web.controller;

import java.util.List;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.PosCatalogService;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/pos/catalog")
public class PosCatalogController {
    @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<pe.canchero.backend.web.dto.ErrorResponse> handle(org.springframework.web.server.ResponseStatusException ex) {
        return org.springframework.http.ResponseEntity.status(ex.getStatusCode()).body(new pe.canchero.backend.web.dto.ErrorResponse(ex.getReason()));
    }
    private final PosCatalogService catalog;
    public PosCatalogController(PosCatalogService catalog) { this.catalog = catalog; }
    @GetMapping("/categories")
    public List<PosCatalogService.Category> categories(@RequestParam Integer sedeId, @RequestAttribute("auth.user") AuthUserDto user) {
        return catalog.categories(sedeId, user);
    }
    @PostMapping("/categories")
    public PosCatalogService.Category category(@RequestBody PosCatalogService.CategoryRequest request, @RequestAttribute("auth.user") AuthUserDto user) {
        return catalog.createCategory(request, user);
    }
    @PostMapping("/products")
    public java.util.Map<String,Integer> product(@RequestBody PosCatalogService.ProductRequest request, @RequestAttribute("auth.user") AuthUserDto user) {
        return java.util.Map.of("id", catalog.createProduct(request, user));
    }
}
