package pe.canchero.backend.service;

import java.net.URI;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PhotoStorageService {
    private static final String BUCKET = "canchero-media";
    private final String projectUrl;
    private final String serviceKey;

    public PhotoStorageService(@Value("${SUPABASE_URL:}") String projectUrl,
            @Value("${SUPABASE_SERVICE_ROLE_KEY:}") String serviceKey) {
        this.projectUrl = projectUrl == null ? "" : projectUrl.replaceAll("/+$", "");
        this.serviceKey = serviceKey == null ? "" : serviceKey.trim();
    }

    public String upload(UUID userId, String folder, byte[] bytes) {
        if (userId == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Inicia sesión para subir una imagen");
        if (bytes == null || bytes.length == 0 || bytes.length > 5 * 1024 * 1024)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La imagen debe pesar entre 1 byte y 5 MB");
        ImageType type = detect(bytes);
        if (type == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Solo se aceptan imágenes JPEG, PNG o WebP válidas");
        URI base;
        try {
            base = URI.create(projectUrl);
        } catch (IllegalArgumentException ex) {
            throw unavailable();
        }
        if (!"https".equalsIgnoreCase(base.getScheme()) || base.getHost() == null || base.getUserInfo() != null
                || base.getQuery() != null || base.getFragment() != null || !base.getPath().isEmpty()
                || serviceKey.isBlank() || serviceKey.startsWith("sb_publishable_")) throw unavailable();

        String path = "users/" + userId + "/" + folder + "/" + UUID.randomUUID() + "." + type.extension();
        try {
            RestClient.builder().baseUrl(projectUrl)
                    .defaultHeader("apikey", serviceKey)
                    .defaultHeader("Authorization", "Bearer " + serviceKey)
                    .build()
                    .post().uri("/storage/v1/object/" + BUCKET + "/" + path)
                    .contentType(MediaType.parseMediaType(type.contentType()))
                    .header("x-upsert", "false")
                    .body(bytes)
                    .retrieve().toBodilessEntity();
        } catch (RestClientException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "No se pudo guardar la imagen en el almacenamiento");
        }
        return projectUrl + "/storage/v1/object/public/" + BUCKET + "/" + path;
    }

    private static ImageType detect(byte[] bytes) {
        if (bytes.length >= 3 && (bytes[0] & 0xff) == 0xff && (bytes[1] & 0xff) == 0xd8 && (bytes[2] & 0xff) == 0xff)
            return new ImageType("jpg", "image/jpeg");
        if (bytes.length >= 8 && (bytes[0] & 0xff) == 0x89 && bytes[1] == 'P' && bytes[2] == 'N'
                && bytes[3] == 'G' && (bytes[4] & 0xff) == 0x0d && (bytes[5] & 0xff) == 0x0a
                && (bytes[6] & 0xff) == 0x1a && (bytes[7] & 0xff) == 0x0a)
            return new ImageType("png", "image/png");
        if (bytes.length >= 12 && ascii(bytes, 0, "RIFF") && ascii(bytes, 8, "WEBP"))
            return new ImageType("webp", "image/webp");
        return null;
    }

    private static boolean ascii(byte[] bytes, int offset, String text) {
        for (int i = 0; i < text.length(); i++) if (bytes[offset + i] != text.charAt(i)) return false;
        return true;
    }

    private static ResponseStatusException unavailable() {
        return new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "El almacenamiento privado del servidor todavía no está configurado");
    }

    private record ImageType(String extension, String contentType) {}
}
