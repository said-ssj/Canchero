package pe.canchero.backend.service;

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

    public int requireOwnedVenue(Integer sedeId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (sedeId == null || sedeId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una sede");
        var owners = jdbc.queryForList("select id_dueno from sede where id_sede = ? and estado = 'A'", String.class, sedeId);
        if (owners.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sede no encontrada");
        if (!user.id().equals(owners.get(0))) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La sede no pertenece a tu cuenta");
        return sedeId;
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
        if (!user.id().equals(info.ownerId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La caja no pertenece a tu cuenta");
        }
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
        if (!user.id().equals(info.ownerId())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El turno no pertenece a tu cuenta");
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
                select r.id_reserva, r.id_usuario, r.id_cliente, cl.id_usuario as cliente_usuario_id, s.id_dueno
                from reserva r
                join cancha ca on ca.id_cancha = r.id_cancha
                join sede s on s.id_sede = ca.id_sede
                left join cliente cl on cl.id_cliente = r.id_cliente
                where r.id_reserva = ?
                """, (rs, rowNum) -> new String[] {
                    rs.getString("id_usuario"),
                    rs.getString("cliente_usuario_id"),
                    rs.getString("id_dueno")
                }, reservaId);
        if (list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada");
        String[] row = list.get(0);
        boolean isAdmin = "admin".equalsIgnoreCase(user.rol()) || "administrador".equalsIgnoreCase(user.rol());
        boolean isOwner = user.id().equals(row[2]);
        boolean isTitular = user.id().equals(row[0]) || user.id().equals(row[1]);
        if (!isAdmin && !isOwner && !isTitular) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes acceso a los pagos de esta reserva");
        }
    }

    public void requireOwnedSale(int saleId, AuthUserDto user) {
        if (user == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
        if (saleId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Venta inválida");
        var list = jdbc.query("""
                select v.id_venta, s.id_dueno
                from venta v
                left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                left join caja c on c.id_caja = sc.id_caja
                left join sede s on s.id_sede = c.id_sede
                where v.id_venta = ?
                """, (rs, rowNum) -> rs.getString("id_dueno"), saleId);
        if (list.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Venta no encontrada");
        String ownerId = list.get(0);
        boolean isAdmin = "admin".equalsIgnoreCase(user.rol()) || "administrador".equalsIgnoreCase(user.rol());
        if (!isAdmin && (ownerId == null || !user.id().equals(ownerId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La venta no pertenece a tu cuenta");
        }
    }
}
