package pe.canchero.backend.web.controller;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import pe.canchero.backend.config.PasswordUtil;
import pe.canchero.backend.domain.entity.User;
import pe.canchero.backend.domain.enums.UserRole;
import pe.canchero.backend.repository.UserRepository;
import pe.canchero.backend.web.dto.AuthResponse;
import pe.canchero.backend.web.dto.ErrorResponse;
import pe.canchero.backend.web.dto.LoginRequest;
import pe.canchero.backend.web.dto.RegisterRequest;

import java.util.Optional;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final UserRepository users;

    public AuthController(UserRepository users) {
        this.users = users;
    }

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest request) {
        Optional<User> found = users.findByEmail(request.email().trim().toLowerCase());
        if (found.isEmpty() || !PasswordUtil.matches(request.password(), found.get().getPassword())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ErrorResponse("Credenciales inválidas"));
        }
        return ResponseEntity.ok(AuthResponse.from(found.get()));
    }

    @PostMapping("/register")
    public ResponseEntity<?> register(@RequestBody RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        if (users.existsByEmail(email)) {
            return ResponseEntity.status(HttpStatus.CONFLICT).body(new ErrorResponse("El email ya está registrado"));
        }
        UserRole rol = parseRol(request.rol());
        if (rol == null) {
            return ResponseEntity.badRequest().body(new ErrorResponse("Rol inválido"));
        }
        User user = new User();
        user.setId("u_" + System.currentTimeMillis());
        user.setNombre(request.nombre().trim());
        user.setEmail(email);
        user.setTelefono(request.telefono() == null ? "" : request.telefono().trim());
        user.setRol(rol);
        user.setPassword(PasswordUtil.hash(request.password()));
        users.save(user);
        return ResponseEntity.status(HttpStatus.CREATED).body(AuthResponse.from(user));
    }

    private UserRole parseRol(String rol) {
        if (rol == null) {
            return UserRole.PLAYER;
        }
        try {
            return UserRole.valueOf(rol.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}