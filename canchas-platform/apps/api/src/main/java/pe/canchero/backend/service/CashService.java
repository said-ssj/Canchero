package pe.canchero.backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.CajaRequest;
import pe.canchero.backend.web.dto.CajaResponse;
import pe.canchero.backend.web.dto.CashAuditDto;
import pe.canchero.backend.web.dto.CashBoxDto;
import pe.canchero.backend.web.dto.CashMovementDto;
import pe.canchero.backend.web.dto.CashMovementRequest;
import pe.canchero.backend.web.dto.CashSessionDto;
import pe.canchero.backend.web.dto.CloseCashSessionRequest;
import pe.canchero.backend.web.dto.MovimientoCajaRequest;
import pe.canchero.backend.web.dto.MovimientoCajaResponse;
import pe.canchero.backend.web.dto.OpenCashSessionRequest;
import pe.canchero.backend.web.dto.SesionCajaRequest;
import pe.canchero.backend.web.dto.SesionCajaResponse;
import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/** Caja: cajas, turnos (apertura/cierre con arqueo), movimientos y saldos esperados calculados en servidor. */
@Service
public class CashService extends JdbcSupport {
    private final SalePaymentLedger salePayments;

    public CashService(JdbcTemplate jdbc) {
        super(jdbc);
        this.salePayments = new SalePaymentLedger(jdbc);
    }

    public List<CashBoxDto> listCashBoxes(Integer sedeId) {
        if (sedeId != null) {
            return jdbc.query("""
                    select id_caja, nombre_identificador, id_sede
                    from caja
                    where estado = 'A' and id_sede = ?
                    order by id_caja
                    """, cashBoxRowMapper(), sedeId);
        }
        return jdbc.query("""
                select id_caja, nombre_identificador, id_sede
                from caja
                where estado = 'A'
                order by id_sede, id_caja
                """, cashBoxRowMapper());
    }

    public List<CashBoxDto> listCashBoxesForOwner(String ownerId) {
        UUID ownerUuid = resolveOperationalUserId(ownerId);
        return jdbc.query("""
                select c.id_caja, c.nombre_identificador, c.id_sede
                from caja c
                join sede s on s.id_sede = c.id_sede
                where c.estado = 'A' and s.estado = 'A' and s.id_dueno = ?
                order by c.id_sede, c.id_caja
                """, cashBoxRowMapper(), ownerUuid);
    }

    public Optional<CashSessionDto> getOpenCashSession(Integer cajaId) {
        List<Object> args = new ArrayList<>();
        StringBuilder sql = new StringBuilder(cashSessionSql()).append("""
                where sc.estado = 'A' and sc.fecha_cierre is null
                """);
        if (cajaId != null) {
            sql.append(" and sc.id_caja = ? ");
            args.add(cajaId);
        }
        sql.append(" order by sc.fecha_apertura desc limit 1");
        return jdbc.query(sql.toString(), cashSessionRowMapper(), args.toArray()).stream().findFirst();
    }

    public Optional<CashSessionDto> getOpenCashSessionForOwner(String ownerId) {
        UUID ownerUuid = resolveOperationalUserId(ownerId);
        return jdbc.query(cashSessionSql() + """
                join sede s on s.id_sede = c.id_sede
                where sc.estado = 'A' and sc.fecha_cierre is null and s.id_dueno = ?
                order by sc.fecha_apertura desc limit 1
                """, cashSessionRowMapper(), ownerUuid).stream().findFirst();
    }

    public List<CashMovementDto> listCashMovements(int sessionId) {
        return jdbc.query("""
                select id_movimiento, id_sesion_caja, id_tipo_movimiento, monto, concepto, fecha_movimiento
                from movimiento_caja
                where id_sesion_caja = ? and estado = 'A'
                order by fecha_movimiento desc nulls last, id_movimiento desc
                """, cashMovementRowMapper(), sessionId);
    }

    public List<CashAuditDto> listCashAudits() {
        return jdbc.query("""
                select a.*, a.id_arqueo, a.id_sesion_caja, coalesce(c.nombre_identificador, 'Caja ' || sc.id_caja) as caja_nombre,
                       coalesce(u.nombre, 'Cajero') as cajero_nombre, a.fecha_arqueo,
                       a.total_efectivo, a.total_digital, a.observaciones,
                       sc.monto_apertura, sc.monto_sistema, sc.diferencia
                from arqueo_caja a
                join sesion_caja sc on sc.id_sesion_caja = a.id_sesion_caja
                left join caja c on c.id_caja = sc.id_caja
                left join usuario u on u.id_usuario = a.id_usuario
                where a.estado = 'A'
                order by a.fecha_arqueo desc nulls last, a.id_arqueo desc
                """, cashAuditRowMapper());
    }

    public List<CashAuditDto> listCashAuditsForVenue(int sedeId) {
        return jdbc.query("""
                select a.*, a.id_arqueo, a.id_sesion_caja, coalesce(c.nombre_identificador, 'Caja ' || sc.id_caja) as caja_nombre,
                       coalesce(u.nombre, 'Cajero') as cajero_nombre, a.fecha_arqueo,
                       a.total_efectivo, a.total_digital, a.observaciones,
                       sc.monto_apertura, sc.monto_sistema, sc.diferencia
                from arqueo_caja a
                join sesion_caja sc on sc.id_sesion_caja = a.id_sesion_caja
                left join caja c on c.id_caja = sc.id_caja
                left join usuario u on u.id_usuario = a.id_usuario
                where a.estado = 'A' and c.id_sede = ?
                order by a.fecha_arqueo desc nulls last, a.id_arqueo desc
                """, cashAuditRowMapper(), sedeId);
    }

    public List<CashAuditDto> listCashAuditsForOwner(String ownerId) {
        UUID ownerUuid = resolveOperationalUserId(ownerId);
        return jdbc.query("""
                select a.*, a.id_arqueo, a.id_sesion_caja, coalesce(c.nombre_identificador, 'Caja ' || sc.id_caja) as caja_nombre,
                       coalesce(u.nombre, 'Cajero') as cajero_nombre, a.fecha_arqueo,
                       a.total_efectivo, a.total_digital, a.observaciones,
                       sc.monto_apertura, sc.monto_sistema, sc.diferencia
                from arqueo_caja a
                join sesion_caja sc on sc.id_sesion_caja = a.id_sesion_caja
                left join caja c on c.id_caja = sc.id_caja
                left join sede s on s.id_sede = c.id_sede
                left join usuario u on u.id_usuario = a.id_usuario
                where a.estado = 'A' and s.id_dueno = ?
                order by a.fecha_arqueo desc nulls last, a.id_arqueo desc
                """, cashAuditRowMapper(), ownerUuid);
    }

    public CashSessionDto openCashSession(OpenCashSessionRequest request) {
        return openCashSession(request, null);
    }

    @Transactional
    public CashSessionDto openCashSession(OpenCashSessionRequest request, AuthUserDto user) {
        jdbc.queryForList("select id_caja from caja where id_caja=? for update", request.cajaId());
        if (request.montoApertura() < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto de apertura no puede ser negativo");
        }
        Integer open = jdbc.queryForObject("""
                select count(*)
                from sesion_caja
                where id_caja = ? and estado = 'A' and fecha_cierre is null
                """, Integer.class, request.cajaId());
        if (open != null && open > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La caja ya tiene un turno abierto");
        }
        UUID userId = (user != null) ? UUID.fromString(user.id()) : resolveOperationalUserId(request.usuarioId());
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into sesion_caja (id_caja, id_usuario, fecha_apertura, monto_apertura, estado, usucre, pccre)
                    values (?, ?, now(), ?, 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, request.cajaId());
            ps.setObject(2, userId);
            ps.setBigDecimal(3, BigDecimal.valueOf(Math.max(0, request.montoApertura())));
            return ps;
        }, keyHolder);
        Number id = (Number) keyHolder.getKeys().get("id_sesion_caja");
        return getCashSession(id.intValue()).orElseThrow();
    }

    @Transactional
    public CashMovementDto registerCashMovement(CashMovementRequest request) {
        salePayments.lockSession(request.sesionId());
        if (request.monto() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto debe ser mayor que cero");
        }
        int movementType = "egreso".equalsIgnoreCase(request.tipo()) ? 2 : 1;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into movimiento_caja (id_sesion_caja, id_tipo_movimiento, monto, concepto,
                                                 fecha_movimiento, estado, usucre, pccre)
                    values (?, ?, ?, ?, now(), 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, request.sesionId());
            ps.setInt(2, movementType);
            ps.setBigDecimal(3, BigDecimal.valueOf(Math.abs(request.monto())));
            ps.setString(4, fallback(request.concepto(), "Movimiento de caja"));
            return ps;
        }, keyHolder);
        Number id = (Number) keyHolder.getKeys().get("id_movimiento");
        return jdbc.query("""
                select id_movimiento, id_sesion_caja, id_tipo_movimiento, monto, concepto, fecha_movimiento
                from movimiento_caja
                where id_movimiento = ?
                """, cashMovementRowMapper(), id.intValue()).stream().findFirst().orElseThrow();
    }

    public CashAuditDto closeCashSession(int sessionId, CloseCashSessionRequest request) {
        return closeCashSession(sessionId, request, null);
    }

    @Transactional
    public CashAuditDto closeCashSession(int sessionId, CloseCashSessionRequest request, AuthUserDto user) {
        salePayments.requireSchema();
        salePayments.lockSession(sessionId);
        SalePaymentLedger.money(BigDecimal.valueOf(request.totalEfectivoFisico()));
        if (request.totalEfectivoFisico() < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Conteo fisico invalido");
        CashSessionDto session = getCashSession(sessionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Turno de caja no encontrado"));
        if (!"abierta".equalsIgnoreCase(session.estado())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El turno de caja ya se encuentra cerrado");
        }

        BigDecimal openingCash = jdbc.queryForObject(
                "select monto_apertura from sesion_caja where id_sesion_caja = ?",
                BigDecimal.class, sessionId);

        BigDecimal netMovements = jdbc.queryForObject("""
                select coalesce(sum(case when id_tipo_movimiento = 1 then monto when id_tipo_movimiento = 2 then -monto else 0 end), 0)
                from movimiento_caja
                where id_sesion_caja = ? and estado = 'A'
                """, BigDecimal.class, sessionId);

        var payments = salePayments.totals(sessionId);
        BigDecimal expectedCash = openingCash.add(netMovements).add(payments.efectivo());
        BigDecimal countedCash = SalePaymentLedger.money(BigDecimal.valueOf(request.totalEfectivoFisico()));

        int changed = jdbc.update("""
                update sesion_caja
                set fecha_cierre = now(), monto_cierre = ?, monto_sistema = ?, diferencia = ?,
                    estado = 'I', fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                where id_sesion_caja = ? and fecha_cierre is null
                """,
                BigDecimal.valueOf(request.totalEfectivoFisico()),
                expectedCash,
                countedCash.subtract(expectedCash),
                sessionId);
        if (changed != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "El turno ya fue cerrado");

        UUID userId = (user != null) ? UUID.fromString(user.id()) : resolveOperationalUserId(request.usuarioId());
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into arqueo_caja (id_sesion_caja, id_usuario, fecha_arqueo, total_efectivo,
                                             total_digital, observaciones, pagos_efectivo, ingresos_manuales, egresos_manuales, estado, usucre, pccre)
                    values (?, ?, now(), ?, ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, sessionId);
            ps.setObject(2, userId);
            ps.setBigDecimal(3, BigDecimal.valueOf(request.totalEfectivoFisico()));
            ps.setBigDecimal(4, payments.digital());
            ps.setString(5, request.observaciones());
            ps.setBigDecimal(6, payments.efectivo());
            ps.setBigDecimal(7, jdbc.queryForObject("select coalesce(sum(monto),0) from movimiento_caja where id_sesion_caja=? and estado='A' and id_tipo_movimiento=1", BigDecimal.class, sessionId));
            ps.setBigDecimal(8, jdbc.queryForObject("select coalesce(sum(monto),0) from movimiento_caja where id_sesion_caja=? and estado='A' and id_tipo_movimiento=2", BigDecimal.class, sessionId));
            return ps;
        }, keyHolder);
        Number id = (Number) keyHolder.getKeys().get("id_arqueo");
        return listCashAudits().stream()
                .filter(a -> a.id().equals(String.valueOf(id.intValue())))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "No se pudo recuperar el arqueo guardado"));
    }

    public pe.canchero.backend.web.dto.CashBalanceDto cashBalance(int sessionId) {
        var payments = salePayments.totals(sessionId);
        BigDecimal opening = jdbc.queryForObject("select monto_apertura from sesion_caja where id_sesion_caja=?", BigDecimal.class, sessionId);
        BigDecimal movements = jdbc.queryForObject("select coalesce(sum(case when id_tipo_movimiento=1 then monto when id_tipo_movimiento=2 then -monto else 0 end),0) from movimiento_caja where id_sesion_caja=? and estado='A'", BigDecimal.class, sessionId);
        return new pe.canchero.backend.web.dto.CashBalanceDto(sessionId, payments.efectivo(), payments.digital(), opening.add(movements).add(payments.efectivo()));
    }

    private RowMapper<CashBoxDto> cashBoxRowMapper() {
        return (rs, rowNum) -> new CashBoxDto(
                rs.getInt("id_caja"),
                rs.getString("nombre_identificador"),
                rs.getInt("id_sede"));
    }

    private RowMapper<CashSessionDto> cashSessionRowMapper() {
        return (rs, rowNum) -> {
            Double difference = nullableBigDecimal(rs, "diferencia");
            return new CashSessionDto(
                    rs.getInt("id_sesion_caja"),
                    rs.getInt("id_caja"),
                    rs.getString("caja_nombre"),
                    rs.getInt("id_sede"),
                    rs.getString("cajero_nombre"),
                    rs.getString("cajero_email"),
                    stringDateTime(rs, "fecha_apertura"),
                    rs.getBigDecimal("monto_apertura") == null ? 0 : rs.getBigDecimal("monto_apertura").doubleValue(),
                    stringDateTime(rs, "fecha_cierre"),
                    nullableBigDecimal(rs, "monto_cierre"),
                    nullableBigDecimal(rs, "monto_sistema"),
                    difference,
                    rs.getString("fecha_cierre") == null && "A".equals(rs.getString("estado")) ? "abierta" : "cerrada",
                    difference == null ? null : balanceStatus(difference));
        };
    }

    private RowMapper<CashMovementDto> cashMovementRowMapper() {
        return (rs, rowNum) -> new CashMovementDto(
                "mov_" + rs.getInt("id_movimiento"),
                rs.getInt("id_sesion_caja"),
                rs.getInt("id_tipo_movimiento") == 2 ? "egreso" : "ingreso",
                rs.getBigDecimal("monto") == null ? 0 : rs.getBigDecimal("monto").doubleValue(),
                rs.getString("concepto"),
                formatDateTimeAsTime(rs, "fecha_movimiento"),
                "Cajero");
    }

    private RowMapper<CashAuditDto> cashAuditRowMapper() {
        return (rs, rowNum) -> {
            double difference = rs.getBigDecimal("diferencia") == null ? 0 : rs.getBigDecimal("diferencia").doubleValue();
            return new CashAuditDto(
                    String.valueOf(rs.getInt("id_arqueo")),
                    rs.getInt("id_sesion_caja"),
                    rs.getString("caja_nombre"),
                    rs.getString("cajero_nombre"),
                    stringDateTime(rs, "fecha_arqueo"),
                    rs.getBigDecimal("total_efectivo") == null ? 0 : rs.getBigDecimal("total_efectivo").doubleValue(),
                    rs.getBigDecimal("monto_apertura") == null ? 0 : rs.getBigDecimal("monto_apertura").doubleValue(),
                    auditAmount(rs, "pagos_efectivo"),
                    auditAmount(rs, "ingresos_manuales"),
                    auditAmount(rs, "egresos_manuales"),
                    rs.getBigDecimal("monto_sistema") == null ? 0 : rs.getBigDecimal("monto_sistema").doubleValue(),
                    difference,
                    balanceStatus(difference),
                    rs.getString("observaciones"), hasAuditSnapshot(rs));
        };
    }

    private boolean hasAuditSnapshot(ResultSet rs) throws java.sql.SQLException {
        for (int i=1; i<=rs.getMetaData().getColumnCount(); i++) {
            if ("pagos_efectivo".equalsIgnoreCase(rs.getMetaData().getColumnLabel(i))) return rs.getObject(i) != null;
        }
        return false;
    }

    private double auditAmount(ResultSet rs, String column) throws java.sql.SQLException {
        for (int i=1; i<=rs.getMetaData().getColumnCount(); i++) {
            if (column.equalsIgnoreCase(rs.getMetaData().getColumnLabel(i))) {
                BigDecimal value = rs.getBigDecimal(i);
                return value == null ? 0 : value.doubleValue();
            }
        }
        return 0;
    }

    private Optional<CashSessionDto> getCashSession(int id) {
        return jdbc.query(cashSessionSql() + " where sc.id_sesion_caja = ?", cashSessionRowMapper(), id)
                .stream()
                .findFirst();
    }

    private String cashSessionSql() {
        return """
                select sc.id_sesion_caja, sc.id_caja, coalesce(c.nombre_identificador, 'Caja ' || sc.id_caja) as caja_nombre,
                       coalesce(c.id_sede, 1) as id_sede, coalesce(u.nombre, 'Cajero') as cajero_nombre,
                       coalesce(u.correo, 'admin@canchero.pe') as cajero_email, sc.fecha_apertura, sc.fecha_cierre,
                       sc.monto_apertura, sc.monto_cierre, sc.monto_sistema, sc.diferencia, sc.estado
                from sesion_caja sc
                left join caja c on c.id_caja = sc.id_caja
                left join usuario u on u.id_usuario = sc.id_usuario
                """;
    }

    private Double nullableBigDecimal(ResultSet rs, String column) throws java.sql.SQLException {
        BigDecimal value = rs.getBigDecimal(column);
        return value == null ? null : value.doubleValue();
    }

    private String formatDateTimeAsTime(ResultSet rs, String column) throws java.sql.SQLException {
        Object value = rs.getObject(column);
        if (value == null) return "";
        String raw = value.toString();
        return raw.length() >= 16 ? raw.substring(11, 16) : raw;
    }

    private String balanceStatus(double difference) {
        if (difference < -0.05) return "faltante";
        if (difference > 0.05) return "sobrante";
        return "cuadrada";
    }

    public List<CajaResponse> listCajas() {
        return listCajas((Integer) null);
    }

    public List<CajaResponse> listCajas(Integer sedeId) {
        return listCashBoxes(sedeId).stream()
                .map(c -> new CajaResponse(
                        String.valueOf(c.id()),
                        c.nombre(),
                        "Sede #" + c.sedeId(),
                        "A",
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        null,
                        null))
                .toList();
    }

    public List<CajaResponse> listCajasForOwner(String ownerId) {
        return listCashBoxesForOwner(ownerId).stream()
                .map(c -> new CajaResponse(
                        String.valueOf(c.id()),
                        c.nombre(),
                        "Sede #" + c.sedeId(),
                        "A",
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        null,
                        null))
                .toList();
    }

    public Optional<CajaResponse> getCaja(int id) {
        return jdbc.query("""
                        select id_caja, nombre_identificador, id_sede, estado
                        from caja
                        where id_caja = ?
                        """,
                (rs, rowNum) -> new CajaResponse(
                        String.valueOf(rs.getInt("id_caja")),
                        rs.getString("nombre_identificador"),
                        "Sede #" + rs.getInt("id_sede"),
                        rs.getString("estado"),
                        BigDecimal.ZERO,
                        BigDecimal.ZERO,
                        null,
                        null),
                id).stream().findFirst();
    }

    public CajaResponse createCaja(CajaRequest request) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una sede");
    }

    public CajaResponse createCaja(CajaRequest request, int sedeId) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into caja (id_sede, nombre_identificador, estado, usucre, pccre)
                    values (?, ?, 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, sedeId);
            ps.setString(2, fallback(request.nombre(), "Caja Principal"));
            return ps;
        }, keyHolder);
        Number id = (Number) keyHolder.getKeys().get("id_caja");
        return getCaja(id.intValue()).orElseThrow();
    }

    public List<SesionCajaResponse> listSesionesCaja(Integer cajaId) {
        return listSesionesCaja(cajaId == null ? null : String.valueOf(cajaId));
    }

    public List<SesionCajaResponse> listSesionesCaja(String cajaId) {
        StringBuilder sql = new StringBuilder(cashSessionSql()).append(" where 1 = 1 ");
        List<Object> args = new ArrayList<>();
        if (cajaId != null && !cajaId.isBlank()) {
            sql.append(" and sc.id_caja = ? ");
            args.add(Integer.parseInt(cajaId));
        }
        sql.append(" order by sc.fecha_apertura desc");
        return jdbc.query(sql.toString(), sesionCajaRowMapper(), args.toArray());
    }

    public List<SesionCajaResponse> listSesionesCajaForVenue(int sedeId) {
        String sql = cashSessionSql() + """
                where c.id_sede = ?
                order by sc.fecha_apertura desc
                """;
        return jdbc.query(sql, sesionCajaRowMapper(), sedeId);
    }

    public List<SesionCajaResponse> listSesionesCajaForOwner(String ownerId) {
        UUID ownerUuid = resolveOperationalUserId(ownerId);
        String sql = cashSessionSql() + """
                join sede s on s.id_sede = c.id_sede
                where s.id_dueno = ?
                order by sc.fecha_apertura desc
                """;
        return jdbc.query(sql, sesionCajaRowMapper(), ownerUuid);
    }

    private RowMapper<SesionCajaResponse> sesionCajaRowMapper() {
        return (rs, rowNum) -> new SesionCajaResponse(
                String.valueOf(rs.getInt("id_sesion_caja")),
                String.valueOf(rs.getInt("id_caja")),
                null,
                rs.getBigDecimal("monto_apertura"),
                rs.getBigDecimal("monto_cierre"),
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                BigDecimal.ZERO,
                rs.getString("fecha_cierre") == null && "A".equals(rs.getString("estado")) ? "abierta" : "cerrada",
                toLocalDateTime(rs, "fecha_apertura"),
                toLocalDateTime(rs, "fecha_cierre"));
    }

    public SesionCajaResponse openSesionCaja(SesionCajaRequest request) {
        return openSesionCaja(request, null);
    }

    @Transactional
    public SesionCajaResponse openSesionCaja(SesionCajaRequest request, AuthUserDto user) {
        CashSessionDto opened = openCashSession(new OpenCashSessionRequest(
                Integer.parseInt(request.cajaId()),
                user != null ? user.nombre() : null,
                user != null ? user.email() : null,
                request.montoInicial() == null ? 0 : request.montoInicial().doubleValue(),
                user != null ? user.id() : request.usuarioId()), user);
        return listSesionesCaja(request.cajaId()).stream()
                .filter(s -> s.id().equals(String.valueOf(opened.id())))
                .findFirst()
                .orElseThrow();
    }

    public Optional<SesionCajaResponse> closeSesionCaja(int sesionId) {
        return closeSesionCaja(sesionId, null);
    }

    @Transactional
    public Optional<SesionCajaResponse> closeSesionCaja(int sesionId, AuthUserDto user) {
        // This legacy endpoint has no physical count; never manufacture a reconciled close.
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Usa el cierre con conteo fisico y arqueo de caja");
    }

    public List<MovimientoCajaResponse> listMovimientosCaja(int sesionCajaId) {
        return listCashMovements(sesionCajaId).stream()
                .map(m -> new MovimientoCajaResponse(
                        m.id().replace("mov_", ""),
                        String.valueOf(m.sesionId()),
                        m.tipo(),
                        m.concepto(),
                        BigDecimal.valueOf(m.monto()),
                        null,
                        null,
                        null))
                .toList();
    }

    @Transactional
    public MovimientoCajaResponse createMovimientoCaja(MovimientoCajaRequest request) {
        CashMovementDto created = registerCashMovement(new CashMovementRequest(
                Integer.parseInt(request.sesionCajaId()),
                request.tipo(),
                request.monto() == null ? 0 : request.monto().doubleValue(),
                request.concepto(),
                null));
        return new MovimientoCajaResponse(
                created.id().replace("mov_", ""),
                String.valueOf(created.sesionId()),
                created.tipo(),
                created.concepto(),
                BigDecimal.valueOf(created.monto()),
                request.metodoPago(),
                request.referencia(),
                null);
    }
}
