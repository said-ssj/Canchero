package pe.canchero.backend.config;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import static org.junit.jupiter.api.Assertions.*;

class PasswordUtilTest {
    @Test
    void verifiesExistingBcryptVariantsAndRejectsWrongPasswords() {
        String stored = new BCryptPasswordEncoder(4).encode("unit-test-password");
        for (String version : new String[]{"$2a$", "$2b$", "$2y$"}) {
            String variant = version + stored.substring(4);
            assertTrue(PasswordUtil.matches("unit-test-password", variant));
            assertFalse(PasswordUtil.matches("incorrect-password", variant));
        }
    }

    @Test
    void newPasswordsUseSaltedBcrypt() {
        String first = PasswordUtil.hash("unit-test-password");
        String second = PasswordUtil.hash("unit-test-password");
        assertTrue(first.startsWith("$2a$12$"));
        assertNotEquals(first, second);
        assertTrue(PasswordUtil.matches("unit-test-password", first));
    }

    @Test
    void preservesLegacySha256VerificationWithoutTreatingPlaintextAsAHash() throws Exception {
        String legacy = "sha256:" + HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest("unit-test-password".getBytes(StandardCharsets.UTF_8)));
        assertTrue(PasswordUtil.matches("unit-test-password", legacy));
        assertFalse(PasswordUtil.matches("incorrect-password", legacy));
        assertFalse(PasswordUtil.matches("unit-test-password", "unit-test-password"));
    }

    @Test
    void rejectsMissingMalformedAndOverlongBcryptCredentials() {
        assertFalse(PasswordUtil.matches(null, "$2a$invalid"));
        assertFalse(PasswordUtil.matches("", "$2a$invalid"));
        assertFalse(PasswordUtil.matches("password", null));
        assertFalse(PasswordUtil.matches("password", ""));
        assertFalse(PasswordUtil.matches("password", "$2a$invalid"));
        String stored = new BCryptPasswordEncoder(4).encode("x".repeat(72));
        assertFalse(PasswordUtil.matches("x".repeat(73), stored));
        assertThrows(IllegalArgumentException.class, () -> PasswordUtil.hash("x".repeat(73)));
        assertThrows(IllegalArgumentException.class, () -> PasswordUtil.hash("á".repeat(37)));
    }
}
