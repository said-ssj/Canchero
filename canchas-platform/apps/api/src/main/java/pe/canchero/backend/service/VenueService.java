package pe.canchero.backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.CourtAvailabilityResponse;
import pe.canchero.backend.web.dto.CourtDto;
import pe.canchero.backend.web.dto.CourtRequest;
import pe.canchero.backend.web.dto.QuoteRequest;
import pe.canchero.backend.web.dto.QuoteResponse;
import pe.canchero.backend.web.dto.VenueRequest;
import pe.canchero.backend.web.dto.VenueResponse;
import java.math.BigDecimal;
import java.sql.Array;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Sedes y canchas: catálogo, alta/edición, tarifas, disponibilidad y cotización. */
@Service
public class VenueService extends JdbcSupport {

    public VenueService(JdbcTemplate jdbc) {
        super(jdbc);
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

    public VenueResponse createVenue(VenueRequest request, UUID ownerId) {
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
            String cobertura = rs.wasNull() ? "" : techada ? "Techada" : "Al Aire Libre";
            BigDecimal price = rs.getBigDecimal("precio_hora");
            BigDecimal nightPrice = rs.getBigDecimal("precio_hora_noche");
            Time nightStart = rs.getTime("hora_inicio_noche");
            double dayRate = price == null ? 80 : price.doubleValue();
            double nightRate = nightPrice == null ? dayRate : nightPrice.doubleValue();
            String nightHourStr = nightStart == null ? "18:00" : formatTime(nightStart);
            Array equipment = rs.getArray("equipamiento");
            List<String> features = List.of();
            if (equipment != null) {
                try {
                    features = java.util.Arrays.stream((Object[]) equipment.getArray())
                            .filter(java.util.Objects::nonNull).map(Object::toString).toList();
                } finally {
                    equipment.free();
                }
            }
            return new CourtDto(
                    String.valueOf(rs.getInt("id_cancha")),
                    rs.getString("nombre_numero"),
                    tipo == null ? "" : tipo,
                    tipo == null ? "" : tipo,
                    superficie == null ? "" : superficie,
                    cobertura,
                    techada,
                    "A".equals(rs.getString("estado")),
                    dayRate,
                    nightRate,
                    nightHourStr,
                    rs.getString("foto_url"), rs.getInt("id_sede"), features);
        };
    }

    private String courtsSql(String whereClause) {
        return """
                select c.id_cancha, c.id_sede, c.nombre_numero, c.techada, c.foto_url, c.superficie, c.estado,
                       tc.nombre as tipo, c.equipamiento,
                       coalesce(min(case when t.hora_inicio < time '18:00:00' then t.precio end), min(t.precio), 80) as precio_hora,
                       coalesce(max(case when t.hora_inicio >= time '18:00:00' or t.hora_fin > time '18:00:00' then t.precio end), max(t.precio), 80) as precio_hora_noche,
                       min(case when t.hora_inicio >= time '17:00:00' and t.hora_inicio < time '23:00:00' then t.hora_inicio end) as hora_inicio_noche
                from cancha c
                left join tipo_cancha tc on tc.id_tipo_cancha = c.id_tipo_cancha
                left join tarifa_cancha t on t.id_cancha = c.id_cancha and t.estado = 'A'
                """ + whereClause + """
                group by c.id_cancha, c.id_sede, c.nombre_numero, c.techada, c.foto_url, c.superficie, c.estado, tc.nombre, c.equipamiento
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

    private Double nullableDouble(ResultSet rs, String column) throws java.sql.SQLException {
        double value = rs.getDouble(column);
        return rs.wasNull() ? null : value;
    }

    private Array textArray(Connection connection, List<String> values) throws java.sql.SQLException {
        return connection.createArrayOf("text", values == null ? new String[0] : values.toArray(String[]::new));
    }
}
