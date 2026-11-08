package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.UpdateUserRoleRequest;
import pe.canchero.backend.web.dto.UserDto;

import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
public class UserService extends JdbcSupport {

    private static final Set<String> ROLES_PERMITIDOS_ASIGNACION = Set.of("cliente", "dueno", "admin");

    public UserService(JdbcTemplate jdbc) {
        super(jdbc);
    }

    public List<UserDto> listAllUsers(AuthUserDto authUser) {
        requireSuperAdmin(authUser);
        return jdbc.query("""
                select u.id_usuario, u.nombre, u.correo as email, coalesce(u.telefono, '') as telefono,
                       r.nombre as rol, coalesce(u.estado, 'A') as estado
                from usuario u
                join rol r on r.id_rol = u.id_rol
                order by u.nombre asc
                """, (rs, rowNum) -> new UserDto(
                rs.getObject("id_usuario", UUID.class).toString(),
                rs.getString("nombre"),
                rs.getString("email"),
                rs.getString("telefono"),
                rs.getString("rol"),
                rs.getString("estado")
        ));
    }

    @Transactional
    public UserDto updateUserRole(String userIdStr, UpdateUserRoleRequest request, AuthUserDto authUser) {
        requireSuperAdmin(authUser);

        UUID targetUserId;
        try {
            targetUserId = UUID.fromString(userIdStr.trim());
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "ID de usuario inválido");
        }

        UUID superAdminUuid = resolveOperationalUserId(authUser.id());
        if (targetUserId.equals(superAdminUuid)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "No puedes modificar tu propio rol de Superadministrador");
        }

        String rawRole = request.rol() == null ? "" : request.rol().trim().toLowerCase(Locale.ROOT);
        String targetRoleNorm = Roles.normalize(rawRole);
        if (!ROLES_PERMITIDOS_ASIGNACION.contains(targetRoleNorm)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rol no permitido. Roles válidos: cliente, dueno, admin");
        }

        // Buscar el id_rol correspondiente
        List<Integer> rolIds = jdbc.queryForList("""
                select id_rol from rol
                where estado = 'A' and lower(nombre) in (?, ?, ?)
                limit 1
                """, Integer.class, targetRoleNorm, "dueño".equals(targetRoleNorm) ? "dueno" : targetRoleNorm, rawRole);

        if (rolIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "El rol solicitado no existe en la base de datos");
        }
        int newRoleId = rolIds.get(0);

        int updated = jdbc.update("""
                update usuario
                set id_rol = ?, usmod = 'SUPERADMIN', pcmod = 'SPRING', fecmod = now()
                where id_usuario = ?
                """, newRoleId, targetUserId);

        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Usuario no encontrado");
        }

        return getUserById(targetUserId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error al recuperar usuario actualizado"));
    }

    public java.util.Optional<UserDto> getUserById(UUID userId) {
        List<UserDto> users = jdbc.query("""
                select u.id_usuario, u.nombre, u.correo as email, coalesce(u.telefono, '') as telefono,
                       r.nombre as rol, coalesce(u.estado, 'A') as estado
                from usuario u
                join rol r on r.id_rol = u.id_rol
                where u.id_usuario = ?
                """, (rs, rowNum) -> new UserDto(
                rs.getObject("id_usuario", UUID.class).toString(),
                rs.getString("nombre"),
                rs.getString("email"),
                rs.getString("telefono"),
                rs.getString("rol"),
                rs.getString("estado")
        ), userId);
        return users.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(users.get(0));
    }

    private void requireSuperAdmin(AuthUserDto authUser) {
        if (authUser == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida");
        }
        if (!Roles.isSuperAdmin(authUser.rol())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso exclusivo para Superadministrador");
        }
    }
}
