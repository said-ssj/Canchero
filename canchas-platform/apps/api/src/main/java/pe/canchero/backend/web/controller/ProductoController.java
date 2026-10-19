package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.ProductoRequest;
import pe.canchero.backend.web.dto.ProductoResponse;

import java.util.List;

@RestController
@RequestMapping("/api/productos")
public class ProductoController {

    private final SupabaseDataService data;
    private final VenueAccessService access;

    public ProductoController(SupabaseDataService data, VenueAccessService access) {
        this.data = data;
        this.access = access;
    }

    @GetMapping
    public ResponseEntity<List<ProductoResponse>> list(@RequestParam(required = false) String estado, @RequestParam(required = false) Integer sedeId,
            @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        return ResponseEntity.ok(data.listProductos(estado, access.requireOwnedVenue(sedeId, user)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> get(@PathVariable int id, @RequestParam(required = false) Integer sedeId,
            @RequestAttribute(value = "auth.user", required = false) AuthUserDto user) {
        return data.listProductos(null, access.requireOwnedVenue(sedeId, user)).stream().filter(p -> p.id().equals(String.valueOf(id))).findFirst()
                .<ResponseEntity<?>>map(ResponseEntity::ok)
                .orElse(ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ErrorResponse("Producto no encontrado")));
    }

    @PostMapping
    public ResponseEntity<ProductoResponse> create(@RequestBody ProductoRequest request) {
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED, "Alta de productos pendiente de contrato por sede");
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable int id, @RequestBody ProductoRequest request) {
        throw new ResponseStatusException(HttpStatus.NOT_IMPLEMENTED, "Edicion de productos globales no permitida sin contrato por sede");
    }
}
