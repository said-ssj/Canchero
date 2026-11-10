package pe.canchero.backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthResponse;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.LoginRequest;
import pe.canchero.backend.web.dto.RegisterRequest;
import pe.canchero.backend.config.PasswordUtil;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.regex.Pattern;

/** Cuentas: login con límite de intentos, registro, acceso con Google y usuario de la sesión. */
@Service
public class AuthService extends JdbcSupport {
    private static final Set<String> PUBLIC_PLAYER_ROLES = Set.of("cliente", "jugador", "player");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");
    private static final java.security.SecureRandom RANDOM = new java.security.SecureRandom();
    private final AuthTokenService authTokenService;
    static final int INTENTOS_ANTES_DE_ESPERA = 5;
    public static final int INTENTOS_ANTES_DE_BLOQUEO = 10;

    public AuthService(JdbcTemplate jdbc, AuthTokenService authTokenService) {
        super(jdbc);
        this.authTokenService = authTokenService;
    }

    public boolean hasStaffAssignment(AuthUserDto user) {
        return !new TenantPermissions(jdbc).venues(user, "sede.ver").isEmpty();
    }

    private int roleId(String rawRole) {
        String normalized = normalize(rawRole);
        if (normalized.isEmpty()) {
            normalized = "cliente";
        }

        List<String> candidates;
        if (PUBLIC_PLAYER_ROLES.contains(normalized)) {
            candidates = List.of("cliente", "jugador", "player");
        } else if (Roles.isOwner(normalized)) {
            candidates = List.of("dueño", "dueno", "owner", "propietario");
        } else {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rol de registro no permitido");
        }

        for (String candidate : candidates) {
            List<Integer> ids = jdbc.queryForList("""
                            select id_rol
                            from rol
                            where estado = 'A' and lower(nombre) = lower(?)
                            limit 1
                            """,
                    Integer.class,
                    candidate);
            if (!ids.isEmpty()) {
                return ids.get(0);
            }
        }

        throw new ResponseStatusException(HttpStatus.CONFLICT, "El rol solicitado no se encuentra disponible");
    }

    private static final String CUENTA_BLOQUEADA = "Tu cuenta fue bloqueada por demasiados intentos fallidos. "
            + "Cambia tu contraseña con \"¿Olvidaste tu contraseña?\" o comunícate con soporte para desbloquearla.";

    /** El bloqueo ocurrió en este intento: el controlador avisa al dueño de la cuenta por correo. */
    public static class CuentaRecienBloqueada extends ResponseStatusException {
        public final String email;
        CuentaRecienBloqueada(String email) {
            super(HttpStatus.LOCKED, CUENTA_BLOQUEADA);
            this.email = email;
        }
    }

    /**
     * 5 fallos -> espera de 30 s; 5 fallos más -> bloqueo hasta cambio de contraseña o soporte.
     * Cada intento se "reserva" con un UPDATE atómico antes del bcrypt, así las peticiones en paralelo
     * no pueden saltarse el límite.
     */
    public Optional<AuthResponse> login(LoginRequest request) {
        String email = request.email().trim().toLowerCase();
        record Cuenta(UUID id, String nombre, String email, String telefono, String hash, String rol) {}
        var cuentas = jdbc.query("""
                        select u.id_usuario, u.nombre, u.correo as email, u.telefono, u.password_hash, r.nombre as rol
                        from usuario u
                        join rol r on r.id_rol = u.id_rol
                        where lower(u.correo) = ? and u.estado = 'A' and r.estado = 'A'
                        """,
                (rs, rowNum) -> new Cuenta(rs.getObject("id_usuario", UUID.class), rs.getString("nombre"),
                        rs.getString("email"), rs.getString("telefono"), rs.getString("password_hash"), rs.getString("rol")),
                email);
        if (cuentas.isEmpty()) return Optional.empty();
        Cuenta cuenta = cuentas.get(0);

        int reservado = jdbc.update("""
                update usuario
                set intentos_fallidos = intentos_fallidos + 1,
                    bloqueo_hasta = case when intentos_fallidos + 1 = ? then now() + interval '30' second else bloqueo_hasta end
                where id_usuario = ? and intentos_fallidos < ? and (bloqueo_hasta is null or bloqueo_hasta <= now())
                """, INTENTOS_ANTES_DE_ESPERA, cuenta.id(), INTENTOS_ANTES_DE_BLOQUEO);
        if (reservado == 0) throw intentoRechazado(cuenta.id());

        if (!PasswordUtil.matches(request.password(), cuenta.hash())) {
            Integer fallos = jdbc.queryForObject("select intentos_fallidos from usuario where id_usuario = ?", Integer.class, cuenta.id());
            int n = fallos == null ? 0 : fallos;
            if (n >= INTENTOS_ANTES_DE_BLOQUEO) throw new CuentaRecienBloqueada(cuenta.email());
            if (n == INTENTOS_ANTES_DE_ESPERA) {
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                        "Fallaste " + n + " intentos. Espera 30 segundos para volver a intentarlo. "
                                + "Si fallas " + (INTENTOS_ANTES_DE_BLOQUEO - n) + " veces más, tu cuenta se bloqueará.");
            }
            int quedan = (n < INTENTOS_ANTES_DE_ESPERA ? INTENTOS_ANTES_DE_ESPERA : INTENTOS_ANTES_DE_BLOQUEO) - n;
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Correo o contraseña incorrectos. Te quedan " + quedan
                    + (n < INTENTOS_ANTES_DE_ESPERA ? " intentos antes de una espera de 30 segundos." : " intentos antes de que tu cuenta se bloquee."));
        }

        jdbc.update("update usuario set intentos_fallidos = 0, bloqueo_hasta = null where id_usuario = ?", cuenta.id());
        return Optional.of(new AuthResponse(
                authTokenService.issue(cuenta.id(), request.rememberMe()),
                new AuthUserDto(cuenta.id().toString(), cuenta.nombre(), cuenta.email(), cuenta.telefono(), cuenta.rol())));
    }

    private ResponseStatusException intentoRechazado(UUID userId) {
        record Estado(int fallos, java.time.OffsetDateTime hasta) {}
        Estado estado = jdbc.queryForObject("select intentos_fallidos, bloqueo_hasta from usuario where id_usuario = ?",
                (rs, rowNum) -> new Estado(rs.getInt(1), rs.getObject(2, java.time.OffsetDateTime.class)), userId);
        if (estado.fallos() >= INTENTOS_ANTES_DE_BLOQUEO) return new ResponseStatusException(HttpStatus.LOCKED, CUENTA_BLOQUEADA);
        long segundos = estado.hasta() == null ? 30
                : Math.max(1, (java.time.Duration.between(java.time.OffsetDateTime.now(), estado.hasta()).toMillis() + 999) / 1000);
        return new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                "Demasiados intentos fallidos. Espera " + segundos + " segundos para volver a intentarlo.");
    }

    public Optional<AuthResponse> register(RegisterRequest request) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Datos de registro obligatorios");
        }
        if (request.nombre() == null || request.nombre().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre es obligatorio");
        }
        if (request.email() == null || request.email().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El correo electrónico es obligatorio");
        }
        String email = request.email().trim().toLowerCase(Locale.ROOT);
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El correo electrónico no es válido");
        }
        validatePassword(request.password());

        Integer exists = jdbc.queryForObject("select count(*) from usuario where lower(correo) = ?", Integer.class, email);
        if (exists != null && exists > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El email ya está registrado");
        }
        Integer rolId = roleId(request.rol());
        UUID userId = UUID.randomUUID();
        try {
            jdbc.update("""
                    insert into usuario (id_usuario, id_rol, nombre, correo, telefono, password_hash, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """,
                    userId, rolId, request.nombre().trim(), email,
                    request.telefono() == null ? "" : request.telefono().trim(),
                    PasswordUtil.hash(request.password()));
        } catch (org.springframework.dao.DuplicateKeyException ex) {
            // Dos registros simultáneos con el mismo correo: el índice único usuario_correo_unico decide.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El email ya está registrado");
        }
        return login(new LoginRequest(email, request.password()));
    }

    @org.springframework.transaction.annotation.Transactional
    public AuthResponse loginGoogle(UUID authId, String rawEmail, String name, String password, boolean rememberMe) {
        String email = normalize(rawEmail);
        if (!EMAIL_PATTERN.matcher(email).matches()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Correo de Google inválido");
        }
        // Serializa los callbacks de una misma identidad durante el alta o la vinculación.
        jdbc.query("select pg_advisory_xact_lock(?)", (rs, rowNum) -> true,
                authId.getMostSignificantBits() ^ authId.getLeastSignificantBits());
        List<UUID> linked = jdbc.queryForList("select id_usuario from public.usuario_auth_google where id_auth = ?",
                UUID.class, authId);
        UUID userId;
        if (!linked.isEmpty()) {
            userId = linked.get(0);
        } else {
            List<UUID> existing = jdbc.queryForList(
                    "select id_usuario from usuario where lower(correo) = ? for update", UUID.class, email);
            if (!existing.isEmpty()) {
                userId = existing.get(0);
                // El trigger de Supabase crea este perfil con el mismo UUID antes del callback.
                boolean provisionedBySupabase = userId.equals(authId) && Boolean.TRUE.equals(
                        jdbc.queryForObject("""
                                select exists (
                                    select 1 from public.usuario u
                                    join public.rol r on r.id_rol = u.id_rol
                                    where u.id_usuario = ? and u.usucre = 'AUTH_SIGNUP'
                                      and u.pccre = 'WEBAPP' and u.estado = 'A'
                                      and lower(r.nombre) in ('user', 'cliente', 'jugador') and r.estado = 'A'
                                      and coalesce(u.password_hash, '') in ('', 'oauth:google')
                                )
                                """, Boolean.class, userId));
                if (!provisionedBySupabase) {
                    if (password == null || password.isEmpty()) {
                        throw new ResponseStatusException(HttpStatus.PRECONDITION_REQUIRED, "Confirma tu contraseña de Canchero");
                    }
                    String hash = jdbc.queryForObject("select password_hash from usuario where id_usuario = ?",
                            String.class, userId);
                    if (!PasswordUtil.matches(password, hash) || currentUser(userId).isEmpty()) {
                        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "No se pudo confirmar la cuenta de Canchero");
                    }
                }
            } else {
                userId = UUID.randomUUID();
                String displayName = name.isBlank() ? "Jugador" : name.strip();
                displayName = displayName.substring(0, displayName.offsetByCodePoints(0,
                        Math.min(80, displayName.codePointCount(0, displayName.length()))));
                int created = jdbc.update("""
                        insert into usuario (id_usuario, id_rol, nombre, correo, telefono, password_hash,
                                             estado, usucre, pccre)
                        values (?, ?, ?, ?, '', 'oauth:google', 'A', 'API', 'SPRING')
                        on conflict do nothing
                        """, userId, roleId("cliente"), displayName, email);
                if (created != 1) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "La cuenta cambió. Vuelve a iniciar sesión con Google");
                }
            }
            int mapped = jdbc.update("""
                    insert into public.usuario_auth_google (id_auth, id_usuario)
                    values (?, ?) on conflict do nothing
                    """, authId, userId);
            if (mapped != 1) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "La cuenta ya está vinculada");
            }
        }
        return new AuthResponse(authTokenService.issue(userId, rememberMe), currentUser(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "La cuenta no está activa")));
    }

    public Optional<AuthUserDto> currentUser(UUID userId) {
        return jdbc.query("""
                        select u.id_usuario, u.nombre, u.correo as email, u.telefono, r.nombre as rol
                        from usuario u
                        join rol r on r.id_rol = u.id_rol
                        where u.id_usuario = ? and u.estado = 'A' and r.estado = 'A'
                        """,
                (rs, rowNum) -> new AuthUserDto(
                        rs.getObject("id_usuario", UUID.class).toString(),
                        rs.getString("nombre"),
                        rs.getString("email"),
                        rs.getString("telefono"),
                        rs.getString("rol")),
                userId).stream().findFirst();
    }

    private static void validatePassword(String password) {
        if (password == null || password.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña es obligatoria");
        }
        if (password.length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña debe contener al menos 8 caracteres");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña no debe exceder 72 bytes");
        }
    }

    /**
     * Crea un enlace de recuperación (30 min, un solo uso) y devuelve el token en claro para enviarlo por correo.
     * Vacío si el correo no tiene cuenta activa o si ya tiene un enlace vigente: no se reemplaza, así nadie puede anular el enlace del dueño pidiendo otro.
     */
    public Optional<String> requestPasswordReset(String rawEmail) {
        String email = rawEmail == null ? "" : rawEmail.trim().toLowerCase(Locale.ROOT);
        if (email.isEmpty()) return Optional.empty();
        String token = java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes());
        int updated = jdbc.update("""
                update usuario set reset_token_hash = ?, reset_expira = now() + interval '30' minute
                where lower(correo) = ? and estado = 'A'
                  and (reset_expira is null or reset_expira <= now())
                """, sha256(token), email);
        return updated == 1 ? Optional.of(token) : Optional.empty();
    }

    /** Cambia la contraseña con un enlace vigente; también desbloquea la cuenta. */
    public void resetPassword(String token, String newPassword) {
        validatePassword(newPassword);
        int updated = token == null || token.isBlank() ? 0 : jdbc.update("""
                update usuario
                set password_hash = ?, reset_token_hash = null, reset_expira = null,
                    intentos_fallidos = 0, bloqueo_hasta = null
                where reset_token_hash = ? and reset_expira > now() and estado = 'A'
                """, PasswordUtil.hash(newPassword), sha256(token.trim()));
        if (updated != 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El enlace no es válido o ya venció. Pide uno nuevo.");
        }
    }

    private static byte[] randomBytes() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    private static String sha256(String value) {
        try {
            return java.util.HexFormat.of().formatHex(
                    java.security.MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException ex) {
            throw new IllegalStateException(ex);
        }
    }
}
