package pe.canchero.backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthResponse;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.BookingRequest;
import pe.canchero.backend.web.dto.BookingResponse;
import pe.canchero.backend.web.dto.CajaRequest;
import pe.canchero.backend.web.dto.CajaResponse;
import pe.canchero.backend.web.dto.CashAuditDto;
import pe.canchero.backend.web.dto.CashBoxDto;
import pe.canchero.backend.web.dto.CashMovementDto;
import pe.canchero.backend.web.dto.CashMovementRequest;
import pe.canchero.backend.web.dto.CashSessionDto;
import pe.canchero.backend.web.dto.CloseCashSessionRequest;
import pe.canchero.backend.web.dto.CourtAvailabilityResponse;
import pe.canchero.backend.web.dto.CourtDto;
import pe.canchero.backend.web.dto.CourtRequest;
import pe.canchero.backend.web.dto.InventoryEntryRequest;
import pe.canchero.backend.web.dto.InventoryMovementDto;
import pe.canchero.backend.web.dto.LoginRequest;
import pe.canchero.backend.web.dto.MovimientoCajaRequest;
import pe.canchero.backend.web.dto.MovimientoCajaResponse;
import pe.canchero.backend.web.dto.OpenCashSessionRequest;
import pe.canchero.backend.web.dto.PagoReservaResponse;
import pe.canchero.backend.web.dto.ProcessSaleRequest;
import pe.canchero.backend.web.dto.ProductDto;
import pe.canchero.backend.web.dto.ProductoRequest;
import pe.canchero.backend.web.dto.ProductoResponse;
import pe.canchero.backend.web.dto.PublicPassResponse;
import pe.canchero.backend.web.dto.QuoteRequest;
import pe.canchero.backend.web.dto.QuoteResponse;
import pe.canchero.backend.web.dto.RegisterRequest;
import pe.canchero.backend.web.dto.ReviewRequest;
import pe.canchero.backend.web.dto.ReviewResponse;
import pe.canchero.backend.web.dto.SaleDto;
import pe.canchero.backend.web.dto.SaleItemDto;
import pe.canchero.backend.web.dto.SesionCajaRequest;
import pe.canchero.backend.web.dto.SesionCajaResponse;
import pe.canchero.backend.web.dto.VentaDetalleResponse;
import pe.canchero.backend.web.dto.VentaRequest;
import pe.canchero.backend.web.dto.VentaResponse;
import pe.canchero.backend.web.dto.VenueRequest;
import pe.canchero.backend.web.dto.VenueResponse;
import pe.canchero.backend.config.PasswordUtil;

import org.springframework.beans.factory.annotation.Autowired;
import java.math.BigDecimal;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Time;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;
import java.util.concurrent.locks.ReentrantLock;
import java.util.stream.IntStream;

@Service
public class SupabaseDataService {

    private static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");
    private static final ZoneId LIMA_ZONE = ZoneId.of("America/Lima");
    private static final Set<String> PUBLIC_PLAYER_ROLES = Set.of("cliente", "jugador", "player");
    private static final Set<String> PUBLIC_OWNER_ROLES = Set.of("dueno", "dueño", "owner", "propietario");
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$");

    private final JdbcTemplate jdbc;
    private final AuthTokenService authTokenService;
    private final Clock clock;
    private final SalePaymentLedger salePayments;
    private final Map<Integer, ReentrantLock> courtLocks = new ConcurrentHashMap<>();

    @Autowired
    public SupabaseDataService(JdbcTemplate jdbc, AuthTokenService authTokenService) {
        this(jdbc, authTokenService, Clock.system(LIMA_ZONE));
    }

    public SupabaseDataService(JdbcTemplate jdbc, AuthTokenService authTokenService, Clock clock) {
        this.jdbc = jdbc;
        this.salePayments = new SalePaymentLedger(jdbc);
        this.authTokenService = authTokenService;
        this.clock = clock == null ? Clock.system(LIMA_ZONE) : clock;
    }

    public List<VenueResponse> listVenues(String ciudad, String distrito, String deporte) {
        StringBuilder sql = new StringBuilder("""
                select s.id_sede, s.nombre, s.direccion, s.telefono, s.descripcion, s.imagen_url,
                       s.id_dueno, s.latitud, s.longitud, s.rating, s.id_distrito,
                       d.nombre as distrito_nombre, p.nombre as ciudad_nombre,
                       coalesce(min(t.precio), 80) as tarifa_base
                from sede s
                left join distrito d on d.id_distrito = s.id_distrito
                left join provincia p on p.id_provincia = d.id_provincia
                left join cancha c on c.id_sede = s.id_sede and c.estado = 'A'
                left join tarifa_cancha t on t.id_cancha = c.id_cancha and t.estado = 'A'
                where s.estado = 'A'
                """);
        List<Object> args = new ArrayList<>();
        if (deporte != null && !deporte.isBlank()) {
            sql.append(" and exists (select 1 from cancha cd join tipo_cancha tc on tc.id_tipo_cancha = cd.id_tipo_cancha where cd.id_sede = s.id_sede and cd.estado = 'A' and lower(tc.nombre) like ?) ");
            args.add("%" + normalize(deporte).replace("futbol", "fútbol").replace("-", " ") + "%");
        }
        sql.append(" group by s.id_sede, d.nombre, p.nombre order by s.rating desc nulls last, s.nombre");

        var venues = jdbc.query(sql.toString(), venueRowMapper(), args.toArray()).stream()
                .filter(v -> matchesLocation(v, ciudad, distrito))
                .toList();
        if (venues.isEmpty()) return venues;
        var courtsByVenue = jdbc.query(courtsSql(" where c.estado = 'A' ") + " order by c.nombre_numero", courtRowMapper())
                .stream().collect(java.util.stream.Collectors.groupingBy(CourtDto::venueId));
        return venues.stream().map(v -> withCourts(v, courtsByVenue.getOrDefault(Integer.parseInt(v.id()), List.of()))).toList();
    }

    public Optional<VenueResponse> getVenue(String id) {
        return jdbc.query("""
                        select s.id_sede, s.nombre, s.direccion, s.telefono, s.descripcion, s.imagen_url,
                               s.id_dueno, s.latitud, s.longitud, s.rating, s.id_distrito,
                               d.nombre as distrito_nombre, p.nombre as ciudad_nombre,
                               coalesce(min(t.precio), 80) as tarifa_base
                        from sede s
                        left join distrito d on d.id_distrito = s.id_distrito
                        left join provincia p on p.id_provincia = d.id_provincia
                        left join cancha c on c.id_sede = s.id_sede and c.estado = 'A'
                        left join tarifa_cancha t on t.id_cancha = c.id_cancha and t.estado = 'A'
                        where s.id_sede = ? and s.estado = 'A'
                        group by s.id_sede, d.nombre, p.nombre
                        """,
                venueRowMapper(),
                Integer.parseInt(id)
        ).stream().findFirst().map(v -> withCourts(v, true));
    }

    public List<java.util.Map<String, Object>> listRoles() {
        return jdbc.queryForList("""
                select id_rol, nombre, descripcion, estado
                from rol
                where estado = 'A'
                order by id_rol
                """);
    }

    public List<java.util.Map<String, Object>> listCourtTypes() {
        return jdbc.queryForList("""
                select id_tipo_cancha, nombre, descripcion, estado
                from tipo_cancha
                where estado = 'A'
                order by id_tipo_cancha
                """);
    }

    public List<java.util.Map<String, Object>> listPaymentMethods() {
        return jdbc.queryForList("""
                select id_metodo_pago, nombre, descripcion, estado
                from metodo_pago
                where estado = 'A'
                order by id_metodo_pago
                """);
    }

    public List<java.util.Map<String, Object>> listReservationStatuses() {
        return jdbc.queryForList("""
                select id_estado_reserva, nombre, color_hex, estado
                from estado_reserva
                where estado = 'A'
                order by id_estado_reserva
                """);
    }

    public List<java.util.Map<String, Object>> listDistricts() {
        return jdbc.queryForList("""
                select d.id_distrito, d.nombre as distrito, p.id_provincia, p.nombre as provincia,
                       dep.id_departamento, dep.nombre as departamento
                from distrito d
                join provincia p on p.id_provincia = d.id_provincia
                join departamento dep on dep.id_departamento = p.id_departamento
                where d.estado = 'A' and p.estado = 'A' and dep.estado = 'A'
                order by dep.nombre, p.nombre, d.nombre
                """);
    }

    public VenueResponse createVenue(VenueRequest request) {
        UUID ownerId = resolveOwnerId(request.ownerId());
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into sede (id_dueno, id_distrito, nombre, direccion, telefono, descripcion, imagen_url,
                                      latitud, longitud, rating, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setObject(1, ownerId);
            ps.setInt(2, 1);
            ps.setString(3, fallback(request.nombre(), "Mi Sede Deportiva"));
            ps.setString(4, fallback(request.direccion(), "Sin direccion registrada"));
            ps.setString(5, request.telefono());
            ps.setString(6, request.descripcion());
            ps.setString(7, request.portadaUrl());
            ps.setObject(8, request.latitud());
            ps.setObject(9, request.longitud());
            ps.setBigDecimal(10, BigDecimal.valueOf(4.5));
            return ps;
        }, keyHolder);
        Number id = (Number) keyHolder.getKeys().get("id_sede");
        return getVenue(String.valueOf(id)).orElseThrow();
    }

    public Optional<VenueResponse> updateVenue(String id, VenueRequest request) {
        int updated = jdbc.update("""
                update sede
                set nombre = ?, direccion = ?, telefono = ?, descripcion = ?, imagen_url = ?,
                    latitud = ?, longitud = ?, fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                where id_sede = ?
                """,
                fallback(request.nombre(), "Mi Sede Deportiva"),
                fallback(request.direccion(), "Sin direccion registrada"),
                request.telefono(),
                request.descripcion(),
                request.portadaUrl(),
                request.latitud(),
                request.longitud(),
                Integer.parseInt(id));
        return updated == 0 ? Optional.empty() : getVenue(id);
    }

    public boolean deleteVenue(String id) {
        return jdbc.update("""
                update sede set estado = 'I', fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                where id_sede = ?
                """, Integer.parseInt(id)) > 0;
    }

    public List<CourtDto> listCourts(String venueId) {
        if (venueId != null && !venueId.isBlank()) {
            return jdbc.query(courtsSql(" where c.id_sede = ? ") + " order by c.nombre_numero", courtRowMapper(), Integer.parseInt(venueId));
        }
        return jdbc.query(courtsSql("") + " order by c.nombre_numero", courtRowMapper());
    }

    public Optional<CourtDto> getCourt(String id) {
        return jdbc.query(courtsSql(" where c.id_cancha = ? "), courtRowMapper(), Integer.parseInt(id)).stream().findFirst();
    }

    public CourtAvailabilityResponse getCourtAvailability(String courtIdRaw, String fromRaw, String toRaw) {
        int courtId;
        try {
            courtId = Integer.parseInt(courtIdRaw);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "courtId inválido");
        }
        LocalDate fromDate = parseDate(fromRaw);
        LocalDate toDate = parseDate(toRaw);
        if (toDate.isBefore(fromDate)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El rango de fechas es inválido");
        }

        List<Integer> sedeIds = jdbc.queryForList(
                "select id_sede from cancha where id_cancha = ? and estado = 'A'",
                Integer.class,
                courtId);
        if (sedeIds.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Cancha no encontrada o inactiva");
        }
        int sedeId = sedeIds.get(0);

        List<CourtAvailabilityResponse.ScheduleWindowDto> horarios = jdbc.query("""
                select id_sede, dia_semana, apertura, cierre, estado
                from tipo_horario
                where id_sede = ?
                order by dia_semana, id_tipo_horario
                """,
                (rs, rowNum) -> new CourtAvailabilityResponse.ScheduleWindowDto(
                        rs.getInt("id_sede"),
                        rs.getInt("dia_semana"),
                        formatTime(rs.getTime("apertura")),
                        formatTime(rs.getTime("cierre")),
                        rs.getString("estado")),
                sedeId);

        List<CourtAvailabilityResponse.TariffRuleDto> tarifas = jdbc.query("""
                select id_cancha, dia_semana, hora_inicio, hora_fin, precio, estado
                from tarifa_cancha
                where id_cancha = ? and estado = 'A'
                order by dia_semana, hora_inicio
                """,
                (rs, rowNum) -> new CourtAvailabilityResponse.TariffRuleDto(
                        rs.getInt("id_cancha"),
                        rs.getInt("dia_semana"),
                        formatTime(rs.getTime("hora_inicio")),
                        formatTime(rs.getTime("hora_fin")),
                        rs.getBigDecimal("precio") == null ? 80 : rs.getBigDecimal("precio").doubleValue(),
                        rs.getString("estado")),
                courtId);

        LocalDateTime rangeStart = fromDate.atStartOfDay();
        LocalDateTime rangeEnd = toDate.plusDays(1).atStartOfDay();
        List<CourtAvailabilityResponse.MaintenanceBlockDto> bloqueos = jdbc.query("""
                select id_bloqueo, id_cancha, motivo, fecha_inicio, fecha_fin, estado
                from bloqueo_mantenimiento
                where id_cancha = ?
                  and estado = 'A'
                  and fecha_inicio < ?
                  and fecha_fin > ?
                order by fecha_inicio
                """,
                (rs, rowNum) -> {
                    LocalDateTime fi = toLocalDateTime(rs, "fecha_inicio");
                    LocalDateTime ff = toLocalDateTime(rs, "fecha_fin");
                    return new CourtAvailabilityResponse.MaintenanceBlockDto(
                            rs.getInt("id_bloqueo"),
                            rs.getInt("id_cancha"),
                            rs.getString("motivo"),
                            fi == null ? "" : fi.toString(),
                            ff == null ? "" : ff.toString(),
                            rs.getString("estado"));
                },
                courtId,
                rangeEnd,
                rangeStart);

        List<CourtAvailabilityResponse.OccupiedIntervalDto> ocupaciones = jdbc.query("""
                select r.id_cancha, r.fecha_reserva, r.hora_inicio, r.hora_fin, coalesce(er.nombre, 'confirmada') as estado_nombre
                from reserva r
                join estado_reserva er on er.id_estado_reserva = r.id_estado_reserva
                where r.id_cancha = ?
                  and r.fecha_reserva between ? and ?
                  and r.estado = 'A'
                  and er.estado = 'A'
                  and (lower(er.nombre) like '%pend%' or lower(er.nombre) like '%confirm%' or lower(er.nombre) like '%aprob%' or lower(er.nombre) like '%complet%' or lower(er.nombre) like '%final%' or lower(er.nombre) like '%jug%')
                order by r.fecha_reserva, r.hora_inicio
                """,
                (rs, rowNum) -> new CourtAvailabilityResponse.OccupiedIntervalDto(
                        rs.getInt("id_cancha"),
                        rs.getObject("fecha_reserva", LocalDate.class).toString(),
                        formatTime(rs.getTime("hora_inicio")),
                        formatTime(rs.getTime("hora_fin")),
                        rs.getString("estado_nombre").toLowerCase(Locale.ROOT)),
                courtId,
                fromDate,
                toDate);

        return new CourtAvailabilityResponse(
                String.valueOf(courtId),
                String.valueOf(sedeId),
                fromDate.toString(),
                toDate.toString(),
                horarios,
                tarifas,
                bloqueos,
                ocupaciones);
    }

    public QuoteResponse quoteCourtBooking(String courtIdRaw, QuoteRequest request) {
        int courtId;
        try {
            courtId = Integer.parseInt(courtIdRaw);
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "courtId inválido");
        }
        CourtDto court = getCourt(String.valueOf(courtId))
                .filter(CourtDto::disponible)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cancha no encontrada o inactiva"));

        if (request == null || request.hours() == null || request.hours().isEmpty()) {
            return new QuoteResponse(false, "Selecciona al menos un turno disponible.", String.valueOf(courtId),
                    request == null ? null : request.fecha(), null, null, null, 0, List.of(), 0, 0);
        }

        LocalDate fecha = parseDate(request.fecha());
        List<Integer> sorted = request.hours().stream().distinct().sorted().toList();
        if (sorted.size() != request.hours().size()) {
            return new QuoteResponse(false, "Existen turnos duplicados en la selección.", String.valueOf(courtId),
                    fecha.toString(), null, null, null, sorted.size(), List.of(), 0, 0);
        }
        for (int h : sorted) {
            if (h < 0 || h > 23) {
                return new QuoteResponse(false, "Hora fuera de rango permitido (0..23).", String.valueOf(courtId),
                        fecha.toString(), null, null, null, sorted.size(), List.of(), 0, 0);
            }
        }
        for (int i = 0; i < sorted.size() - 1; i++) {
            if (sorted.get(i + 1) != sorted.get(i) + 1) {
                String gapStart = String.format("%02d:00", sorted.get(i) + 1);
                String gapEnd = String.format("%02d:00", sorted.get(i + 1));
                return new QuoteResponse(
                        false,
                        "Existe un hueco no seleccionado entre las " + gapStart + " y las " + gapEnd + ". Los turnos deben ser horas continuas en la misma cancha.",
                        String.valueOf(courtId),
                        fecha.toString(),
                        null,
                        null,
                        null,
                        sorted.size(),
                        List.of(),
                        0,
                        0);
            }
        }

        int dayOfWeek = fecha.getDayOfWeek().getValue() % 7; // 0 = domingo .. 6 = sábado
        int legacyIsoDay = fecha.getDayOfWeek().getValue(); // 1 = lunes .. 7 = domingo
        List<CourtAvailabilityResponse.TariffRuleDto> tarifas = jdbc.query("""
                select id_cancha, dia_semana, hora_inicio, hora_fin, precio, estado
                from tarifa_cancha
                where id_cancha = ? and estado = 'A' and (dia_semana = ? or dia_semana = ?)
                order by hora_inicio
                """,
                (rs, rowNum) -> new CourtAvailabilityResponse.TariffRuleDto(
                        rs.getInt("id_cancha"),
                        rs.getInt("dia_semana"),
                        formatTime(rs.getTime("hora_inicio")),
                        formatTime(rs.getTime("hora_fin")),
                        rs.getBigDecimal("precio") == null ? 80 : rs.getBigDecimal("precio").doubleValue(),
                        rs.getString("estado")),
                courtId,
                dayOfWeek,
                dayOfWeek == 0 ? 7 : legacyIsoDay);

        String nightStartStr = court.horaInicioNoche() == null || court.horaInicioNoche().isBlank() ? "18:00" : court.horaInicioNoche();
        int nightStartHour = Integer.parseInt(nightStartStr.split(":")[0]);
        double dayPrice = court.precioHora();
        double nightPrice = court.precioHoraNoche() != null ? court.precioHoraNoche() : dayPrice;

        List<QuoteResponse.QuoteTrancheDto> tranches = new ArrayList<>();
        double subtotal = 0;
        for (int hour : sorted) {
            String tStart = String.format("%02d:00", hour);
            String tEnd = hour + 1 == 24 ? "00:00" : String.format("%02d:00", hour + 1);
            String compareEnd = hour + 1 == 24 ? "24:00" : tEnd;
            boolean isNight = hour >= nightStartHour;

            Double matchedRulePrice = null;
            for (var rule : tarifas) {
                String rStart = rule.horaInicio();
                String rEnd = "00:00".equals(rule.horaFin()) ? "24:00" : rule.horaFin();
                boolean isFullDayFlat = "08:00".equals(rStart) && ("23:00".equals(rEnd) || "24:00".equals(rEnd)) && dayPrice != nightPrice;
                if (!isFullDayFlat && rStart.compareTo(tStart) <= 0 && rEnd.compareTo(compareEnd) >= 0) {
                    matchedRulePrice = rule.precio();
                    break;
                }
            }
            double slotPrice = matchedRulePrice != null ? matchedRulePrice : (isNight ? nightPrice : dayPrice);
            subtotal = round2(subtotal + slotPrice);
            tranches.add(new QuoteResponse.QuoteTrancheDto(
                    hour,
                    tStart,
                    tEnd,
                    tStart + " - " + tEnd,
                    slotPrice,
                    isNight,
                    isNight ? "Noche" : "Día"));
        }

        int startHour = sorted.get(0);
        int endHour = sorted.get(sorted.size() - 1) + 1;
        String timeStart = String.format("%02d:00", startHour);
        String timeEnd = endHour == 24 ? "00:00" : String.format("%02d:00", endHour);
        String displayRange = timeStart + " - " + timeEnd;

        return new QuoteResponse(
                true,
                null,
                String.valueOf(courtId),
                fecha.toString(),
                timeStart,
                timeEnd,
                displayRange,
                sorted.size(),
                tranches,
                subtotal,
                subtotal);
    }


    @Transactional
    public CourtDto createCourt(CourtRequest request) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        int typeId = courtTypeId(request.tipo());
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into cancha (id_sede, id_tipo_cancha, nombre_numero, techada, foto_url, superficie,
                                        equipamiento, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, Integer.parseInt(request.venueId()));
            ps.setInt(2, typeId);
            ps.setString(3, fallback(request.nombre(), "Cancha"));
            ps.setBoolean(4, request.techada());
            ps.setString(5, request.foto());
            ps.setString(6, request.superficie());
            ps.setArray(7, textArray(connection, request.equipamiento()));
            return ps;
        }, keyHolder);
        Number id = (Number) keyHolder.getKeys().get("id_cancha");
        syncTarifas(id.intValue(), request);
        return getCourt(String.valueOf(id)).orElseThrow();
    }

    public Optional<CourtDto> updateCourt(String id, CourtRequest request) {
        int updated = jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    update cancha
                    set id_tipo_cancha = ?, nombre_numero = ?, techada = ?, foto_url = ?, superficie = ?,
                        equipamiento = ?, estado = ?, fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                    where id_cancha = ?
                    """);
            ps.setInt(1, courtTypeId(request.tipo()));
            ps.setString(2, fallback(request.nombre(), "Cancha"));
            ps.setBoolean(3, request.techada());
            ps.setString(4, request.foto());
            ps.setString(5, request.superficie());
            ps.setArray(6, textArray(connection, request.equipamiento()));
            ps.setString(7, request.disponible() ? "A" : "I");
            ps.setInt(8, Integer.parseInt(id));
            return ps;
        });
        if (updated == 0) return Optional.empty();
        syncTarifas(Integer.parseInt(id), request);
        return getCourt(id);
    }

    public boolean deleteCourt(String id) {
        return jdbc.update("""
                update cancha set estado = 'I', fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                where id_cancha = ?
                """, Integer.parseInt(id)) > 0;
    }

    @Transactional
    public BookingResponse createBooking(BookingRequest request) {
        if (request == null || request.playerId() == null || request.playerId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para registrar una reserva.");
        }
        UUID userId;
        try {
            userId = UUID.fromString(request.playerId().trim());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identificador de usuario autenticado inválido.");
        }
        AuthUserDto authUser = currentUser(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Usuario autenticado no encontrado o inactivo."));
        return createBooking(request, authUser, request.idempotencyKey());
    }

    @Transactional
    public BookingResponse createBooking(BookingRequest request, AuthUserDto authUser, String idempotencyKeyHeader) {
        if (authUser == null || authUser.id() == null || authUser.id().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para registrar una reserva.");
        }
        if (request == null || request.courtId() == null || request.courtId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La cancha es obligatoria para registrar la reserva.");
        }
        UUID usuarioUuid;
        try {
            usuarioUuid = UUID.fromString(authUser.id().trim());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identificador de usuario autenticado inválido.");
        }
        int courtId;
        try {
            courtId = Integer.parseInt(request.courtId().trim());
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "courtId inválido");
        }

        LocalDate fecha = parseDate(request.fecha());
        NormalizedSlotRange slotRange = resolveAndValidateSlotRange(request.horario(), request.hours());
        String effectiveIdempotencyKey = sanitizeIdempotencyKey(
                idempotencyKeyHeader != null && !idempotencyKeyHeader.isBlank()
                        ? idempotencyKeyHeader
                        : request.idempotencyKey());

        ReentrantLock courtLock = courtLocks.computeIfAbsent(courtId, k -> new ReentrantLock());
        courtLock.lock();
        try {
            LockedCourtInfo lockedCourt = lockAndValidateCourt(courtId);
            QuoteResponse quote = quoteCourtBooking(String.valueOf(courtId), new QuoteRequest(fecha.toString(), slotRange.hours()));
            if (!quote.valid()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, quote.errorMessage());
            }

            if (effectiveIdempotencyKey != null) {
                Optional<IdempotentBookingMatch> existing = findBookingByIdempotencyKey(effectiveIdempotencyKey);
                if (existing.isPresent()) {
                    IdempotentBookingMatch match = existing.get();
                    boolean sameOperation = Objects.equals(match.usuarioId(), usuarioUuid)
                            && match.courtId() == courtId
                            && Objects.equals(match.fecha(), fecha)
                            && Objects.equals(match.horaInicio(), slotRange.startTime())
                            && Objects.equals(match.horaFin(), slotRange.endTime());
                    if (!sameOperation) {
                        throw new ResponseStatusException(
                                HttpStatus.CONFLICT,
                                "La clave de idempotencia ya fue utilizada con parámetros distintos.");
                    }
                    return withQuoteDetails(
                            getBookingById(match.reservaId()).orElseThrow(),
                            quote.tranches(),
                            effectiveIdempotencyKey);
                }
            }

            // Validación de método de pago online (Fase 5)
            String rawMetodo = request.metodoPago();
            String normMetodo = normalize(rawMetodo);
            boolean isPlayer = authUser.rol() == null || "cliente".equalsIgnoreCase(authUser.rol()) || "jugador".equalsIgnoreCase(authUser.rol());
            if (isPlayer && (normMetodo.contains("yape") || normMetodo.contains("plin") || normMetodo.contains("efectivo"))) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "En reservas online solo está habilitado el pago al 100% con tarjeta. Yape y Plin están deshabilitados online y efectivo es solo presencial.");
            }

            // Evaluación de simulación de pago con tarjeta (Fase 5)
            String outcome = request.paymentOutcome() != null ? request.paymentOutcome().trim().toLowerCase(Locale.ROOT) : "";
            String cardNum = request.cardNumber() != null ? request.cardNumber().replaceAll("\\s+", "") : "";

            if ("timeout".equals(outcome) || cardNum.endsWith("9999")) {
                throw new ResponseStatusException(
                        HttpStatus.GATEWAY_TIMEOUT,
                        "Tiempo de espera agotado al procesar el pago con tarjeta. No se realizó ningún cargo ni confirmación.");
            }
            if ("rejected".equals(outcome) || cardNum.endsWith("0000")) {
                throw new ResponseStatusException(
                        HttpStatus.PAYMENT_REQUIRED,
                        "El pago simulado con tarjeta fue rechazado por la entidad emisora. La reserva no fue confirmada.");
            }

            if (request.total() < 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto total no puede ser negativo.");
            }
            if (request.total() > 0 && Math.abs(request.total() - quote.total()) > 0.01) {
                throw new ResponseStatusException(
                        HttpStatus.CONFLICT,
                        "La tarifa vigente del horario seleccionado es S/ " + quote.total()
                                + " y no coincide con el monto enviado.");
            }

            validateNotPastInLima(fecha, slotRange.startHour());
            validateWithinVenueOperatingHours(lockedCourt.sedeId(), fecha, slotRange);
            validateNoOverlappingReservationsOrMaintenance(courtId, fecha, slotRange);

            UUID clienteUuid = resolveOrCreateAuthenticatedClienteId(authUser, usuarioUuid);
            int confirmedStatusId = reservationStatusId("confirm");
            String codigo = generateUniquePassCode();
            double authoritativeTotal = quote.total();
            String metodoPagoEfectivo = (rawMetodo == null || rawMetodo.isBlank()) ? "Tarjeta" : rawMetodo.trim();

            KeyHolder keyHolder = new GeneratedKeyHolder();
            try {
                jdbc.update(connection -> {
                    PreparedStatement ps = connection.prepareStatement("""
                            insert into reserva (id_cliente, id_cancha, id_estado_reserva, id_usuario, fecha_reserva,
                                                 hora_inicio, hora_fin, monto_total, adelanto, saldo, codigo_pase,
                                                 estado, usucre, pccre)
                            values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                            """, Statement.RETURN_GENERATED_KEYS);
                    ps.setObject(1, clienteUuid);
                    ps.setInt(2, courtId);
                    ps.setInt(3, confirmedStatusId);
                    ps.setObject(4, usuarioUuid);
                    ps.setObject(5, fecha);
                    ps.setObject(6, slotRange.startTime());
                    ps.setObject(7, slotRange.endTime());
                    ps.setBigDecimal(8, BigDecimal.valueOf(authoritativeTotal));
                    ps.setBigDecimal(9, BigDecimal.valueOf(authoritativeTotal));
                    ps.setBigDecimal(10, BigDecimal.ZERO);
                    ps.setString(11, codigo);
                    return ps;
                }, keyHolder);
            } catch (org.springframework.dao.DataIntegrityViolationException ex) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Horario no disponible: conflicto de concurrencia detectado.", ex);
            }

            Number id = (Number) keyHolder.getKeys().get("id_reserva");
            int reservaId = id.intValue();

            createPayment(reservaId, authoritativeTotal, metodoPagoEfectivo, effectiveIdempotencyKey, "aprobado");
            return withQuoteDetails(
                    getBookingById(reservaId).orElseThrow(),
                    quote.tranches(),
                    effectiveIdempotencyKey);
        } finally {
            courtLock.unlock();
        }
    }

    public Optional<BookingResponse> confirmBooking(int id, AuthUserDto authUser) {
        if (authUser == null || authUser.id() == null || authUser.id().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para confirmar una reserva.");
        }
        UUID authUuid;
        try {
            authUuid = UUID.fromString(authUser.id().trim());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identificador de usuario inválido.");
        }

        List<Map<String, Object>> rows = jdbc.queryForList("""
                select r.id_reserva, s.id_dueno
                from reserva r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = c.id_sede
                where r.id_reserva = ? and r.estado = 'A'
                """, id);
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        String rol = authUser.rol() == null ? "" : authUser.rol().trim().toLowerCase(Locale.ROOT);
        boolean isAdmin = "admin".equals(rol) || "administrador".equals(rol);
        boolean isOwner = "dueno".equals(rol) || "dueño".equals(rol) || "owner".equals(rol) || "propietario".equals(rol);

        if (!isAdmin && !isOwner) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permisos para realizar esta operación");
        }

        UUID duenoId = (UUID) rows.get(0).get("id_dueno");
        if (!isAdmin && (duenoId == null || !authUuid.equals(duenoId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para modificar reservas de otra sede.");
        }

        return updateBookingStatus(id, reservationStatusId("confirm"));
    }

    public Optional<BookingResponse> cancelBooking(int id, AuthUserDto authUser) {
        if (authUser == null || authUser.id() == null || authUser.id().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para cancelar una reserva.");
        }
        UUID authUuid;
        try {
            authUuid = UUID.fromString(authUser.id().trim());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identificador de usuario inválido.");
        }

        List<Map<String, Object>> rows = jdbc.queryForList("""
                select r.id_usuario, r.id_cliente, s.id_dueno, r.id_estado_reserva,
                       (select c2.id_usuario from cliente c2 where c2.id_cliente = r.id_cliente) as cliente_usuario_id
                from reserva r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = c.id_sede
                where r.id_reserva = ? and r.estado = 'A'
                """, id);
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        Map<String, Object> row = rows.get(0);
        UUID reservaUsuarioId = (UUID) row.get("id_usuario");
        UUID reservaClienteId = (UUID) row.get("id_cliente");
        UUID clienteUsuarioId = (UUID) row.get("cliente_usuario_id");
        UUID duenoId = (UUID) row.get("id_dueno");

        String rol = authUser.rol() == null ? "" : authUser.rol().trim().toLowerCase(Locale.ROOT);
        boolean isAdmin = "admin".equals(rol) || "administrador".equals(rol);
        boolean isVenueOwner = ("dueno".equals(rol) || "dueño".equals(rol) || "owner".equals(rol) || "propietario".equals(rol))
                && authUuid.equals(duenoId);
        boolean isOwnerPlayer = authUuid.equals(reservaUsuarioId)
                || authUuid.equals(reservaClienteId)
                || (clienteUsuarioId != null && authUuid.equals(clienteUsuarioId));

        if (!isAdmin && !isVenueOwner && !isOwnerPlayer) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para cancelar esta reserva.");
        }

        int cancelStatusId = reservationStatusId("cancel");
        Object currentStatusObj = row.get("id_estado_reserva");
        if (currentStatusObj != null && ((Number) currentStatusObj).intValue() == cancelStatusId) {
            return getBookingById(id);
        }

        return updateBookingStatus(id, cancelStatusId);
    }

    public List<BookingResponse> listMyBookings(AuthUserDto authUser) {
        if (authUser == null || authUser.id() == null || authUser.id().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para consultar tu itinerario.");
        }
        UUID usuarioUuid;
        try {
            usuarioUuid = UUID.fromString(authUser.id().trim());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identificador de usuario inválido.");
        }
        return jdbc.query(
                bookingsSql() + """
                        where (r.id_usuario = ? or r.id_cliente in (select c.id_cliente from cliente c where c.id_usuario = ?))
                          and r.estado = 'A'
                        order by r.fecha_reserva desc, r.hora_inicio desc
                        """,
                bookingRowMapper(),
                usuarioUuid,
                usuarioUuid);
    }

    public Optional<BookingResponse> completeBooking(int id, AuthUserDto authUser) {
        if (authUser == null || authUser.id() == null || authUser.id().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para completar una reserva.");
        }
        UUID authUuid;
        try {
            authUuid = UUID.fromString(authUser.id().trim());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identificador de usuario inválido.");
        }

        List<Map<String, Object>> rows = jdbc.queryForList("""
                select r.id_reserva, s.id_dueno
                from reserva r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = c.id_sede
                where r.id_reserva = ? and r.estado = 'A'
                """, id);
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        String rol = authUser.rol() == null ? "" : authUser.rol().trim().toLowerCase(Locale.ROOT);
        boolean isAdmin = "admin".equals(rol) || "administrador".equals(rol);
        boolean isOwner = "dueno".equals(rol) || "dueño".equals(rol) || "owner".equals(rol) || "propietario".equals(rol);

        if (!isAdmin && !isOwner) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permisos para realizar esta operación");
        }

        UUID duenoId = (UUID) rows.get(0).get("id_dueno");
        if (!isAdmin && (duenoId == null || !authUuid.equals(duenoId))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para modificar reservas de otra sede.");
        }

        return updateBookingStatus(id, reservationStatusId("complet"));
    }

    public Optional<PublicPassResponse> getBookingByPass(String codigo) {
        if (codigo == null || codigo.isBlank()) {
            return Optional.empty();
        }
        return jdbc.query("""
                select r.id_reserva, r.codigo_pase, c.nombre_numero as cancha_nombre,
                       s.nombre as sede_nombre, r.fecha_reserva, r.hora_inicio, r.hora_fin,
                       coalesce(er.nombre, 'Confirmada') as estado_nombre,
                       coalesce(cl.nombres, u.nombre, 'Jugador') as nombre_completo
                from reserva r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = c.id_sede
                left join estado_reserva er on er.id_estado_reserva = r.id_estado_reserva
                left join cliente cl on cl.id_cliente = r.id_cliente
                left join usuario u on u.id_usuario = r.id_usuario
                where r.codigo_pase = ? and r.estado = 'A'
                """, (rs, rowNum) -> new PublicPassResponse(
                        String.valueOf(rs.getInt("id_reserva")),
                        rs.getString("codigo_pase"),
                        rs.getString("cancha_nombre"),
                        rs.getString("sede_nombre"),
                        rs.getObject("fecha_reserva", LocalDate.class).toString(),
                        formatTime(rs.getTime("hora_inicio")) + " - " + formatTime(rs.getTime("hora_fin")),
                        rs.getString("estado_nombre"),
                        extractFirstName(rs.getString("nombre_completo"))),
                codigo.trim()).stream().findFirst();
    }

    public List<BookingResponse> listBookings(String venueId, AuthUserDto authUser) {
        if (authUser == null || authUser.id() == null || authUser.id().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para consultar reservas.");
        }
        UUID authUuid;
        try {
            authUuid = UUID.fromString(authUser.id().trim());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Identificador de usuario inválido.");
        }

        String rol = authUser.rol() == null ? "" : authUser.rol().trim().toLowerCase(Locale.ROOT);
        boolean isAdmin = "admin".equals(rol) || "administrador".equals(rol);
        boolean isOwner = "dueno".equals(rol) || "dueño".equals(rol) || "owner".equals(rol) || "propietario".equals(rol);

        if (!isAdmin && !isOwner) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para consultar el listado operativo de reservas.");
        }

        if (venueId != null && !venueId.isBlank()) {
            int sedeId;
            try {
                sedeId = Integer.parseInt(venueId.trim());
            } catch (NumberFormatException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador de sede inválido.");
            }

            if (!isAdmin) {
                List<UUID> duenos = jdbc.queryForList("""
                        select id_dueno from sede where id_sede = ? and estado = 'A'
                        """, UUID.class, sedeId);
                if (duenos.isEmpty() || !authUuid.equals(duenos.get(0))) {
                    throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para consultar reservas de esta sede.");
                }
            }

            return jdbc.query(
                    bookingsSql() + " where s.id_sede = ? order by r.fecha_reserva desc, r.hora_inicio desc",
                    bookingRowMapper(),
                    sedeId);
        }

        if (isAdmin) {
            return jdbc.query(bookingsSql() + " order by r.fecha_reserva desc, r.hora_inicio desc", bookingRowMapper());
        }

        return jdbc.query(
                bookingsSql() + " where s.id_dueno = ? order by r.fecha_reserva desc, r.hora_inicio desc",
                bookingRowMapper(),
                authUuid);
    }

    public List<BookingResponse> listBookingsByPlayer(String playerId, AuthUserDto authUser) {
        if (authUser == null || authUser.id() == null || authUser.id().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para consultar reservas.");
        }
        UUID authUuid;
        UUID targetPlayerUuid;
        try {
            authUuid = UUID.fromString(authUser.id().trim());
            targetPlayerUuid = UUID.fromString(playerId.trim());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador de usuario inválido.");
        }

        String rol = authUser.rol() == null ? "" : authUser.rol().trim().toLowerCase(Locale.ROOT);
        boolean isAdmin = "admin".equals(rol) || "administrador".equals(rol);
        boolean isSelf = authUuid.equals(targetPlayerUuid);

        if (!isSelf && !isAdmin) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No tienes permiso para consultar las reservas de otro jugador.");
        }

        return jdbc.query(
                bookingsSql() + """
                        where (r.id_usuario = ? or r.id_cliente in (select c.id_cliente from cliente c where c.id_usuario = ?))
                          and r.estado = 'A'
                        order by r.fecha_reserva desc, r.hora_inicio desc
                        """,
                bookingRowMapper(),
                targetPlayerUuid,
                targetPlayerUuid);
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

    public List<ProductDto> listProducts() {
        return listProducts(null);
    }

    public boolean salePaymentsReady() { return salePayments.available(); }

    public pe.canchero.backend.web.dto.CashBalanceDto cashBalance(int sessionId) {
        var payments = salePayments.totals(sessionId);
        BigDecimal opening = jdbc.queryForObject("select monto_apertura from sesion_caja where id_sesion_caja=?", BigDecimal.class, sessionId);
        BigDecimal movements = jdbc.queryForObject("select coalesce(sum(case when id_tipo_movimiento=1 then monto when id_tipo_movimiento=2 then -monto else 0 end),0) from movimiento_caja where id_sesion_caja=? and estado='A'", BigDecimal.class, sessionId);
        return new pe.canchero.backend.web.dto.CashBalanceDto(sessionId, payments.efectivo(), payments.digital(), opening.add(movements).add(payments.efectivo()));
    }

    public List<ProductDto> listProducts(Integer sedeId) {
        int targetSedeId = requireExplicitVenue(sedeId);
        return jdbc.query("""
                select p.id_producto, k.id_sede, p.id_categoria, coalesce(cp.nombre, 'General') as categoria_nombre,
                       p.codigo_barras, p.nombre, p.precio_compra, p.precio_venta, p.stock_minimo,
                       k.saldo_stock as stock
                from producto p
                left join categoria_producto cp on cp.id_categoria = p.id_categoria
                join kardex k on k.id_kardex = (
                    select latest.id_kardex
                    from kardex latest
                    where latest.id_producto = p.id_producto and latest.id_sede = ? and latest.estado = 'A'
                    order by coalesce(latest.fecha, latest.feccre) desc, latest.id_kardex desc
                    limit 1
                )
                where p.estado = 'A'
                order by p.nombre
                """, productRowMapper(), targetSedeId);
    }

    private int requireExplicitVenue(Integer sedeId) {
        if (sedeId == null || sedeId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una sede");
        return sedeId;
    }

    public List<InventoryMovementDto> listInventoryMovements() {
        return listInventoryMovements(null);
    }

    public List<InventoryMovementDto> listInventoryMovements(Integer sedeId) {
        int targetSedeId = requireExplicitVenue(sedeId);
        return jdbc.query("""
                select k.id_kardex, k.id_sede, k.id_producto, coalesce(p.nombre, 'Producto #' || k.id_producto) as producto_nombre,
                       coalesce(k.fecha, k.feccre) as fecha, k.id_tipo_mov_inv, k.cantidad,
                       k.precio_unitario, k.saldo_stock, k.motivo
                from kardex k
                left join producto p on p.id_producto = k.id_producto
                where k.estado = 'A' and k.id_sede = ?
                order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                """, inventoryRowMapper(), targetSedeId);
    }

    public List<SaleDto> listSales() {
        return listSales(null);
    }

    public List<SaleDto> listSales(Integer sedeId) {
        int targetSedeId = requireExplicitVenue(sedeId);
        return jdbc.query("""
                select v.id_venta, v.id_sede, v.fecha_venta, v.id_sesion_caja,
                       v.cajero_nombre, v.tipo_comprobante, v.numero_comprobante,
                       v.subtotal, v.igv, v.total, v.estado
                from (
                    select v.id_venta,
                           coalesce(c.id_sede, (
                               select k.id_sede
                               from venta_detalle vd
                               join kardex k on k.id_producto = vd.id_producto
                               where vd.id_venta = v.id_venta
                                 and k.estado = 'A'
                                 and k.motivo like ('Venta POS #' || v.id_venta || '%')
                               order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                               limit 1
                           )) as id_sede,
                           coalesce(v.fecha_venta, v.feccre) as fecha_venta,
                           v.id_sesion_caja,
                           coalesce(u.nombre, 'Cajero') as cajero_nombre,
                           v.tipo_comprobante,
                           v.numero_comprobante,
                           v.subtotal,
                           v.igv,
                           v.total,
                           v.estado
                    from venta v
                    left join usuario u on u.id_usuario = v.id_usuario
                    left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                    left join caja c on c.id_caja = sc.id_caja
                ) v
                where v.estado = 'A'
                  and v.id_sede = ?
                order by v.fecha_venta desc, v.id_venta desc
                """, (rs, rowNum) -> mapSale(rs, saleItems(rs.getInt("id_venta"))), targetSedeId);
    }

    @Transactional
    public SaleDto processSale(ProcessSaleRequest request) {
        int sedeId = requireExplicitVenue(request.sedeId());
        salePayments.requireSchema();
        UUID author = resolveOperationalUserId(request.usuarioId());
        String operationKey = salePayments.key(request);
        String operationHash = salePayments.fingerprint(request);
        Integer previous = salePayments.replay(request, operationKey, operationHash);
        if (previous != null) return getSale(previous, sedeId).orElseThrow();
        salePayments.lockSession(request.sesionCajaId());
        Integer ownerMatches = jdbc.queryForObject("""
                select count(*) from sesion_caja sc join caja c on c.id_caja=sc.id_caja
                join sede s on s.id_sede=c.id_sede where sc.id_sesion_caja=? and c.id_sede=?
                and s.id_dueno=? and c.estado='A' and s.estado='A'
                """, Integer.class, request.sesionCajaId(), sedeId, author);
        if (ownerMatches == null || ownerMatches != 1) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El turno no pertenece a tu sede");
        previous = salePayments.replay(request, operationKey, operationHash);
        if (previous != null) return getSale(previous, sedeId).orElseThrow();
        if (request.items() == null || request.items().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El carrito de venta está vacío");
        }
        UUID userId = resolveOperationalUserId(request.usuarioId());
        BigDecimal exactTotal = BigDecimal.ZERO;
        List<SaleItemDto> normalizedItems = new ArrayList<>();
        if (request.items().stream().anyMatch(java.util.Objects::isNull)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Partida invalida");
        if (request.items().stream().map(SaleItemDto::productoId).distinct().count() != request.items().size())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Agrupa las cantidades de cada producto en una sola partida");
        request.items().stream().map(SaleItemDto::productoId).sorted().forEach(id ->
                jdbc.queryForList("select id_producto from producto where id_producto=? for update", id));
        for (SaleItemDto item : request.items()) {
            ProductDto product = getProduct(item.productoId(), sedeId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Producto no disponible"));
            if (item.cantidad() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La cantidad debe ser mayor que cero");
            }
            int currentStock = stockForProduct(item.productoId(), sedeId);
            if (item.cantidad() > currentStock) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Stock insuficiente para " + product.nombre());
            }
            double lineTotal = BigDecimal.valueOf(product.precioVenta()).multiply(BigDecimal.valueOf(item.cantidad())).setScale(2, java.math.RoundingMode.HALF_UP).doubleValue();
            exactTotal = exactTotal.add(BigDecimal.valueOf(lineTotal));
            normalizedItems.add(new SaleItemDto(product.id(), product.nombre(), item.cantidad(), product.precioVenta(), lineTotal));
        }
        double total = exactTotal.doubleValue();
        var payments = salePayments.normalize(request, SalePaymentLedger.money(exactTotal));
        double subtotal = round2(total / 1.18);
        double igv = round2(total - subtotal);
        String tipo = fallback(request.tipoComprobante(), "boleta").toLowerCase(Locale.ROOT);
        String numero = nextSaleNumber(tipo);

        KeyHolder keyHolder = new GeneratedKeyHolder();
        double finalSubtotal = subtotal;
        double finalIgv = igv;
        double finalTotal = total;
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into venta (id_usuario, id_sesion_caja, fecha_venta, subtotal, igv, total,
                                       tipo_comprobante, numero_comprobante, estado, usucre, pccre)
                    values (?, ?, now(), ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setObject(1, userId);
            if (request.sesionCajaId() == null) {
                ps.setObject(2, null);
            } else {
                ps.setInt(2, request.sesionCajaId());
            }
            ps.setBigDecimal(3, BigDecimal.valueOf(finalSubtotal));
            ps.setBigDecimal(4, BigDecimal.valueOf(finalIgv));
            ps.setBigDecimal(5, BigDecimal.valueOf(finalTotal));
            ps.setString(6, tipo);
            ps.setString(7, numero);
            return ps;
        }, keyHolder);
        int saleId = ((Number) keyHolder.getKeys().get("id_venta")).intValue();
        for (SaleItemDto item : normalizedItems) {
            jdbc.update("""
                    insert into venta_detalle (id_venta, id_producto, cantidad, precio_unitario,
                                               subtotal, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """,
                    saleId,
                    item.productoId(),
                    item.cantidad(),
                    BigDecimal.valueOf(item.precioUnitario()),
                    BigDecimal.valueOf(item.subtotal()));
            int newStock = stockForProduct(item.productoId(), sedeId) - item.cantidad();
            insertKardex(item.productoId(), sedeId, 2, item.cantidad(), item.precioUnitario(), newStock,
                    "Venta POS #" + saleId + " (" + numero + ")");
        }
        salePayments.record(saleId, request, operationKey, operationHash, payments);
        return getSale(saleId, sedeId).orElseThrow();
    }

    @Transactional
    public InventoryMovementDto registerInventoryEntry(InventoryEntryRequest request) {
        jdbc.queryForList("select id_producto from producto where id_producto=? for update", request.productoId());
        if (request.cantidad() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La cantidad debe ser mayor que cero");
        }
        int sedeId = requireExplicitVenue(request.sedeId());
        ProductDto product = getProduct(request.productoId(), sedeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Producto no disponible"));
        int newStock = stockForProduct(request.productoId(), sedeId) + request.cantidad();
        int movementId = insertKardex(
                request.productoId(),
                sedeId,
                1,
                request.cantidad(),
                request.precioCompra() > 0 ? request.precioCompra() : product.precioCompra(),
                newStock,
                fallback(request.motivo(), "Ingreso de mercadería / Reposición proveedor"));
        return listInventoryMovements(sedeId).stream()
                .filter(k -> k.id() == movementId)
                .findFirst()
                .orElseThrow();
    }

    private Optional<BookingResponse> getBookingById(int id) {
        return jdbc.query(bookingsSql() + " where r.id_reserva = ?", bookingRowMapper(), id).stream().findFirst();
    }

    private Optional<BookingResponse> updateBookingStatus(int id, int statusId) {
        int updated = jdbc.update("""
                update reserva
                set id_estado_reserva = ?, fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                where id_reserva = ? and estado = 'A'
                """, statusId, id);
        return updated == 0 ? Optional.empty() : getBookingById(id);
    }

    private record LockedCourtInfo(int courtId, int sedeId, String courtEstado, String sedeEstado) {
    }

    private record NormalizedSlotRange(
            LocalTime startTime,
            LocalTime endTime,
            int startHour,
            int endHour,
            List<Integer> hours,
            String canonicalHorario) {
    }

    private record IdempotentBookingMatch(
            int reservaId,
            UUID usuarioId,
            int courtId,
            LocalDate fecha,
            LocalTime horaInicio,
            LocalTime horaFin) {
    }

    private LockedCourtInfo lockAndValidateCourt(int courtId) {
        List<LockedCourtInfo> rows = jdbc.query("""
                        select c.id_cancha, c.id_sede, c.estado as court_estado, s.estado as sede_estado
                        from cancha c
                        join sede s on s.id_sede = c.id_sede
                        where c.id_cancha = ?
                        for update
                        """,
                (rs, rowNum) -> new LockedCourtInfo(
                        rs.getInt("id_cancha"),
                        rs.getInt("id_sede"),
                        rs.getString("court_estado"),
                        rs.getString("sede_estado")),
                courtId);
        if (rows.isEmpty() || !"A".equals(rows.get(0).courtEstado()) || !"A".equals(rows.get(0).sedeEstado())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cancha no disponible");
        }
        return rows.get(0);
    }

    private NormalizedSlotRange resolveAndValidateSlotRange(String rawHorario, List<Integer> rawHours) {
        List<Integer> sortedHours = null;
        if (rawHours != null && !rawHours.isEmpty()) {
            sortedHours = rawHours.stream().filter(Objects::nonNull).distinct().sorted().toList();
            if (sortedHours.size() != rawHours.size()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Existen turnos duplicados en la selección.");
            }
            for (int h : sortedHours) {
                if (h < 0 || h > 23) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hora fuera de rango permitido (0..23).");
                }
            }
            for (int i = 0; i < sortedHours.size() - 1; i++) {
                if (sortedHours.get(i + 1) != sortedHours.get(i) + 1) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Los turnos seleccionados deben ser horas continuas en la misma cancha.");
                }
            }
        }

        if (rawHorario != null && !rawHorario.isBlank()) {
            String[] parts = rawHorario.split("-");
            if (parts.length < 2) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El horario debe tener el formato HH:mm - HH:mm");
            }
            LocalTime start;
            LocalTime end;
            try {
                start = LocalTime.parse(parts[0].trim());
                end = LocalTime.parse(parts[1].trim());
            } catch (RuntimeException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El horario debe tener el formato HH:mm - HH:mm");
            }
            if (start.getMinute() != 0 || start.getSecond() != 0 || end.getMinute() != 0 || end.getSecond() != 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Los turnos de reserva deben ser por horas exactas.");
            }
            int startHour = start.getHour();
            int endHour = (end.equals(LocalTime.MIDNIGHT) && startHour > 0) ? 24 : end.getHour();
            if (endHour <= startHour) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La hora de fin debe ser posterior a la hora de inicio");
            }
            List<Integer> rangeHours = IntStream.range(startHour, endHour).boxed().toList();
            if (sortedHours != null && !sortedHours.equals(rangeHours)) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "Los turnos seleccionados no coinciden con el rango horario solicitado.");
            }
            String canonical = String.format("%02d:00 - %s", startHour, endHour == 24 ? "00:00" : String.format("%02d:00", endHour));
            return new NormalizedSlotRange(start, end, startHour, endHour, rangeHours, canonical);
        }

        if (sortedHours != null) {
            int startHour = sortedHours.get(0);
            int endHour = sortedHours.get(sortedHours.size() - 1) + 1;
            LocalTime start = LocalTime.of(startHour, 0);
            LocalTime end = endHour == 24 ? LocalTime.MIDNIGHT : LocalTime.of(endHour, 0);
            String canonical = String.format("%02d:00 - %s", startHour, endHour == 24 ? "00:00" : String.format("%02d:00", endHour));
            return new NormalizedSlotRange(start, end, startHour, endHour, sortedHours, canonical);
        }

        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El horario de la reserva es obligatorio.");
    }

    private void validateNotPastInLima(LocalDate fecha, int startHour) {
        ZonedDateTime nowLima = ZonedDateTime.now(clock.withZone(LIMA_ZONE));
        LocalDate todayLima = nowLima.toLocalDate();
        if (fecha.isBefore(todayLima)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No se puede registrar una reserva en una fecha pasada.");
        }
        if (fecha.isEqual(todayLima) && startHour <= nowLima.getHour()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No se puede reservar un horario que ya inició o ya pasó.");
        }
    }

    private void validateWithinVenueOperatingHours(int sedeId, LocalDate fecha, NormalizedSlotRange slotRange) {
        Integer configuredCount = jdbc.queryForObject(
                "select count(*) from tipo_horario where id_sede = ? and estado = 'A'",
                Integer.class,
                sedeId);
        if (configuredCount == null || configuredCount == 0) {
            return;
        }
        int dayOfWeek = fecha.getDayOfWeek().getValue() % 7;
        int legacySunday = dayOfWeek == 0 ? 7 : dayOfWeek;
        List<int[]> windows = jdbc.query("""
                        select apertura, cierre
                        from tipo_horario
                        where id_sede = ?
                          and estado = 'A'
                          and (dia_semana = ? or dia_semana = ?)
                        order by id_tipo_horario
                        """,
                (rs, rowNum) -> {
                    Time openTime = rs.getTime("apertura");
                    Time closeTime = rs.getTime("cierre");
                    if (openTime == null || closeTime == null) {
                        return new int[]{0, 0};
                    }
                    LocalTime open = openTime.toLocalTime();
                    LocalTime close = closeTime.toLocalTime();
                    int openH = open.getHour();
                    int closeH = (close.equals(LocalTime.MIDNIGHT) && openH > 0) ? 24 : close.getHour();
                    return new int[]{openH, closeH};
                },
                sedeId,
                dayOfWeek,
                legacySunday);

        if (windows.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La sede se encuentra cerrada en el día seleccionado.");
        }
        int[] window = windows.get(0);
        int openH = window[0];
        int closeH = window[1];
        if (openH == closeH || slotRange.startHour() < openH || slotRange.endHour() > closeH) {
            throw new ResponseStatusException(
                    HttpStatus.CONFLICT,
                    "El horario solicitado está fuera del horario de atención de la sede.");
        }
    }

    private void validateNoOverlappingReservationsOrMaintenance(int courtId, LocalDate fecha, NormalizedSlotRange slotRange) {
        List<int[]> activeReservations = jdbc.query("""
                        select r.hora_inicio, r.hora_fin
                        from reserva r
                        join estado_reserva er on er.id_estado_reserva = r.id_estado_reserva
                        where r.id_cancha = ?
                          and r.fecha_reserva = ?
                          and r.estado = 'A'
                          and er.estado = 'A'
                          and (lower(er.nombre) like '%pend%' or lower(er.nombre) like '%confirm%' or lower(er.nombre) like '%aprob%')
                        """,
                (rs, rowNum) -> {
                    LocalTime hi = rs.getTime("hora_inicio").toLocalTime();
                    LocalTime hf = rs.getTime("hora_fin").toLocalTime();
                    int sH = hi.getHour();
                    int eH = (hf.equals(LocalTime.MIDNIGHT) && sH > 0) ? 24 : hf.getHour();
                    return new int[]{sH, eH};
                },
                courtId,
                fecha);

        for (int[] occupied : activeReservations) {
            if (occupied[0] < slotRange.endHour() && occupied[1] > slotRange.startHour()) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Horario no disponible: ya existe una reserva activa en ese rango.");
            }
        }

        LocalDateTime slotStart = LocalDateTime.of(fecha, slotRange.startTime());
        LocalDateTime slotEnd = slotRange.endHour() == 24
                ? fecha.plusDays(1).atStartOfDay()
                : LocalDateTime.of(fecha, slotRange.endTime());
        Integer bloqueos = jdbc.queryForObject("""
                select count(*)
                from bloqueo_mantenimiento
                where id_cancha = ?
                  and estado = 'A'
                  and fecha_inicio < ?
                  and fecha_fin > ?
                """,
                Integer.class,
                courtId,
                slotEnd,
                slotStart);
        if (bloqueos != null && bloqueos > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Horario no disponible: la cancha se encuentra en mantenimiento.");
        }
    }

    private String sanitizeIdempotencyKey(String rawKey) {
        if (rawKey == null || rawKey.isBlank()) {
            return null;
        }
        String trimmed = rawKey.trim();
        if (trimmed.length() > 100) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La clave de idempotencia excede la longitud máxima permitida (100).");
        }
        return trimmed;
    }

    private Optional<IdempotentBookingMatch> findBookingByIdempotencyKey(String idempotencyKey) {
        String opCode = "IDEMP:" + idempotencyKey;
        return jdbc.query("""
                        select r.id_reserva, r.id_usuario, r.id_cancha, r.fecha_reserva, r.hora_inicio, r.hora_fin
                        from pago_reserva pr
                        join reserva r on r.id_reserva = pr.id_reserva
                        where pr.numero_operacion = ?
                          and pr.estado = 'A'
                          and r.estado = 'A'
                        order by r.id_reserva desc
                        limit 1
                        """,
                (rs, rowNum) -> new IdempotentBookingMatch(
                        rs.getInt("id_reserva"),
                        rs.getObject("id_usuario", UUID.class),
                        rs.getInt("id_cancha"),
                        rs.getObject("fecha_reserva", LocalDate.class),
                        rs.getTime("hora_inicio").toLocalTime(),
                        rs.getTime("hora_fin").toLocalTime()),
                opCode).stream().findFirst();
    }

    private String generateUniquePassCode() {
        for (int attempt = 0; attempt < 10; attempt++) {
            String candidate = "#CAN-" + ThreadLocalRandom.current().nextInt(1000, 9999);
            Integer exists = jdbc.queryForObject(
                    "select count(*) from reserva where codigo_pase = ?",
                    Integer.class,
                    candidate);
            if (exists == null || exists == 0) {
                return candidate;
            }
        }
        return "#CAN-" + ThreadLocalRandom.current().nextInt(10000, 99999);
    }

    private BookingResponse withQuoteDetails(
            BookingResponse base,
            List<QuoteResponse.QuoteTrancheDto> tranches,
            String idempotencyKey) {
        return new BookingResponse(
                base.id(),
                base.codigoPase(),
                base.courtId(),
                base.courtName(),
                base.venueName(),
                base.venueId(),
                base.fecha(),
                base.horario(),
                base.total(),
                base.status(),
                base.jugadores(),
                tranches == null ? List.of() : tranches,
                idempotencyKey,
                base.paymentStatus(),
                base.retentionStatus(),
                base.paidAmount(),
                base.balanceAmount(),
                base.paymentMethod(),
                base.paymentOperationNumber());
    }

    private void createPayment(int reservaId, double total, String metodoPago, String idempotencyKey, String paymentStatus) {
        double comision = round2(total * 0.05);
        double netoDueno = round2(total - comision);
        String numeroOperacion = idempotencyKey != null && !idempotencyKey.isBlank()
                ? ("IDEMP:" + idempotencyKey)
                : ("API-" + reservaId);
        boolean esAdelanto = !"aprobado".equalsIgnoreCase(paymentStatus);
        String estadoLiquidacion = paymentStatus != null && !paymentStatus.isBlank() ? paymentStatus : "aprobado";
        jdbc.update("""
                insert into pago_reserva (id_reserva, id_metodo_pago, monto, fecha_pago, numero_operacion,
                                          es_adelanto, comision_plataforma, monto_neto_dueno,
                                          estado_liquidacion, estado, usucre, pccre)
                values (?, ?, ?, now(), ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                """,
                reservaId,
                metodoPagoId(metodoPago),
                BigDecimal.valueOf(total),
                numeroOperacion,
                esAdelanto,
                BigDecimal.valueOf(comision),
                BigDecimal.valueOf(netoDueno),
                estadoLiquidacion);
    }

    private VenueResponse withCourts(VenueResponse venue, boolean includeInactive) {
        List<CourtDto> courts = jdbc.query(courtsSql(" where c.id_sede = ? " + (includeInactive ? "" : " and c.estado = 'A' "))
                        + " order by c.nombre_numero",
                courtRowMapper(),
                Integer.parseInt(venue.id()));
        return withCourts(venue, courts);
    }

    private VenueResponse withCourts(VenueResponse venue, List<CourtDto> courts) {
        List<String> amenidades = courts.stream()
                .flatMap(c -> List.of(c.tipo(), c.superficie(), c.cobertura()).stream())
                .filter(v -> v != null && !v.isBlank())
                .distinct()
                .toList();
        return new VenueResponse(
                venue.id(), venue.ownerId(), venue.nombre(), venue.direccion(), venue.distrito(), venue.ciudad(),
                venue.descripcion(), venue.portadaUrl(), venue.latitud(), venue.longitud(), venue.rating(),
                venue.telefono(), venue.tarifaBase(), venue.fotos(), amenidades, courts);
    }

    private RowMapper<VenueResponse> venueRowMapper() {
        return (rs, rowNum) -> {
            String image = rs.getString("imagen_url");
            return new VenueResponse(
                    String.valueOf(rs.getInt("id_sede")),
                    rs.getObject("id_dueno") == null ? null : rs.getObject("id_dueno").toString(),
                    rs.getString("nombre"),
                    rs.getString("direccion"),
                    Objects.toString(rs.getString("distrito_nombre"), ""),
                    Objects.toString(rs.getString("ciudad_nombre"), ""),
                    rs.getString("descripcion"),
                    image,
                    nullableDouble(rs, "latitud"),
                    nullableDouble(rs, "longitud"),
                    nullableDouble(rs, "rating"),
                    rs.getString("telefono"),
                    rs.getBigDecimal("tarifa_base") == null ? 80 : rs.getBigDecimal("tarifa_base").doubleValue(),
                    image == null || image.isBlank() ? List.of() : List.of(image),
                    List.of(),
                    List.of());
        };
    }

    private RowMapper<CourtDto> courtRowMapper() {
        return (rs, rowNum) -> {
            String tipo = rs.getString("tipo");
            String superficie = rs.getString("superficie");
            boolean techada = rs.getBoolean("techada");
            BigDecimal price = rs.getBigDecimal("precio_hora");
            BigDecimal nightPrice = rs.getBigDecimal("precio_hora_noche");
            Time nightStart = rs.getTime("hora_inicio_noche");
            double dayRate = price == null ? 80 : price.doubleValue();
            double nightRate = nightPrice == null ? dayRate : nightPrice.doubleValue();
            String nightHourStr = nightStart == null ? "18:00" : formatTime(nightStart);
            return new CourtDto(
                    String.valueOf(rs.getInt("id_cancha")),
                    rs.getString("nombre_numero"),
                    tipo == null ? "Fútbol 7" : tipo,
                    tipo == null ? "Fútbol 7" : tipo,
                    superficie == null ? "Grass Sintético" : superficie,
                    techada ? "Techada" : "Al Aire Libre",
                    techada,
                    "A".equals(rs.getString("estado")),
                    dayRate,
                    nightRate,
                    nightHourStr,
                    rs.getString("foto_url"), rs.getInt("id_sede"));
        };
    }

    private RowMapper<BookingResponse> bookingRowMapper() {
        return (rs, rowNum) -> {
            int reservaId = rs.getInt("id_reserva");
            double total = rs.getBigDecimal("monto_total") == null ? 0 : rs.getBigDecimal("monto_total").doubleValue();
            double adelanto = rs.getBigDecimal("adelanto") == null ? 0 : rs.getBigDecimal("adelanto").doubleValue();
            double saldo = rs.getBigDecimal("saldo") == null ? 0 : rs.getBigDecimal("saldo").doubleValue();
            String estado = rs.getString("estado_nombre");
            String paymentStatus = rs.getString("pago_estado");
            if (paymentStatus == null || paymentStatus.isBlank()) {
                paymentStatus = (adelanto >= total && total > 0) ? "aprobado" : "pendiente";
            }
            String metodoPago = rs.getString("metodo_pago_nombre");
            String numOp = rs.getString("pago_num_op");
            return new BookingResponse(
                    String.valueOf(reservaId),
                    rs.getString("codigo_pase"),
                    String.valueOf(rs.getInt("id_cancha")),
                    rs.getString("cancha_nombre"),
                    rs.getString("sede_nombre"),
                    String.valueOf(rs.getInt("id_sede")),
                    rs.getObject("fecha_reserva", LocalDate.class).toString(),
                    formatTime(rs.getTime("hora_inicio")) + " - " + formatTime(rs.getTime("hora_fin")),
                    total,
                    estado,
                    List.of(),
                    List.of(),
                    null,
                    paymentStatus,
                    "sin_retencion",
                    adelanto,
                    saldo,
                    metodoPago == null ? "Tarjeta" : metodoPago,
                    numOp);
        };
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

    private RowMapper<ProductDto> productRowMapper() {
        return (rs, rowNum) -> new ProductDto(
                rs.getInt("id_producto"),
                rs.getObject("id_sede") == null ? null : rs.getInt("id_sede"),
                rs.getInt("id_categoria"),
                rs.getString("categoria_nombre"),
                rs.getString("codigo_barras") == null ? "775" + rs.getInt("id_producto") : rs.getString("codigo_barras"),
                rs.getString("nombre"),
                rs.getBigDecimal("precio_compra") == null ? 0 : rs.getBigDecimal("precio_compra").doubleValue(),
                rs.getBigDecimal("precio_venta") == null ? 0 : rs.getBigDecimal("precio_venta").doubleValue(),
                rs.getInt("stock"),
                rs.getObject("stock_minimo") == null ? 5 : rs.getInt("stock_minimo"),
                "inventory");
    }

    private RowMapper<InventoryMovementDto> inventoryRowMapper() {
        return (rs, rowNum) -> new InventoryMovementDto(
                rs.getInt("id_kardex"),
                rs.getObject("id_sede") == null ? null : rs.getInt("id_sede"),
                rs.getInt("id_producto"),
                rs.getString("producto_nombre"),
                stringDateTime(rs, "fecha"),
                rs.getInt("id_tipo_mov_inv") == 1 ? "+" : "-",
                rs.getInt("cantidad"),
                rs.getBigDecimal("precio_unitario") == null ? 0 : rs.getBigDecimal("precio_unitario").doubleValue(),
                rs.getInt("saldo_stock"),
                rs.getString("motivo"),
                null);
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

    private Optional<ProductDto> getProduct(int productId) {
        return getProduct(productId, null);
    }

    private Optional<ProductDto> getProduct(int productId, Integer sedeId) {
        return listProducts(sedeId).stream().filter(p -> p.id() == productId).findFirst();
    }

    private Optional<SaleDto> getSale(int saleId, int sedeId) {
        return jdbc.query("""
                select v.id_venta, v.id_sede, v.fecha_venta, v.id_sesion_caja,
                       v.cajero_nombre, v.tipo_comprobante, v.numero_comprobante,
                       v.subtotal, v.igv, v.total, v.estado
                from (
                    select v.id_venta,
                           coalesce(c.id_sede, (
                               select k.id_sede
                               from venta_detalle vd
                               join kardex k on k.id_producto = vd.id_producto
                               where vd.id_venta = v.id_venta
                                 and k.estado = 'A'
                                 and k.motivo like ('Venta POS #' || v.id_venta || '%')
                               order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                               limit 1
                           )) as id_sede,
                           coalesce(v.fecha_venta, v.feccre) as fecha_venta,
                           v.id_sesion_caja,
                           coalesce(u.nombre, 'Cajero') as cajero_nombre,
                           v.tipo_comprobante,
                           v.numero_comprobante,
                           v.subtotal,
                           v.igv,
                           v.total,
                           v.estado
                    from venta v
                    left join usuario u on u.id_usuario = v.id_usuario
                    left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                    left join caja c on c.id_caja = sc.id_caja
                ) v
                where v.id_venta = ? and v.id_sede = ?
                """, (rs, rowNum) -> mapSale(rs, saleItems(saleId)), saleId, sedeId).stream().findFirst();
    }

    private List<SaleItemDto> saleItems(int saleId) {
        return jdbc.query("""
                select vd.id_producto, coalesce(p.nombre, 'Producto #' || vd.id_producto) as nombre,
                       vd.cantidad, vd.precio_unitario, vd.subtotal
                from venta_detalle vd
                left join producto p on p.id_producto = vd.id_producto
                where vd.id_venta = ? and vd.estado = 'A'
                order by vd.id_venta_detalle
                """,
                (rs, rowNum) -> new SaleItemDto(
                        rs.getInt("id_producto"),
                        rs.getString("nombre"),
                        rs.getInt("cantidad"),
                        rs.getBigDecimal("precio_unitario") == null ? 0 : rs.getBigDecimal("precio_unitario").doubleValue(),
                        rs.getBigDecimal("subtotal") == null ? 0 : rs.getBigDecimal("subtotal").doubleValue()),
                saleId);
    }

    private SaleDto mapSale(ResultSet rs, List<SaleItemDto> items) throws java.sql.SQLException {
        var payments = salePayments.payments(rs.getInt("id_venta"));
        String method = payments.isEmpty() ? "sin_desglose" : payments.size() == 1 ? payments.get(0).metodoPago() : "mixto";
        BigDecimal received = payments.stream().map(p -> p.montoRecibido()).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal change = payments.stream().map(p -> p.montoRecibido().subtract(p.monto())).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new SaleDto(
                "VNT-" + rs.getInt("id_venta"),
                rs.getObject("id_sede") == null ? null : rs.getInt("id_sede"),
                stringDateTime(rs, "fecha_venta"),
                rs.getObject("id_sesion_caja") == null ? null : rs.getInt("id_sesion_caja"),
                rs.getString("cajero_nombre"),
                "Cliente Mostrador",
                "",
                rs.getString("tipo_comprobante"),
                rs.getString("numero_comprobante"),
                items,
                rs.getBigDecimal("subtotal") == null ? 0 : rs.getBigDecimal("subtotal").doubleValue(),
                rs.getBigDecimal("igv") == null ? 0 : rs.getBigDecimal("igv").doubleValue(),
                rs.getBigDecimal("total") == null ? 0 : rs.getBigDecimal("total").doubleValue(),
                method,
                payments.isEmpty() ? null : received.doubleValue(),
                payments.isEmpty() ? null : change.doubleValue(),
                "completada", payments);
    }

    private int stockForProduct(int productId) {
        return stockForProduct(productId, null);
    }

    private int stockForProduct(int productId, Integer sedeId) {
        int targetSedeId = requireExplicitVenue(sedeId);
        List<Integer> stock = jdbc.queryForList("""
                select saldo_stock
                from kardex
                where id_producto = ? and id_sede = ? and estado = 'A'
                order by coalesce(fecha, feccre) desc, id_kardex desc
                limit 1
                """, Integer.class, productId, targetSedeId);
        return stock.isEmpty() ? 0 : stock.get(0);
    }

    private int insertKardex(int productId, int sedeId, int movementType, int quantity, double price, int stock, String reason) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into kardex (id_producto, id_sede, id_tipo_mov_inv, cantidad, precio_unitario,
                                        saldo_stock, motivo, fecha, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, ?, ?, now(), 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, productId);
            ps.setInt(2, sedeId);
            ps.setInt(3, movementType);
            ps.setInt(4, quantity);
            ps.setBigDecimal(5, BigDecimal.valueOf(price));
            ps.setInt(6, Math.max(0, stock));
            ps.setString(7, reason);
            return ps;
        }, keyHolder);
        return ((Number) keyHolder.getKeys().get("id_kardex")).intValue();
    }

    private UUID resolveOperationalUserId(String userId) {
        if (userId != null && !userId.isBlank()) {
            try {
                return UUID.fromString(userId);
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador de usuario inválido");
            }
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
    }

    private int resolveOperationalVenueId() {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una sede");
    }

    private String nextSaleNumber(String type) {
        String prefix = switch (type) {
            case "factura" -> "F001";
            case "ticket" -> "NV01";
            default -> "B001";
        };
        Integer next = jdbc.queryForObject("""
                select coalesce(max(cast(substring(numero_comprobante from position('-' in numero_comprobante) + 1) as integer)), 0) + 1
                from venta
                where numero_comprobante like ?
                """, Integer.class, prefix + "-%");
        return prefix + "-" + String.format("%06d", next == null ? 1 : next);
    }

    private String courtsSql(String whereClause) {
        return """
                select c.id_cancha, c.id_sede, c.nombre_numero, c.techada, c.foto_url, c.superficie, c.estado,
                       tc.nombre as tipo,
                       coalesce(min(case when t.hora_inicio < time '18:00:00' then t.precio end), min(t.precio), 80) as precio_hora,
                       coalesce(max(case when t.hora_inicio >= time '18:00:00' or t.hora_fin > time '18:00:00' then t.precio end), max(t.precio), 80) as precio_hora_noche,
                       min(case when t.hora_inicio >= time '17:00:00' and t.hora_inicio < time '23:00:00' then t.hora_inicio end) as hora_inicio_noche
                from cancha c
                left join tipo_cancha tc on tc.id_tipo_cancha = c.id_tipo_cancha
                left join tarifa_cancha t on t.id_cancha = c.id_cancha and t.estado = 'A'
                """ + whereClause + """
                group by c.id_cancha, c.id_sede, c.nombre_numero, c.techada, c.foto_url, c.superficie, c.estado, tc.nombre
                """;
    }

    private String bookingsSql() {
        return """
                select r.id_reserva, r.codigo_pase, r.id_cancha, r.fecha_reserva, r.hora_inicio, r.hora_fin,
                       r.monto_total, r.adelanto, r.saldo, er.nombre as estado_nombre,
                       c.nombre_numero as cancha_nombre, s.nombre as sede_nombre, s.id_sede,
                       (select pr.estado_liquidacion from pago_reserva pr where pr.id_reserva = r.id_reserva and pr.estado = 'A' order by pr.id_pago_reserva desc limit 1) as pago_estado,
                       (select pr.numero_operacion from pago_reserva pr where pr.id_reserva = r.id_reserva and pr.estado = 'A' order by pr.id_pago_reserva desc limit 1) as pago_num_op,
                       (select mp.nombre from pago_reserva pr join metodo_pago mp on mp.id_metodo_pago = pr.id_metodo_pago where pr.id_reserva = r.id_reserva and pr.estado = 'A' order by pr.id_pago_reserva desc limit 1) as metodo_pago_nombre
                from reserva r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = c.id_sede
                left join estado_reserva er on er.id_estado_reserva = r.id_estado_reserva
                """;
    }

    private void syncTarifas(int canchaId, CourtRequest request) {
        double precio = request.precioHora();
        double nocturno = request.precioHoraNoche() == null ? precio : request.precioHoraNoche();
        LocalTime inicioNoche;
        try { inicioNoche = LocalTime.parse(request.horaInicioNoche() == null ? "18:00" : request.horaInicioNoche()); }
        catch (RuntimeException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Hora nocturna invalida"); }
        if (!Double.isFinite(precio) || !Double.isFinite(nocturno) || precio < 0 || nocturno < 0
                || !inicioNoche.isAfter(LocalTime.of(8, 0)) || !inicioNoche.isBefore(LocalTime.of(23, 0))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tarifas o franja nocturna invalidas");
        }
        jdbc.update("update tarifa_cancha set estado = 'I', fecmod = now(), usmod = 'API' where id_cancha = ?", canchaId);
        for (int day = 0; day <= 6; day++) {
            jdbc.update("""
                    insert into tarifa_cancha (id_cancha, dia_semana, hora_inicio, hora_fin, precio, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """, canchaId, day, Time.valueOf("08:00:00"), Time.valueOf(inicioNoche), BigDecimal.valueOf(precio));
            jdbc.update("""
                    insert into tarifa_cancha (id_cancha, dia_semana, hora_inicio, hora_fin, precio, estado, usucre, pccre)
                    values (?, ?, ?, '23:00:00', ?, 'A', 'API', 'SPRING')
                    """, canchaId, day, Time.valueOf(inicioNoche), BigDecimal.valueOf(nocturno));
        }
    }

    private UUID resolveOwnerId(String ownerId) {
        if (ownerId != null && !ownerId.isBlank()) {
            try {
                return UUID.fromString(ownerId);
            } catch (IllegalArgumentException ignored) {
                // El admin antiguo aún maneja ids numéricos en memoria; se resuelve con fallback.
            }
        }
        List<UUID> ownerIds = jdbc.queryForList("""
                select u.id_usuario
                from usuario u
                join rol r on r.id_rol = u.id_rol
                where u.estado = 'A'
                  and lower(r.nombre) in ('dueno', 'dueño', 'owner', 'administrador', 'admin')
                order by u.feccre nulls last
                limit 1
                """, UUID.class);
        if (!ownerIds.isEmpty()) {
            return ownerIds.get(0);
        }
        return jdbc.queryForObject("select id_usuario from usuario where estado = 'A' limit 1", UUID.class);
    }

    private UUID resolveOrCreateAuthenticatedClienteId(AuthUserDto authUser, UUID usuarioUuid) {
        List<UUID> byUsuario = jdbc.queryForList(
                "select id_cliente from cliente where id_usuario = ? and estado = 'A' limit 1",
                UUID.class,
                usuarioUuid);
        if (!byUsuario.isEmpty()) {
            return byUsuario.get(0);
        }

        if (authUser.email() != null && !authUser.email().isBlank()) {
            List<UUID> byEmail = jdbc.queryForList(
                    "select id_cliente from cliente where lower(correo) = lower(?) and estado = 'A' and (id_usuario is null or id_usuario = ?) limit 1",
                    UUID.class,
                    authUser.email().trim(),
                    usuarioUuid);
            if (!byEmail.isEmpty()) {
                UUID existingClienteId = byEmail.get(0);
                jdbc.update(
                        "update cliente set id_usuario = ?, fecmod = now(), usmod = 'API', pcmod = 'SPRING' where id_cliente = ? and id_usuario is null",
                        usuarioUuid,
                        existingClienteId);
                return existingClienteId;
            }
        }

        List<UUID> bySameUuid = jdbc.queryForList(
                "select id_cliente from cliente where id_cliente = ? limit 1",
                UUID.class,
                usuarioUuid);
        if (!bySameUuid.isEmpty()) {
            jdbc.update(
                    "update cliente set id_usuario = ?, estado = 'A', fecmod = now(), usmod = 'API', pcmod = 'SPRING' where id_cliente = ?",
                    usuarioUuid,
                    usuarioUuid);
            return usuarioUuid;
        }

        String rawNombre = authUser.nombre() == null || authUser.nombre().isBlank()
                ? "Jugador Canchero"
                : authUser.nombre().trim();
        String[] parts = rawNombre.split("\\s+", 2);
        String nombres = parts[0];
        String apellidos = parts.length > 1 && !parts[1].isBlank() ? parts[1] : "-";
        String docNum = "USR-" + usuarioUuid.toString().replace("-", "").substring(0, 8).toUpperCase(Locale.ROOT);

        jdbc.update("""
                insert into cliente (id_cliente, id_usuario, tipo_documento, numero_documento,
                                     nombres, apellidos, telefono, correo, estado, usucre, pccre)
                values (?, ?, 'DNI', ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                """,
                usuarioUuid,
                usuarioUuid,
                docNum,
                nombres,
                apellidos,
                authUser.telefono() == null ? "" : authUser.telefono().trim(),
                authUser.email() == null ? "" : authUser.email().trim());
        return usuarioUuid;
    }

    private int courtTypeId(String tipo) {
        String normalized = normalize(tipo);
        String token = normalized.contains("11") ? "11"
                : normalized.contains("9") ? "9"
                : normalized.contains("8") ? "8"
                : normalized.contains("7") ? "7"
                : normalized.contains("6") ? "6"
                : normalized.contains("5") ? "5"
                : normalized.contains("playa") ? "playa"
                : normalized;
        return lookupCatalogId(
                "tipo_cancha",
                "id_tipo_cancha",
                token,
                "Fútbol 7",
                "No existe un tipo de cancha activo para registrar la cancha");
    }

    private int metodoPagoId(String metodo) {
        String normalized = normalize(metodo);
        String token = normalized.contains("efectivo") ? "efectivo"
                : normalized.contains("yape") ? "yape"
                : normalized.contains("plin") ? "plin"
                : normalized.contains("tarj") || normalized.contains("pos") ? "tarjeta"
                : normalized;
        return lookupCatalogId(
                "metodo_pago",
                "id_metodo_pago",
                token,
                "Yape",
                "No existe un método de pago activo para registrar el pago");
    }

    private int reservationStatusId(String keyword) {
        String normalized = normalize(keyword);
        List<String> tokens = normalized.contains("confirm") || normalized.contains("aprob")
                ? List.of("confirm", "aprob")
                : normalized.contains("cancel")
                ? List.of("cancel")
                : normalized.contains("complet") || normalized.contains("final") || normalized.contains("jug")
                ? List.of("complet", "final", "jug")
                : List.of("pend");

        for (String token : tokens) {
            List<Integer> ids = jdbc.queryForList("""
                            select id_estado_reserva
                            from estado_reserva
                            where estado = 'A' and lower(nombre) like ?
                            order by id_estado_reserva
                            limit 1
                            """,
                    Integer.class,
                    "%" + token + "%");
            if (!ids.isEmpty()) {
                return ids.get(0);
            }
        }

        throw new ResponseStatusException(HttpStatus.CONFLICT, "No existe un estado de reserva activo para " + keyword);
    }

    private boolean matchesLocation(VenueResponse venue, String ciudad, String distrito) {
        boolean cityOk = ciudad == null || ciudad.isBlank() || normalize(venue.ciudad()).equals(normalize(ciudad));
        boolean districtOk = distrito == null || distrito.isBlank() || normalize(venue.distrito()).equals(normalize(distrito));
        return cityOk && districtOk;
    }

    private String ciudad(int distritoId) {
        return jdbc.query("""
                        select p.nombre
                        from distrito d
                        join provincia p on p.id_provincia = d.id_provincia
                        where d.id_distrito = ?
                        limit 1
                        """,
                (rs, rowNum) -> rs.getString("nombre"),
                distritoId).stream().findFirst().orElse("");
    }

    private String distrito(int distritoId) {
        return jdbc.query("select nombre from distrito where id_distrito = ? limit 1",
                (rs, rowNum) -> rs.getString("nombre"),
                distritoId).stream().findFirst().orElse("");
    }

    private int lookupCatalogId(String table, String idColumn, String requested, String fallbackName, String errorMessage) {
        String needle = normalize(requested);
        List<Integer> exact = jdbc.queryForList("""
                        select %s
                        from %s
                        where estado = 'A' and lower(nombre) = ?
                        limit 1
                        """.formatted(idColumn, table),
                Integer.class,
                needle);
        if (!exact.isEmpty()) {
            return exact.get(0);
        }

        if (!needle.isBlank()) {
            List<Integer> partial = jdbc.queryForList("""
                            select %s
                            from %s
                            where estado = 'A' and lower(nombre) like ?
                            order by %s
                            limit 1
                            """.formatted(idColumn, table, idColumn),
                    Integer.class,
                    "%" + needle + "%");
            if (!partial.isEmpty()) {
                return partial.get(0);
            }
        }

        List<Integer> fallback = jdbc.queryForList("""
                        select %s
                        from %s
                        where estado = 'A' and lower(nombre) = lower(?)
                        limit 1
                        """.formatted(idColumn, table),
                Integer.class,
                fallbackName);
        if (!fallback.isEmpty()) {
            return fallback.get(0);
        }

        List<Integer> firstActive = jdbc.queryForList("""
                        select %s
                        from %s
                        where estado = 'A'
                        order by %s
                        limit 1
                        """.formatted(idColumn, table, idColumn),
                Integer.class);
        if (!firstActive.isEmpty()) {
            return firstActive.get(0);
        }

        throw new ResponseStatusException(HttpStatus.CONFLICT, errorMessage);
    }

    private int roleId(String rawRole) {
        String normalized = normalize(rawRole);
        if (normalized.isEmpty()) {
            normalized = "cliente";
        }

        List<String> candidates;
        if (PUBLIC_PLAYER_ROLES.contains(normalized)) {
            candidates = List.of("cliente", "jugador", "player");
        } else if (PUBLIC_OWNER_ROLES.contains(normalized)) {
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

    private String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fecha de reserva es obligatoria");
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fecha debe tener formato YYYY-MM-DD");
        }
    }

    private String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    private Double nullableDouble(ResultSet rs, String column) throws java.sql.SQLException {
        double value = rs.getDouble(column);
        return rs.wasNull() ? null : value;
    }

    private Double nullableBigDecimal(ResultSet rs, String column) throws java.sql.SQLException {
        BigDecimal value = rs.getBigDecimal(column);
        return value == null ? null : value.doubleValue();
    }

    private String formatTime(Time time) {
        return time == null ? "" : time.toLocalTime().format(TIME_FORMAT);
    }

    private String stringDateTime(ResultSet rs, String column) throws java.sql.SQLException {
        Object value = rs.getObject(column);
        return value == null ? null : value.toString();
    }

    private LocalDateTime toLocalDateTime(ResultSet rs, String column) throws java.sql.SQLException {
        Object value = rs.getObject(column);
        if (value == null) return null;
        if (value instanceof LocalDateTime localDateTime) return localDateTime;
        return parseLocalDateTime(value.toString());
    }

    private LocalDateTime parseLocalDateTime(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (normalized.endsWith("Z")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        int zoneIndex = Math.max(normalized.lastIndexOf('+'), normalized.lastIndexOf('-'));
        if (zoneIndex > 10) {
            normalized = normalized.substring(0, zoneIndex);
        }
        if (normalized.length() > 19) {
            normalized = normalized.substring(0, 19);
        }
        return LocalDateTime.parse(normalized.replace(' ', 'T'));
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

    private double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, java.math.RoundingMode.HALF_UP).doubleValue();
    }

    private Array textArray(Connection connection, List<String> values) throws java.sql.SQLException {
        return connection.createArrayOf("text", values == null ? new String[0] : values.toArray(String[]::new));
    }

    private record TimeRange(LocalTime start, LocalTime end) {
        static TimeRange from(String raw) {
            if (raw == null || raw.isBlank()) return new TimeRange(LocalTime.of(20, 0), LocalTime.of(21, 0));
            String[] parts = raw.split("-");
            LocalTime start = LocalTime.parse(parts[0].trim());
            LocalTime end = parts.length > 1 ? LocalTime.parse(parts[1].trim()) : start.plusHours(1);
            return new TimeRange(start, end);
        }
    }

    public Optional<AuthResponse> login(LoginRequest request) {
        String email = request.email().trim().toLowerCase();
        return jdbc.query("""
                        select u.id_usuario, u.nombre, u.correo as email, u.telefono, u.password_hash, r.nombre as rol
                        from usuario u
                        join rol r on r.id_rol = u.id_rol
                        where lower(u.correo) = ? and u.estado = 'A' and r.estado = 'A'
                        """,
                (rs, rowNum) -> {
                    if (!PasswordUtil.matches(request.password(), rs.getString("password_hash"))) {
                        return null;
                    }
                    UUID userId = rs.getObject("id_usuario", UUID.class);
                    return new AuthResponse(
                            authTokenService.issue(userId, request.rememberMe()),
                            new AuthUserDto(
                                    userId.toString(),
                                    rs.getString("nombre"),
                                    rs.getString("email"),
                                    rs.getString("telefono"),
                                    rs.getString("rol")));
                },
                email).stream().filter(r -> r != null).findFirst();
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
        if (request.password() == null || request.password().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña es obligatoria");
        }
        if (request.password().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña debe contener al menos 8 caracteres");
        }
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La contraseña no debe exceder 72 bytes");
        }

        Integer exists = jdbc.queryForObject("select count(*) from usuario where lower(correo) = ?", Integer.class, email);
        if (exists != null && exists > 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El email ya está registrado");
        }
        Integer rolId = roleId(request.rol());
        UUID userId = UUID.randomUUID();
        jdbc.update("""
                insert into usuario (id_usuario, id_rol, nombre, correo, telefono, password_hash, estado, usucre, pccre)
                values (?, ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                """,
                userId, rolId, request.nombre().trim(), email,
                request.telefono() == null ? "" : request.telefono().trim(),
                PasswordUtil.hash(request.password()));
        return login(new LoginRequest(email, request.password()));
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

    public List<ReviewResponse> listReviewsBySede(int sedeId) {
        try {
            return jdbc.query("""
                            select res.id_resena, res.id_sede,
                                   coalesce(trim(coalesce(c.nombres, '') || ' ' || coalesce(c.apellidos, '')), 'Cliente') as cliente_nombre,
                                   res.puntuacion, res.comentario, res.fecha_creacion
                            from resena res
                            join cliente c on c.id_cliente = res.id_cliente
                            where res.id_sede = ? and res.estado = 'A'
                            order by res.fecha_creacion desc
                            """,
                    (rs, rowNum) -> new ReviewResponse(
                            String.valueOf(rs.getInt("id_resena")),
                            String.valueOf(rs.getInt("id_sede")),
                            rs.getString("cliente_nombre"),
                            rs.getInt("puntuacion"),
                            rs.getString("comentario"),
                            rs.getObject("fecha_creacion", LocalDateTime.class) != null
                                    ? rs.getObject("fecha_creacion", LocalDateTime.class).toString()
                                    : null),
                    sedeId);
        } catch (Exception e) {
            return List.of();
        }
    }

    public Optional<ReviewResponse> createReview(ReviewRequest request) {
        return createReview(request, null);
    }

    @Transactional
    public Optional<ReviewResponse> createReview(ReviewRequest request, AuthUserDto authUser) {
        if (authUser == null || authUser.id() == null || authUser.id().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para publicar una reseña");
        }
        UUID authUuid;
        try {
            authUuid = UUID.fromString(authUser.id().trim());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión de usuario inválida");
        }

        if (request == null || request.reservaId() == null || request.reservaId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una reserva completada");
        }
        Integer sedeExists = jdbc.queryForObject("select count(*) from sede where id_sede = ? and estado = 'A'", Integer.class, request.sedeId());
        if (sedeExists == null || sedeExists == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sede no existe");
        }

        if (request.puntuacion() < 1 || request.puntuacion() > 5) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Puntuación válida de 1 a 5");
        }

        if (request.comentario() == null || request.comentario().trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El comentario es obligatorio");
        }
        if (request.comentario().trim().length() > 2000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El comentario no puede exceder 2000 caracteres");
        }

        UUID clienteId;
        Integer finalReservaId;
        {
            int parsedReservaId;
            try {
                parsedReservaId = Integer.parseInt(request.reservaId().trim());
            } catch (NumberFormatException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "reservaId inválido");
            }

            List<Map<String, Object>> reservaList = jdbc.queryForList("""
                    select r.id_reserva, r.id_cliente, r.id_usuario, cl.id_usuario as cliente_usuario_id,
                           c.id_sede, er.nombre as estado_nombre
                    from reserva r
                    join cancha c on c.id_cancha = r.id_cancha
                    join cliente cl on cl.id_cliente = r.id_cliente and cl.estado = 'A'
                    join estado_reserva er on er.id_estado_reserva = r.id_estado_reserva
                    where r.id_reserva = ? and r.estado = 'A'
                    """, parsedReservaId);

            if (reservaList.isEmpty()) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada");
            }

            Map<String, Object> r = reservaList.get(0);
            int resSedeId = ((Number) r.get("id_sede")).intValue();
            if (resSedeId != request.sedeId()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La reserva no corresponde a esta sede");
            }

            UUID resUsuarioId = (UUID) r.get("id_usuario");
            UUID resClienteId = (UUID) r.get("id_cliente");
            UUID clienteUsuarioId = (UUID) r.get("cliente_usuario_id");
            boolean isTitular = (resUsuarioId != null && resUsuarioId.equals(authUuid))
                    || (clienteUsuarioId != null && clienteUsuarioId.equals(authUuid));
            if (!isTitular) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No puedes calificar una reserva ajena");
            }

            String estadoNombre = (String) r.get("estado_nombre");
            String lowerEstado = estadoNombre == null ? "" : estadoNombre.toLowerCase(Locale.ROOT);
            if (!"completada".equals(lowerEstado.trim())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Solo reservas finalizadas pueden calificarse");
            }

            Integer reviewExists = jdbc.queryForObject(
                    "select count(*) from resena where id_reserva = ?",
                    Integer.class, parsedReservaId);
            if (reviewExists != null && reviewExists > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya calificaste esta reserva");
            }

            finalReservaId = parsedReservaId;
            clienteId = resClienteId;
        }

        final Integer insertReservaId = finalReservaId;
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into resena (id_sede, id_cliente, id_reserva, puntuacion, comentario, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, request.sedeId());
            ps.setObject(2, clienteId);
            ps.setObject(3, insertReservaId);
            ps.setInt(4, request.puntuacion());
            ps.setString(5, request.comentario().trim());
            return ps;
        }, keyHolder);

        Number id = null;
        if (keyHolder.getKeys() != null) {
            id = (Number) keyHolder.getKeys().get("id_resena");
            if (id == null) {
                id = (Number) keyHolder.getKeys().get("ID_RESENA");
            }
        }
        if (id == null && keyHolder.getKey() != null) {
            id = keyHolder.getKey();
        }

        final String resenaIdStr = id != null ? String.valueOf(id.intValue()) : null;
        return listReviewsBySede(request.sedeId()).stream()
                .filter(rev -> resenaIdStr == null || rev.id().equals(resenaIdStr))
                .findFirst();
    }

    private String extractFirstName(String fullName) {
        if (fullName == null || fullName.isBlank()) return "Jugador";
        String[] parts = fullName.trim().split("\\s+");
        return parts[0];
    }

    public List<PagoReservaResponse> listPagosByReserva(int reservaId) {
        return jdbc.query("""
                        select pr.id_pago_reserva, pr.id_reserva, mp.nombre as metodo_pago, pr.monto,
                               pr.fecha_pago, pr.numero_operacion, pr.es_adelanto,
                               pr.comision_plataforma, pr.monto_neto_dueno, pr.estado_liquidacion
                        from pago_reserva pr
                        join metodo_pago mp on mp.id_metodo_pago = pr.id_metodo_pago
                        where pr.id_reserva = ? and pr.estado = 'A'
                        order by pr.fecha_pago desc
                        """,
                (rs, rowNum) -> new PagoReservaResponse(
                        String.valueOf(rs.getInt("id_pago_reserva")),
                        String.valueOf(rs.getInt("id_reserva")),
                        rs.getString("metodo_pago"),
                        rs.getBigDecimal("monto"),
                        rs.getObject("fecha_pago", LocalDateTime.class),
                        rs.getString("numero_operacion"),
                        rs.getBoolean("es_adelanto"),
                        rs.getBigDecimal("comision_plataforma"),
                        rs.getBigDecimal("monto_neto_dueno"),
                        rs.getString("estado_liquidacion")),
                reservaId);
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

    public List<VentaResponse> listVentas(String sesionCajaId) {
        if (sesionCajaId != null && !sesionCajaId.isBlank()) {
            return listVentasBySession(Integer.parseInt(sesionCajaId));
        }
        return listSales().stream().map(this::toVentaResponse).toList();
    }

    public List<VentaResponse> listVentasBySession(int sesionId) {
        List<Integer> venueIds = jdbc.queryForList("""
                select c.id_sede
                from sesion_caja sc
                join caja c on c.id_caja = sc.id_caja
                where sc.id_sesion_caja = ?
                """, Integer.class, sesionId);
        if (venueIds.isEmpty()) return List.of();
        return listSales(venueIds.get(0)).stream()
                .filter(v -> v.cajaId() != null && v.cajaId() == sesionId)
                .map(this::toVentaResponse)
                .toList();
    }

    public List<VentaResponse> listVentasForVenue(int sedeId) {
        return listSales(sedeId).stream()
                .map(this::toVentaResponse)
                .toList();
    }

    public List<VentaResponse> listVentasForOwner(String ownerId) {
        UUID ownerUuid = resolveOperationalUserId(ownerId);
        return jdbc.query("""
                select v.id_venta, v.id_sede, v.fecha_venta, v.id_sesion_caja,
                       v.cajero_nombre, v.tipo_comprobante, v.numero_comprobante,
                       v.subtotal, v.igv, v.total, v.estado
                from (
                    select v.id_venta,
                           coalesce(c.id_sede, (
                               select k.id_sede
                               from venta_detalle vd
                               join kardex k on k.id_producto = vd.id_producto
                               where vd.id_venta = v.id_venta
                                 and k.estado = 'A'
                                 and k.motivo like ('Venta POS #' || v.id_venta || '%')
                               order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                               limit 1
                           )) as id_sede,
                           coalesce(v.fecha_venta, v.feccre) as fecha_venta,
                           v.id_sesion_caja,
                           coalesce(u.nombre, 'Cajero') as cajero_nombre,
                           v.tipo_comprobante,
                           v.numero_comprobante,
                           v.subtotal,
                           v.igv,
                           v.total,
                           v.estado
                    from venta v
                    left join usuario u on u.id_usuario = v.id_usuario
                    left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                    left join caja c on c.id_caja = sc.id_caja
                ) v
                join sede s on s.id_sede = v.id_sede
                where v.estado = 'A' and s.id_dueno = ?
                order by v.fecha_venta desc, v.id_venta desc
                """, (rs, rowNum) -> mapSale(rs, saleItems(rs.getInt("id_venta"))), ownerUuid).stream()
                .map(this::toVentaResponse)
                .toList();
    }

    public Optional<VentaResponse> getVenta(int id) {
        List<Integer> venueIds = jdbc.queryForList("""
                select coalesce(c.id_sede, (
                    select k.id_sede
                    from venta_detalle vd
                    join kardex k on k.id_producto = vd.id_producto
                    where vd.id_venta = v.id_venta
                      and k.estado = 'A'
                      and k.motivo like ('Venta POS #' || v.id_venta || '%')
                    order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                    limit 1
                )) as id_sede
                from venta v
                left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                left join caja c on c.id_caja = sc.id_caja
                where v.id_venta = ?
                """, Integer.class, id);
        if (venueIds.isEmpty() || venueIds.get(0) == null) return Optional.empty();
        return getSale(id, venueIds.get(0)).map(this::toVentaResponse);
    }

    public VentaResponse createVenta(VentaRequest request) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Se requiere un turno de caja abierto para registrar ventas");
    }

    @Transactional
    public VentaResponse createVenta(VentaRequest request, int sedeId, AuthUserDto user) {
        List<SaleItemDto> items = request.detalles() == null ? List.of() : request.detalles().stream()
                .map(d -> new SaleItemDto(
                        Integer.parseInt(d.productoId()),
                        "",
                        d.cantidad(),
                        d.precioUnitario() == null ? 0 : d.precioUnitario().doubleValue(),
                        d.precioUnitario() == null ? 0 : d.precioUnitario().multiply(BigDecimal.valueOf(d.cantidad())).doubleValue()))
                .toList();
        SaleDto sale = processSale(new ProcessSaleRequest(
                "boleta",
                fallback(request.metodoPago(), "efectivo"),
                user != null ? user.nombre() : "Cajero",
                null,
                null,
                null,
                request.sesionCajaId() == null || request.sesionCajaId().isBlank() ? null : Integer.parseInt(request.sesionCajaId()),
                sedeId,
                user != null ? user.id() : null,
                items));
        return toVentaResponse(sale);
    }

    public List<ProductoResponse> listProductos(String estado) {
        return listProductos(estado, null);
    }

    public List<ProductoResponse> listProductos(String estado, Integer sedeId) {
        return listProducts(sedeId).stream()
                .map(p -> new ProductoResponse(
                        String.valueOf(p.id()),
                        p.nombre(),
                        null,
                        p.categoriaNombre(),
                        BigDecimal.valueOf(p.precioVenta()),
                        BigDecimal.valueOf(p.precioCompra()),
                        p.stock(),
                        p.stockMinimo(),
                        "unidad",
                        "A"))
                .filter(p -> estado == null || estado.isBlank() || p.estado().equalsIgnoreCase(estado))
                .toList();
    }

    public Optional<ProductoResponse> getProducto(int id) {
        return listProductos(null).stream()
                .filter(p -> p.id().equals(String.valueOf(id)))
                .findFirst();
    }

    public ProductoResponse createProducto(ProductoRequest request) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into producto (id_categoria, codigo_barras, nombre, precio_compra,
                                          precio_venta, stock_minimo, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, categoryId(request.categoria()));
            ps.setString(2, null);
            ps.setString(3, request.nombre());
            ps.setBigDecimal(4, request.precioCompra() == null ? BigDecimal.ZERO : request.precioCompra());
            ps.setBigDecimal(5, request.precioVenta() == null ? BigDecimal.ZERO : request.precioVenta());
            ps.setInt(6, request.stockMinimo());
            return ps;
        }, keyHolder);
        Number id = (Number) keyHolder.getKeys().get("id_producto");
        if (request.stockActual() > 0) {
            insertKardex(
                    id.intValue(),
                    resolveOperationalVenueId(),
                    1,
                    request.stockActual(),
                    request.precioCompra() == null ? 0 : request.precioCompra().doubleValue(),
                    request.stockActual(),
                    "Stock inicial");
        }
        return getProducto(id.intValue()).orElseThrow();
    }

    public Optional<ProductoResponse> updateProducto(int id, ProductoRequest request) {
        int updated = jdbc.update("""
                update producto
                set id_categoria = ?, nombre = ?, precio_venta = ?, precio_compra = ?,
                    stock_minimo = ?, fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                where id_producto = ?
                """,
                categoryId(request.categoria()), request.nombre(), request.precioVenta(),
                request.precioCompra(), request.stockMinimo(), id);
        return updated == 0 ? Optional.empty() : getProducto(id);
    }

    private VentaResponse toVentaResponse(SaleDto sale) {
        int ventaId = Integer.parseInt(sale.id().replace("VNT-", ""));
        List<VentaDetalleResponse> detalles = sale.items().stream()
                .map(i -> new VentaDetalleResponse(
                        "",
                        String.valueOf(ventaId),
                        String.valueOf(i.productoId()),
                        i.nombre(),
                        i.cantidad(),
                        BigDecimal.valueOf(i.precioUnitario()),
                        BigDecimal.valueOf(i.subtotal())))
                .toList();
        return new VentaResponse(
                String.valueOf(ventaId),
                sale.cajaId() == null ? null : String.valueOf(sale.cajaId()),
                null,
                sale.metodoPago(),
                BigDecimal.valueOf(sale.subtotal()),
                BigDecimal.valueOf(sale.igv()),
                BigDecimal.valueOf(sale.total()),
                sale.estado(),
                parseLocalDateTime(sale.fecha()),
                detalles);
    }

    private int categoryId(String name) {
        String normalized = normalize(name);
        if (!normalized.isBlank()) {
            List<Integer> ids = jdbc.queryForList(
                    "select id_categoria from categoria_producto where lower(nombre) = ? and estado = 'A' limit 1",
                    Integer.class,
                    normalized);
            if (!ids.isEmpty()) return ids.get(0);
        }
        List<Integer> fallback = jdbc.queryForList(
                "select id_categoria from categoria_producto where estado = 'A' order by id_categoria limit 1",
                Integer.class);
        return fallback.isEmpty() ? 1 : fallback.get(0);
    }
}
