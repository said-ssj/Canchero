package pe.canchero.backend.web.controller;

import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.util.Set;
import java.util.UUID;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.PhotoStorageService;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/storage")
public class PhotoStorageController {
    private static final Set<String> FOLDERS = Set.of("uploads", "canchas", "sedes/logos", "sedes/galeria");
    private final PhotoStorageService storage;

    public PhotoStorageController(PhotoStorageService storage) {
        this.storage = storage;
    }

    public record UploadResponse(String url) {}

    @PostMapping(value = "/images", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<UploadResponse> uploadImage(
            @RequestParam("file") MultipartFile file,
            @RequestParam(defaultValue = "uploads") String folder,
            HttpServletRequest request) throws IOException {
        Object rawUser = request.getAttribute("auth.user");
        if (!(rawUser instanceof AuthUserDto user))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Inicia sesión para subir una imagen");
        if (!FOLDERS.contains(folder))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Carpeta de imágenes no válida");
        if (file == null || file.isEmpty())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una imagen");
        if (file.getSize() > 5L * 1024 * 1024)
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "La imagen supera el límite de 5 MB");
        return ResponseEntity.ok(new UploadResponse(
                storage.upload(UUID.fromString(user.id()), folder, file.getBytes())));
    }
}
