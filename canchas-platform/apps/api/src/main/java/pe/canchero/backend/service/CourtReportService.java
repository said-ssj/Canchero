package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.CourtReportRequest;
import pe.canchero.backend.web.dto.CourtReportResponse;
import pe.canchero.backend.web.dto.UpdateCourtReportStatusRequest;

import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
public class CourtReportService extends JdbcSupport {

    private static final Set<String> ESTADOS_VALIDOS = Set.of("PENDIENTE", "EN_REVISION", "RESUELTO", "DESCARTADO");
    private static final Set<String> PRIORIDADES_VALIDAS = Set.of("BAJA", "MEDIA", "ALTA", "URGENTE");
    private static final DateTimeFormatter ISO_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");

    private final VenueAccessService venueAccess;

    public CourtReportService(JdbcTemplate jdbc, VenueAccessService venueAccess) {
        super(jdbc);
        this.venueAccess = venueAccess;
    }

    @Transactional
    public CourtReportResponse createReport(CourtReportRequest request, AuthUserDto authUser) {
        if (authUser == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para reportar una cancha");
        }
        if (request == null || request.canchaId() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica la cancha a reportar");
        }
        if (request.tipoProblema() == null || request.tipoProblema().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica el tipo de problema");
        }
        String descripcion = request.descripcion() == null ? "" : request.descripcion().trim();
        if (descripcion.length() < 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La descripción debe tener al menos 5 caracteres");
        }
        if (descripcion.length() > 1000) {
            descripcion = descripcion.substring(0, 1000);
        }

        record CanchaInfo(int idCancha, String nombreCancha, int idSede, String nombreSede) {}
        List<CanchaInfo> canchas = jdbc.query("""
                select c.id_cancha, c.nombre_numero as nombre_cancha, c.id_sede, s.nombre as nombre_sede
                from cancha c
                join sede s on s.id_sede = c.id_sede
                where c.id_cancha = ? and c.estado = 'A' and s.estado = 'A'
                """, (rs, i) -> new CanchaInfo(
                rs.getInt("id_cancha"),
                rs.getString("nombre_cancha"),
                rs.getInt("id_sede"),
                rs.getString("nombre_sede")), request.canchaId());

        if (canchas.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cancha no encontrada o inactiva");
        }
        CanchaInfo cancha = canchas.get(0);

        UUID userUuid = resolveOperationalUserId(authUser.id());
        String tipo = request.tipoProblema().trim().toUpperCase();
        String prioridad = request.prioridad() != null && PRIORIDADES_VALIDAS.contains(request.prioridad().trim().toUpperCase())
                ? request.prioridad().trim().toUpperCase() : "MEDIA";

        String finalDescripcion = descripcion;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into reporte_cancha (id_cancha, id_sede, id_usuario, tipo_problema, descripcion, estado, prioridad, usucre, pccre)
                    values (?, ?, ?, ?, ?, 'PENDIENTE', ?, 'API', 'SPRING')
                    """, new String[]{"id_reporte"});
            ps.setInt(1, cancha.idCancha());
            ps.setInt(2, cancha.idSede());
            ps.setObject(3, userUuid);
            ps.setString(4, tipo);
            ps.setString(5, finalDescripcion);
            ps.setString(6, prioridad);
            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();
        int reportId = key != null ? key.intValue() : 0;

        return getReportById(reportId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo recuperar el reporte creado"));
    }

    public List<CourtReportResponse> listAllReports(AuthUserDto authUser) {
        if (authUser == null || !Roles.isAdmin(authUser.rol())) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Acceso restringido a administradores");
        }
        return jdbc.query("""
                select r.id_reporte, r.id_cancha, c.nombre_numero as nombre_cancha,
                       r.id_sede, s.nombre as nombre_sede,
                       r.id_usuario, u.nombre as nombre_usuario,
                       r.tipo_problema, r.descripcion, r.estado, r.prioridad,
                       r.resolucion, r.fecha_resolucion, r.fecha_creacion
                from reporte_cancha r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = r.id_sede
                join usuario u on u.id_usuario = r.id_usuario
                order by r.fecha_creacion desc
                """, this::mapReportRow);
    }

    public List<CourtReportResponse> listReportsByVenue(int sedeId, AuthUserDto authUser) {
        venueAccess.requireOwnedVenue(sedeId, authUser);
        return jdbc.query("""
                select r.id_reporte, r.id_cancha, c.nombre_numero as nombre_cancha,
                       r.id_sede, s.nombre as nombre_sede,
                       r.id_usuario, u.nombre as nombre_usuario,
                       r.tipo_problema, r.descripcion, r.estado, r.prioridad,
                       r.resolucion, r.fecha_resolucion, r.fecha_creacion
                from reporte_cancha r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = r.id_sede
                join usuario u on u.id_usuario = r.id_usuario
                where r.id_sede = ?
                order by r.fecha_creacion desc
                """, this::mapReportRow, sedeId);
    }

    public List<CourtReportResponse> listReportsByCourt(int canchaId, AuthUserDto authUser) {
        venueAccess.requireOwnedCourt(canchaId, authUser);
        return jdbc.query("""
                select r.id_reporte, r.id_cancha, c.nombre_numero as nombre_cancha,
                       r.id_sede, s.nombre as nombre_sede,
                       r.id_usuario, u.nombre as nombre_usuario,
                       r.tipo_problema, r.descripcion, r.estado, r.prioridad,
                       r.resolucion, r.fecha_resolucion, r.fecha_creacion
                from reporte_cancha r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = r.id_sede
                join usuario u on u.id_usuario = r.id_usuario
                where r.id_cancha = ?
                order by r.fecha_creacion desc
                """, this::mapReportRow, canchaId);
    }

    public List<CourtReportResponse> listMyReports(AuthUserDto authUser) {
        if (authUser == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida");
        }
        UUID userUuid = resolveOperationalUserId(authUser.id());
        return jdbc.query("""
                select r.id_reporte, r.id_cancha, c.nombre_numero as nombre_cancha,
                       r.id_sede, s.nombre as nombre_sede,
                       r.id_usuario, u.nombre as nombre_usuario,
                       r.tipo_problema, r.descripcion, r.estado, r.prioridad,
                       r.resolucion, r.fecha_resolucion, r.fecha_creacion
                from reporte_cancha r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = r.id_sede
                join usuario u on u.id_usuario = r.id_usuario
                where r.id_usuario = ?
                order by r.fecha_creacion desc
                """, this::mapReportRow, userUuid);
    }

    @Transactional
    public CourtReportResponse updateStatus(int reportId, UpdateCourtReportStatusRequest request, AuthUserDto authUser) {
        if (authUser == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida");
        }
        if (request == null || request.estado() == null || request.estado().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Indica el nuevo estado");
        }
        String nuevoEstado = request.estado().trim().toUpperCase();
        if (!ESTADOS_VALIDOS.contains(nuevoEstado)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Estado inválido. Opciones: " + ESTADOS_VALIDOS);
        }

        List<Integer> sedes = jdbc.queryForList("select id_sede from reporte_cancha where id_reporte = ?", Integer.class, reportId);
        if (sedes.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reporte no encontrado");
        }
        int sedeId = sedes.get(0);
        venueAccess.requireOwnedVenue(sedeId, authUser);

        UUID operatorId = resolveOperationalUserId(authUser.id());
        String resolucion = request.resolucion() != null ? request.resolucion().trim() : null;

        jdbc.update("""
                update reporte_cancha
                set estado = ?, resolucion = ?,
                    fecha_resolucion = case when ? in ('RESUELTO', 'DESCARTADO') then now() else fecha_resolucion end,
                    id_usuario_resolucion = ?,
                    fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                where id_reporte = ?
                """, nuevoEstado, resolucion, nuevoEstado, operatorId, reportId);

        return getReportById(reportId).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Error al recuperar reporte actualizado"));
    }

    private java.util.Optional<CourtReportResponse> getReportById(int reportId) {
        List<CourtReportResponse> results = jdbc.query("""
                select r.id_reporte, r.id_cancha, c.nombre_numero as nombre_cancha,
                       r.id_sede, s.nombre as nombre_sede,
                       r.id_usuario, u.nombre as nombre_usuario,
                       r.tipo_problema, r.descripcion, r.estado, r.prioridad,
                       r.resolucion, r.fecha_resolucion, r.fecha_creacion
                from reporte_cancha r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = r.id_sede
                join usuario u on u.id_usuario = r.id_usuario
                where r.id_reporte = ?
                """, this::mapReportRow, reportId);
        return results.isEmpty() ? java.util.Optional.empty() : java.util.Optional.of(results.get(0));
    }

    private CourtReportResponse mapReportRow(ResultSet rs, int rowNum) throws SQLException {
        Timestamp fecCre = rs.getTimestamp("fecha_creacion");
        Timestamp fecRes = rs.getTimestamp("fecha_resolucion");
        return new CourtReportResponse(
                rs.getInt("id_reporte"),
                rs.getInt("id_cancha"),
                rs.getString("nombre_cancha"),
                rs.getInt("id_sede"),
                rs.getString("nombre_sede"),
                rs.getString("id_usuario"),
                rs.getString("nombre_usuario"),
                rs.getString("tipo_problema"),
                rs.getString("descripcion"),
                rs.getString("estado"),
                rs.getString("prioridad"),
                rs.getString("resolucion"),
                fecRes != null ? fecRes.toLocalDateTime().format(ISO_FORMATTER) : null,
                fecCre != null ? fecCre.toLocalDateTime().format(ISO_FORMATTER) : null
        );
    }
}

