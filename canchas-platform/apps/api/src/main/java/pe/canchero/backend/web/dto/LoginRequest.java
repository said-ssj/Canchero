package pe.canchero.backend.web.dto;

public record LoginRequest(
        String email,
        String password,
        Boolean rememberMe) {
    public LoginRequest {
        rememberMe = rememberMe == null ? Boolean.TRUE : rememberMe;
    }

    public LoginRequest(String email, String password) {
        this(email, password, true);
    }
}
