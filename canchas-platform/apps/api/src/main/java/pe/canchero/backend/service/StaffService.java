package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.StaffAssignmentDto;
import pe.canchero.backend.web.dto.StaffAssignmentRequest;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Personal de las sedes: el dueño (o un admin asignado) da roles operativos por sede. */
@Service
public class StaffService extends JdbcSupport {
    private static final Set<String> ROLES_SEDE = Set.of("admin", "cajero", "almacen", "ayudante");
    private static final Set<String> CUENTAS_JUGADOR = Set.of("user", "userpremium", "cliente", "jugador", "player");
    private static final String BASE_SQL = """
            select a.id_asignacion, a.id_sede, s.nombre as sede_nombre, u.id_usuario, u.nombre, u.correo, a.rol_codigo
            from asignacion_sede a
            join miembro_negocio m on m.id_miembro = a.id_miembro and m.id_negocio = a.id_negocio
            join usuario u on u.id_usuario = m.id_usuario
            join sede s on s.id_sede = a.id_sede and s.id_negocio = a.id_negocio
            where a.estado = 'A' and m.estado = 'A' and s.estado = 'A'
            """;

    private final VenueAccessService access;

    public StaffService(JdbcTemplate jdbc, VenueAccessService access) {
        super(jdbc);
        this.access = access;
    }

    /** Sedes y permisos de la persona autenticada (lo usa el panel para armar menú y selector de sede). */
    public List<StaffAssignmentDto> mine(AuthUserDto user) {
        UUID id = resolveOperationalUserId(user == null ? null : user.id());
        return jdbc.query(BASE_SQL + " and u.id_usuario = ? order by s.nombre", mapper(), id);
    }

    public List<StaffAssignmentDto> listForVenue(Integer sedeId, AuthUserDto user) {
        int sede = access.requireOwnedVenue(sedeId, user, VenueAccessService.PERSONAL_GESTIONAR);
        return jdbc.query(BASE_SQL + " and a.id_sede = ? order by u.nombre, a.rol_codigo", mapper(), sede);
    }

    @Transactional
    public StaffAssignmentDto assign(StaffAssignmentRequest request, AuthUserDto user) {
        if (request == null || request.sedeId() == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una sede");
        String rol = Roles.normalize(request.rol());
        if ("administrador".equals(rol)) rol = "admin";
        if (!ROLES_SEDE.contains(rol)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rol inválido. Usa admin, cajero, almacen o ayudante");
        }
        String email = request.email() == null ? "" : request.email().trim();
        if (email.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica el correo de la persona");

        Map<String, Object> sede = lockVenue(request.sedeId());
        String ownerId = java.util.Objects.toString(sede.get("id_dueno"), null);
        requireCanAssign(user, request.sedeId(), ownerId, rol);
        Object negocio = sede.get("id_negocio");
        if (negocio == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "La sede no tiene dueño");

        var cuentas = jdbc.query("""
                select u.id_usuario, r.nombre as rol from usuario u join rol r on r.id_rol = u.id_rol
                where lower(u.correo) = lower(?) and u.estado = 'A'
                """, (rs, n) -> Map.entry(rs.getObject("id_usuario", UUID.class), rs.getString("rol")), email);
        if (cuentas.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No hay una cuenta activa con ese correo");
        UUID target = cuentas.get(0).getKey();
        String targetRol = cuentas.get(0).getValue();
        if (Roles.isOwner(targetRol) || Roles.isSuperAdmin(targetRol)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Esa cuenta es de un dueño o superadministrador");
        }
        if (CUENTAS_JUGADOR.contains(Roles.normalize(targetRol))) {
            // El rol global solo abre el panel; lo que puede hacer en cada sede sale de sus asignaciones.
            int updated = jdbc.update("""
                    update usuario set id_rol = (select id_rol from rol where lower(nombre) = ? limit 1)
                    where id_usuario = ? and exists (select 1 from rol where lower(nombre) = ?)
                    """, rol, target, rol);
            if (updated == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "El rol " + rol + " no existe en la base");
        }

        Long miembro = jdbc.queryForObject("""
                insert into miembro_negocio (id_negocio, id_usuario) values (?, ?)
                on conflict (id_negocio, id_usuario) do update set estado = 'A'
                returning id_miembro
                """, Long.class, negocio, target);
        Long id = jdbc.queryForObject("""
                insert into asignacion_sede (id_negocio, id_miembro, id_sede, rol_codigo) values (?, ?, ?, ?)
                on conflict (id_miembro, id_sede, rol_codigo) do update set estado = 'A'
                returning id_asignacion
                """, Long.class, negocio, miembro, request.sedeId(), rol);
        return jdbc.query(BASE_SQL + " and a.id_asignacion = ?", mapper(), id).get(0);
    }

    @Transactional
    public void remove(long assignmentId, AuthUserDto user) {
        var rows = jdbc.queryForList("""
                select a.id_sede, a.rol_codigo, s.id_dueno
                from asignacion_sede a join sede s on s.id_sede = a.id_sede
                where a.id_asignacion = ? and a.estado = 'A' for update
                """, assignmentId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Asignación no encontrada");
        var row = rows.get(0);
        int sedeId = ((Number) row.get("id_sede")).intValue();
        requireCanAssign(user, sedeId, java.util.Objects.toString(row.get("id_dueno"), null), (String) row.get("rol_codigo"));
        jdbc.update("update asignacion_sede set estado = 'I' where id_asignacion = ?", assignmentId);
    }

    /** personal.gestionar en la sede; solo el dueño o el superadmin dan o quitan el rol admin. */
    private void requireCanAssign(AuthUserDto user, int sedeId, String ownerId, String rol) {
        access.requireVenuePermission(sedeId, ownerId, user, VenueAccessService.PERSONAL_GESTIONAR);
        boolean ownerOrSuper = VenueAccessService.isSuperAdmin(user) || user.id().equals(ownerId);
        if ("admin".equals(rol) && !ownerOrSuper) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo el dueño de la sede puede asignar o quitar administradores");
        }
    }

    private Map<String, Object> lockVenue(int sedeId) {
        var rows = jdbc.queryForList("select id_dueno, id_negocio from sede where id_sede = ? and estado = 'A' for update", sedeId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sede no encontrada");
        return rows.get(0);
    }

    private RowMapper<StaffAssignmentDto> mapper() {
        Map<String, List<String>> permisos = new HashMap<>();
        jdbc.query("select rol_codigo, permiso_codigo from rol_sede_permiso order by permiso_codigo",
                rs -> { permisos.computeIfAbsent(rs.getString(1), k -> new ArrayList<>()).add(rs.getString(2)); });
        return (rs, n) -> new StaffAssignmentDto(
                rs.getLong("id_asignacion"),
                rs.getInt("id_sede"),
                rs.getString("sede_nombre"),
                rs.getObject("id_usuario", UUID.class).toString(),
                rs.getString("nombre"),
                rs.getString("correo"),
                rs.getString("rol_codigo"),
                permisos.getOrDefault(rs.getString("rol_codigo"), List.of()));
    }
}
