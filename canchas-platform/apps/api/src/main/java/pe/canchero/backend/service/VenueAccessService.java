package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

import java.util.UUID;

@Service
public class VenueAccessService {
    public record BoxVenueInfo(int cajaId, int sedeId, String ownerId) {}
    public record SessionVenueInfo(int sesionId, int cajaId, int sedeId, String ownerId, boolean isOpen, String operatorId) {}

    // Códigos de permiso_sede (los permisos de cada rol están en rol_sede_permiso).
    public static final String SEDE_EDITAR = "sede.editar";
    public static final String SEDE_ELIMINAR = "sede.eliminar";
    public static final String CANCHA_GESTIONAR = "cancha.gestionar";
    public static final String RESERVA_VER = "reserva.ver";
    public static final String RESERVA_GESTIONAR = "reserva.gestionar";
    public static final String RESERVA_CANCELAR = "reserva.cancelar";
    public static final String CAJA_OPERAR = "caja.operar";
    public static final String CAJA_SUPERVISAR = "caja.supervisar";
    public static final String VENTA_VER = "venta.ver";
    public static final String VENTA_CREAR = "venta.crear";
    public static final String PRODUCTO_VER = "producto.ver";
    public static final String PRODUCTO_GESTIONAR = "producto.gestionar";
    public static final String INVENTARIO_VER = "inventario.ver";
    public static final String INVENTARIO_INGRESAR = "inventario.ingresar";
    public static final String PERSONAL_GESTIONAR = "personal.gestionar";
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

    private final JdbcTemplate jdbc;
    public VenueAccessService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** El superadmin controla toda la plataforma. */
    public static boolean isSuperAdmin(AuthUserDto user) {
        return user != null && Roles.isSuperAdmin(user.rol());
    }

    /** Superadmin, dueño de la sede (con rol dueno vigente), o personal asignado a esa sede con el permiso. */
    public boolean can(AuthUserDto user, int sedeId, String ownerId, String permiso) {
        if (user == null) return false;
        if (isSuperAdmin(user)) return true;
        if (ownerId != null && user.id().equals(ownerId)) return Roles.isOwner(user.rol());
        return permiso != null && Roles.isVenueStaff(user.rol()) && hasAssignment(user.id(), sedeId, permiso);
    }

    public boolean hasAssignment(String userId, int sedeId, String permiso) {
        UUID uuid;
        try { uuid = UUID.fromString(userId); } catch (RuntimeException ex) { return false; }
        Integer n = jdbc.queryForObject("select count(*) from sede s where s.id_sede = ? and "
                + VISIBLE_VENUE_SQL, Integer.class, sedeId, uuid, uuid, permiso);
        return n != null && n > 0;
    }

    private void requireCan(AuthUserDto user, int sedeId, String ownerId, String permiso, String message) {
        if (!can(user, sedeId, ownerId, permiso)) throw new ResponseStatusException(HttpStatus.FORBIDDEN, message);
    }

    /** Comprueba el permiso con el dueño ya leído (p. ej. con "for update"). */
    public void requireVenuePermission(int sedeId, String ownerId, AuthUserDto user, String permiso) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        requireCan(user, sedeId, ownerId, permiso, "La sede no pertenece a tu cuenta");
    }

    public int requireOwnedVenue(Integer sedeId, AuthUserDto user, String permiso) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (sedeId == null || sedeId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una sede");
        var owners = jdbc.queryForList("select id_dueno from sede where id_sede = ? and estado = 'A'", String.class, sedeId);
        if (owners.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sede no encontrada");
        requireCan(user, sedeId, owners.get(0), permiso, "La sede no pertenece a tu cuenta");
        return sedeId;
    }

    public void requireOwnedCourt(Integer canchaId, AuthUserDto user, String permiso) {
        if (canchaId == null || canchaId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancha inválida");
        var sedes = jdbc.queryForList("select id_sede from cancha where id_cancha = ?", Integer.class, canchaId);
        if (sedes.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cancha no encontrada");
        requireOwnedVenue(sedes.get(0), user, permiso);
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

    public BoxVenueInfo requireOwnedBox(Integer cajaId, AuthUserDto user, String permiso) {
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
        requireCan(user, info.sedeId(), info.ownerId(), permiso, "La caja no pertenece a tu cuenta");
        return info;
    }

    /** El turno propio pide caja.operar; el de otra persona, caja.supervisar. */
    public SessionVenueInfo requireOwnedSession(Integer sessionId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (sessionId == null || sessionId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Turno de caja inválido");
        var list = jdbc.query("""
                select sc.id_sesion_caja, sc.id_caja, c.id_sede, s.id_dueno, sc.id_usuario,
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
                        rs.getBoolean("is_open"),
                        rs.getString("id_usuario")), sessionId);
        if (list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Turno de caja no encontrado");
        SessionVenueInfo info = list.get(0);
        String permiso = user.id().equals(info.operatorId()) ? CAJA_OPERAR : CAJA_SUPERVISAR;
        requireCan(user, info.sedeId(), info.ownerId(), permiso, "El turno no pertenece a tu cuenta");
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
                    rs.getString("id_dueno"),
                    rs.getString("id_sede")
                }, reservaId);
        if (list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada");
        String[] row = list.get(0);
        boolean isTitular = user.id().equals(row[0]) || user.id().equals(row[1]);
        if (!isTitular && !can(user, Integer.parseInt(row[3]), row[2], RESERVA_VER)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes acceso a los pagos de esta reserva");
        }
    }

    public void requireOwnedSale(int saleId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (saleId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Venta inválida");
        var list = jdbc.query("""
                select v.id_venta, s.id_dueno, s.id_sede
                from venta v
                left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                left join caja c on c.id_caja = sc.id_caja
                left join sede s on s.id_sede = c.id_sede
                where v.id_venta = ?
                """, (rs, rowNum) -> new String[] {rs.getString("id_dueno"), rs.getString("id_sede")}, saleId);
        if (list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Venta no encontrada");
        String[] row = list.get(0);
        // Una venta sin turno no tiene sede: solo el superadmin la ve.
        if (!(row[1] == null ? isSuperAdmin(user) : can(user, Integer.parseInt(row[1]), row[0], VENTA_VER))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La venta no pertenece a tu cuenta");
        }
    }
}
