package pe.canchero.backend.config;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

public final class PasswordUtil {
    private static final BCryptPasswordEncoder BCRYPT = new BCryptPasswordEncoder(12);

    private PasswordUtil() {
    }

    public static String hash(String raw) {
        if (raw == null || raw.isEmpty() || raw.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new IllegalArgumentException("La contrasena debe tener entre 1 y 72 bytes UTF-8.");
        }
        return BCRYPT.encode(raw);
    }

    private static String legacyHash(String raw) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] bytes = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            return "sha256:" + HexFormat.of().formatHex(bytes);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }

    public static boolean matches(String raw, String hashed) {
        if (raw == null || raw.isEmpty() || hashed == null || hashed.isEmpty()) return false;
        if (hashed.startsWith("$2a$") || hashed.startsWith("$2b$") || hashed.startsWith("$2y$")) {
            if (raw.getBytes(StandardCharsets.UTF_8).length > 72) return false;
            try { return BCRYPT.matches(raw, hashed); }
            catch (IllegalArgumentException ex) { return false; }
        }
        // Compatibilidad de solo lectura: no reescribir claves existentes al ingresar.
        if (hashed.matches("sha256:[0-9a-f]{64}")) {
            return MessageDigest.isEqual(legacyHash(raw).getBytes(StandardCharsets.US_ASCII),
                    hashed.getBytes(StandardCharsets.US_ASCII));
        }
        return false;
    }
}
