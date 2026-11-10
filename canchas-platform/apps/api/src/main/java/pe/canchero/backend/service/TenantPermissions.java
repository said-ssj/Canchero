package pe.canchero.backend.service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

/** La identidad siempre procede de la sesion; un rol admin nunca implica acceso global. */
public final class TenantPermissions {
    private final JdbcTemplate jdbc;
    public TenantPermissions(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public boolean has(AuthUserDto user, int venueId, String permission) {
        if (user == null) return false;
        if (scopedSchemaReady()) {
            return Boolean.TRUE.equals(jdbc.queryForObject(
                    "select public.tiene_permiso_sede(?, ?, ?)", Boolean.class, uuid(user), venueId, permission));
        } else {
            if (!Roles.isOwner(user.rol()) && !Roles.isSuperAdmin(user.rol())) return false;
            // Esquemas antiguos/de pruebas: solo propiedad real o superadmin; sin otorgar acceso al personal.
            return jdbc.queryForObject("select count(*) from sede where id_sede=? and estado='A' and (? or id_dueno=?)",
                    Integer.class, venueId, Roles.isSuperAdmin(user.rol()), legacyId(user)) > 0;
        }
    }

    public int require(AuthUserDto user, Integer venueId, String permission) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesion invalida o expirada");
        if (venueId == null || venueId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una sede");
        if (jdbc.queryForObject("select count(*) from sede where id_sede=? and estado='A'", Integer.class,venueId)==0)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Sede no encontrada");
        if (!has(user, venueId, permission))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes este permiso en la sede seleccionada");
        return venueId;
    }

    public List<Integer> venues(AuthUserDto user, String permission) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (scopedSchemaReady()) {
            return jdbc.queryForList("select id_sede from sede where estado='A' and public.tiene_permiso_sede(?,id_sede,?) order by id_sede",
                    Integer.class, uuid(user), permission);
        } else {
            return jdbc.queryForList("select id_sede from sede where estado='A' and (? or id_dueno=?) order by id_sede",
                    Integer.class, Roles.isSuperAdmin(user.rol()), legacyId(user));
        }
    }

    /** IDs enteros obtenidos de la BD, nunca SQL suministrado por el cliente. */
    public String scope(String venueColumn, AuthUserDto user, String permission) {
        List<Integer> ids = venues(user, permission);
        return venueColumn + " in (" + (ids.isEmpty() ? "-1" : ids.stream().map(String::valueOf).collect(Collectors.joining(","))) + ")";
    }

    private static UUID uuid(AuthUserDto user) {
        try { return UUID.fromString(user.id()); }
        catch (RuntimeException ex) { throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identidad invalida"); }
    }

    private static Object legacyId(AuthUserDto user) {
        try { return UUID.fromString(user.id()); }
        catch (IllegalArgumentException ex) { return user.id(); }
    }

    private boolean scopedSchemaReady() {
        return jdbc.queryForObject("select count(*) from information_schema.routines where lower(routine_schema)='public' and lower(routine_name)='tiene_permiso_sede'",Integer.class)>0;
    }
}
