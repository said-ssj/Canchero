package pe.canchero.backend.web.dto;

public record RegisterRequest(
        String nombre,
        String email,
        String telefono,
        String rol,
        String password,
        boolean termsAccepted,
        boolean privacyNoticeAcknowledged,
        String termsVersion,
        String privacyVersion) {
    public static final String TERMS_VERSION = "2026-11-17";
    public static final String PRIVACY_VERSION = "2026-11-17";

    public RegisterRequest(String nombre, String email, String telefono, String rol, String password) {
        this(nombre, email, telefono, rol, password, true, true, TERMS_VERSION, PRIVACY_VERSION);
    }
}