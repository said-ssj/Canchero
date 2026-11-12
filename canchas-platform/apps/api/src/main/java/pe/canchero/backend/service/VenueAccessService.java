package pe.canchero.backend.service;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class VenueAccessService {
    public record BoxVenueInfo(int cajaId, int sedeId, String ownerId) {}
    public record SessionVenueInfo(int sesionId, int cajaId, int sedeId, String ownerId, boolean isOpen) {}

    private final JdbcTemplate jdbc;
    public VenueAccessService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public static final String PERSONAL_GESTIONAR = "personal.gestionar";
    public static final String VENTA_CREAR = "venta.crear";
    public static final String VENTA_VER = "venta.ver";
    public static final String INVENTARIO_INGRESAR = "inventario.ingresar";
    public static final String SEDE_EDITAR = "sede.editar";
    public static final String SEDE_ELIMINAR = "sede.eliminar";
    public static final String CANCHA_GESTIONAR = "cancha.gestionar";
    public static final String RESERVA_VER = "reserva.ver";
    public static final String RESERVA_GESTIONAR = "reserva.gestionar";
    public static final String RESERVA_CANCELAR = "reserva.cancelar";
    public static final String CAJA_OPERAR = "caja.operar";
    public static final String CAJA_SUPERVISAR = "caja.supervisar";
    public static final String PRODUCTO_VER = "producto.ver";
    public static final String PRODUCTO_GESTIONAR = "producto.gestionar";
    public static final String INVENTARIO_VER = "inventario.ver";
    public static final String REPORTE_VER = "reporte.ver";
    public static final String REPORTE_GESTIONAR = "reporte.gestionar";

    /**
     * Condición sobre la sede con alias {@code s}: propia o asignada con un permiso.
     * Parámetros en orden: id del usuario (UUID), id del usuario (UUID), código de permiso.
     */
    public static final String VISIBLE_VENUE_SQL = """
            (s.id_dueno = ? or exists (
                select 1 from asignacion_sede a
                join miembro_negocio m on m.id_miembro = a.id_miembro and m.id_negocio = a.id_negocio
                join rol_sede_permiso p on p.rol_codigo = a.rol_codigo
                where a.id_sede = s.id_sede and a.id_negocio = s.id_negocio
                  and a.estado = 'A' and m.estado = 'A' and m.id_usuario = ? and p.permiso_codigo = ?))
            """;

    public static boolean isSuperAdmin(AuthUserDto user) {
        return user != null && Roles.isSuperAdmin(user.rol());
    }

    public boolean can(AuthUserDto user, int sedeId, String ownerId, String permiso) {
        if (user == null) return false;
        if (isSuperAdmin(user)) return true;
        if (ownerId != null && user.id().equals(ownerId) && Roles.isOwner(user.rol())) return true;
        // Una asignación operativa no cambia el rol personal de la cuenta.
        return permiso != null && hasAssignment(user.id(), sedeId, permiso);
    }

    public boolean hasAssignment(String userId, int sedeId, String permiso) {
        UUID uuid;
        try { uuid = UUID.fromString(userId); } catch (RuntimeException ex) { return false; }
        Integer n = jdbc.queryForObject("""
                select count(*) from sede s
                join asignacion_sede a on a.id_sede=s.id_sede and a.id_negocio=s.id_negocio
                join miembro_negocio m on m.id_miembro=a.id_miembro and m.id_negocio=a.id_negocio
                join rol_sede_permiso p on p.rol_codigo=a.rol_codigo
                where s.id_sede=? and s.estado='A' and a.estado='A' and m.estado='A'
                  and m.id_usuario=? and p.permiso_codigo=?
                """, Integer.class, sedeId, uuid, permiso);
        return n != null && n > 0;
    }

    private void requireCan(AuthUserDto user, int sedeId, String ownerId, String permiso, String message) {
        if (!can(user, sedeId, ownerId, permiso)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }

    public void requireVenuePermission(int sedeId, String ownerId, AuthUserDto user, String permission) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        requireCan(user, sedeId, ownerId, permission, "La sede no pertenece a tu cuenta");
    }

    public int requireOwnedVenue(Integer sedeId, AuthUserDto user, String permission) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (sedeId == null || sedeId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una sede");
        var owners = jdbc.queryForList("select id_dueno from sede where id_sede = ? and estado = 'A'", String.class, sedeId);
        if (owners.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sede no encontrada");
        requireCan(user, sedeId, owners.get(0), permission, "La sede no pertenece a tu cuenta");
        return sedeId;
    }

    public int requireOwnedVenue(Integer sedeId, AuthUserDto user) {
        return requireOwnedVenue(sedeId, user, SEDE_EDITAR);
    }

    public int requirePermission(Integer sedeId, AuthUserDto user, String permission) {
        return requireOwnedVenue(sedeId, user, permission);
    }

    public boolean hasPermission(Integer sedeId, AuthUserDto user, String permission) {
        if (sedeId == null || user == null) return false;
        if (isSuperAdmin(user)) return true;
        UUID uuid;
        try { uuid = UUID.fromString(user.id()); } catch (RuntimeException ex) { return false; }
        Integer n = jdbc.queryForObject("select count(*) from sede s where s.id_sede = ? and s.estado = 'A' and " + VISIBLE_VENUE_SQL,
                Integer.class, sedeId, uuid, uuid, permission);
        return n != null && n > 0;
    }

    public java.util.List<Integer> authorizedVenues(AuthUserDto user, String permission) {
        if (user == null) return java.util.List.of();
        if (isSuperAdmin(user)) {
            return jdbc.queryForList("select id_sede from sede where estado = 'A' order by id_sede", Integer.class);
        }
        UUID uuid;
        try { uuid = UUID.fromString(user.id()); } catch (RuntimeException ex) { return java.util.List.of(); }
        return jdbc.queryForList("select id_sede from sede s where s.estado = 'A' and " + VISIBLE_VENUE_SQL + " order by id_sede",
                Integer.class, uuid, uuid, permission);
    }

    public void validateSameBusiness(int venueId1, int venueId2) {
        if (venueId1 == venueId2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Las sedes de origen y destino deben ser distintas");
        }
        boolean hasNegocio = isColumnPresent("sede", "id_negocio");
        String sql = hasNegocio
                ? """
                  select count(*) from sede s1, sede s2
                  where s1.id_sede = ? and s2.id_sede = ?
                    and s1.estado = 'A' and s2.estado = 'A'
                    and (
                      (s1.id_negocio is not null and s1.id_negocio = s2.id_negocio)
                      or (s1.id_dueno is not null and s1.id_dueno = s2.id_dueno)
                    )
                  """
                : """
                  select count(*) from sede s1, sede s2
                  where s1.id_sede = ? and s2.id_sede = ?
                    and s1.estado = 'A' and s2.estado = 'A'
                    and s1.id_dueno is not null and s1.id_dueno = s2.id_dueno
                  """;
        Integer match = jdbc.queryForObject(sql, Integer.class, venueId1, venueId2);
        if (match == null || match == 0) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "La operación solo está permitida entre sedes que pertenecen al mismo dueño o negocio");
        }
    }

    public void validateSameBusinessCourtMove(int courtId, Integer targetVenueId) {
        if (targetVenueId == null || targetVenueId <= 0) return;
        var currentVenues = jdbc.queryForList("select id_sede from cancha where id_cancha = ?", Integer.class, courtId);
        if (currentVenues.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cancha no encontrada");
        int sourceVenueId = currentVenues.get(0);
        if (sourceVenueId != targetVenueId) {
            validateSameBusiness(sourceVenueId, targetVenueId);
        }
    }

    private boolean isColumnPresent(String table, String column) {
        try {
            Integer count = jdbc.queryForObject("""
                    select count(*) from information_schema.columns
                    where lower(table_name) = lower(?) and lower(column_name) = lower(?)
                    """, Integer.class, table, column);
            return count != null && count > 0;
        } catch (Exception ex) {
            return false;
        }
    }

    public void requireOwnedCourt(Integer canchaId, AuthUserDto user) {
        if (canchaId == null || canchaId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancha inválida");
        var sedes = jdbc.queryForList("select id_sede from cancha where id_cancha = ?", Integer.class, canchaId);
        if (sedes.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cancha no encontrada");
        requirePermission(sedes.get(0), user, "cancha.gestionar");
    }

    public void requireOpenSession(Integer sessionId, int sedeId) {
        if (sessionId == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Abre un turno para vender");
        var count = jdbc.queryForObject("""
                select count(*) from sesion_caja sc join caja c on c.id_caja = sc.id_caja
                where sc.id_sesion_caja = ? and c.id_sede = ? and sc.estado = 'A'
                  and c.estado = 'A' and sc.fecha_cierre is null
                """, Integer.class, sessionId, sedeId);
        if (count == null || count == 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "El turno no esta abierto en esta sede");
    }

    public BoxVenueInfo requireOwnedBox(Integer cajaId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (cajaId == null || cajaId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Caja inválida");
        var list = jdbc.query("""
                select c.id_caja, c.id_sede, s.id_dueno
                from caja c
                join sede s on s.id_sede = c.id_sede
                where c.id_caja = ? and c.estado = 'A' and s.estado = 'A'
                """, (rs, rowNum) -> new BoxVenueInfo(rs.getInt("id_caja"), rs.getInt("id_sede"), rs.getString("id_dueno")), cajaId);
        if (list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Caja no encontrada");
        BoxVenueInfo info = list.get(0);
        requirePermission(info.sedeId(), user, "caja.operar");
        return info;
    }

    public SessionVenueInfo requireOwnedSession(Integer sessionId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (sessionId == null || sessionId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Turno de caja inválido");
        var list = jdbc.query("""
                select sc.id_sesion_caja, sc.id_caja, c.id_sede, s.id_dueno,
                       (sc.fecha_cierre is null and sc.estado = 'A') as is_open
                from sesion_caja sc
                join caja c on c.id_caja = sc.id_caja
                join sede s on s.id_sede = c.id_sede
                where sc.id_sesion_caja = ?
                """, (rs, rowNum) -> new SessionVenueInfo(
                        rs.getInt("id_sesion_caja"),
                        rs.getInt("id_caja"),
                        rs.getInt("id_sede"),
                        rs.getString("id_dueno"),
                        rs.getBoolean("is_open")), sessionId);
        if (list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Turno de caja no encontrado");
        SessionVenueInfo info = list.get(0);
        requirePermission(info.sedeId(), user, "caja.operar");
        if (!hasPermission(info.sedeId(), user, "caja.supervisar")) {
            Integer own = jdbc.queryForObject("select count(*) from sesion_caja where id_sesion_caja=? and id_usuario=?",
                    Integer.class, sessionId, java.util.UUID.fromString(user.id()));
            if (own == null || own != 1) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Solo puedes operar tu propio turno");
        }
        return info;
    }

    public SessionVenueInfo requireOpenOwnedSession(Integer sessionId, AuthUserDto user) {
        SessionVenueInfo info = requireOwnedSession(sessionId, user);
        if (!info.isOpen()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El turno de caja ya se encuentra cerrado");
        }
        return info;
    }

    public void requireReservationAccess(Integer reservaId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (reservaId == null || reservaId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Reserva inválida");
        var list = jdbc.query("""
                select r.id_reserva, r.id_usuario, r.id_cliente, cl.id_usuario as cliente_usuario_id, s.id_dueno, s.id_sede
                from reserva r
                join cancha ca on ca.id_cancha = r.id_cancha
                join sede s on s.id_sede = ca.id_sede
                left join cliente cl on cl.id_cliente = r.id_cliente
                where r.id_reserva = ?
                """, (rs, rowNum) -> new String[] {
                    rs.getString("id_usuario"),
                    rs.getString("cliente_usuario_id"),
                    rs.getString("id_dueno"), rs.getString("id_sede")
                }, reservaId);
        if (list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada");
        String[] row = list.get(0);
        boolean isAdmin = isSuperAdmin(user);
        boolean isOwner = hasPermission(Integer.parseInt(row[3]), user, "caja.operar");
        boolean isTitular = user.id().equals(row[0]) || user.id().equals(row[1]);
        if (!isAdmin && !isOwner && !isTitular) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes acceso a los pagos de esta reserva");
        }
    }

    public void requireOwnedSale(int saleId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (saleId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Venta inválida");
        var list = jdbc.query("""
                select v.id_venta, s.id_sede
                from venta v
                left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                left join caja c on c.id_caja = sc.id_caja
                left join sede s on s.id_sede = c.id_sede
                where v.id_venta = ?
                """, (rs, rowNum) -> rs.getString("id_sede"), saleId);
        if (list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Venta no encontrada");
        String venueId = list.get(0);
        boolean isAdmin = isSuperAdmin(user);
        if (!isAdmin && (venueId == null || !hasPermission(Integer.parseInt(venueId), user, "venta.ver"))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La venta no pertenece a tu cuenta");
        }
    }
}
