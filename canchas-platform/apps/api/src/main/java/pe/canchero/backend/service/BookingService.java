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

/** Reservas: alta con bloqueo e idempotencia, estados, reprogramación, pase, pagos y reseñas. */
@Service
public class BookingService extends JdbcSupport {

    private final VenueService venues;
    private final Clock clock;
    private final Map<Integer, ReentrantLock> courtLocks = new ConcurrentHashMap<>();

    @Autowired
    public BookingService(JdbcTemplate jdbc, VenueService venues) {
        this(jdbc, venues, Clock.system(LIMA_ZONE));
    }

    public BookingService(JdbcTemplate jdbc, VenueService venues, Clock clock) {
        super(jdbc);
        this.venues = venues;
        this.clock = clock == null ? Clock.system(LIMA_ZONE) : clock;
    }


    @Transactional
    public BookingResponse createBooking(BookingRequest request, AuthUserDto authUser, String idempotencyKeyHeader) {
        return createBookingInternal(request,authUser,idempotencyKeyHeader,false);
    }

    @Transactional
    public BookingResponse createCounterBooking(BookingRequest request,AuthUserDto user,String key) {
        int court;
        try { court=Integer.parseInt(request.courtId()); }
        catch(RuntimeException ex){throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Cancha invalida");}
        var ids=jdbc.queryForList("select id_sede from cancha where id_cancha=?",Integer.class,court);
        if(ids.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Cancha no encontrada");
        if(!new TenantPermissions(jdbc).has(user,ids.getFirst(),"reserva.gestionar"))
            throw new ResponseStatusException(HttpStatus.GONE,"El pago online se inicia mediante Mercado Pago. Esta ruta es solo para registro presencial autorizado.");
        return createBooking(request,user,key);
    }

    @Transactional
    public BookingResponse createPendingPayment(BookingRequest request, AuthUserDto authUser) {
        return createBookingInternal(request,authUser,null,true);
    }

    private BookingResponse createBookingInternal(BookingRequest request, AuthUserDto authUser, String idempotencyKeyHeader, boolean pendingPayment) {

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
            QuoteResponse quote = venues.quoteCourtBooking(String.valueOf(courtId), new QuoteRequest(fecha.toString(), slotRange.hours()));
            if (!quote.valid()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, quote.errorMessage());
            }

            if (!pendingPayment && effectiveIdempotencyKey != null) {
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
            if (!pendingPayment && isPlayer && (normMetodo.contains("yape") || normMetodo.contains("plin") || normMetodo.contains("efectivo"))) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "En reservas online solo está habilitado el pago al 100% con tarjeta. Yape y Plin están deshabilitados online y efectivo es solo presencial.");
            }

            // Evaluación de simulación de pago con tarjeta (Fase 5)
            String outcome = request.paymentOutcome() != null ? request.paymentOutcome().trim().toLowerCase(Locale.ROOT) : "";
            String cardNum = request.cardNumber() != null ? request.cardNumber().replaceAll("\\s+", "") : "";

            if (!pendingPayment && ("timeout".equals(outcome) || cardNum.endsWith("9999"))) {
                throw new ResponseStatusException(
                        HttpStatus.GATEWAY_TIMEOUT,
                        "Tiempo de espera agotado al procesar el pago con tarjeta. No se realizó ningún cargo ni confirmación.");
            }
            if (!pendingPayment && ("rejected".equals(outcome) || cardNum.endsWith("0000"))) {
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
            int confirmedStatusId = reservationStatusId(pendingPayment ? "pend" : "confirm");
            String codigo = pendingPayment ? null : generateUniquePassCode();
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
                    ps.setBigDecimal(9, pendingPayment ? BigDecimal.ZERO : BigDecimal.valueOf(authoritativeTotal));
                    ps.setBigDecimal(10, pendingPayment ? BigDecimal.valueOf(authoritativeTotal) : BigDecimal.ZERO);
                    ps.setString(11, codigo);
                    return ps;
                }, keyHolder);
            } catch (org.springframework.dao.DataIntegrityViolationException ex) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Horario no disponible: conflicto de concurrencia detectado.", ex);
            }

            Number id = (Number) keyHolder.getKeys().get("id_reserva");
            int reservaId = id.intValue();

            if (!pendingPayment) createPayment(reservaId, authoritativeTotal, metodoPagoEfectivo, effectiveIdempotencyKey, "aprobado");
            return withQuoteDetails(
                    getBookingById(reservaId).orElseThrow(),
                    quote.tranches(),
                    effectiveIdempotencyKey);
        } finally {
            releaseCourtLockAfterTransaction(courtLock);
        }
    }

    /** No liberar el candado JVM antes del bloqueo SQL: una operacion puede crear varios bloques. */
    private void releaseCourtLockAfterTransaction(ReentrantLock lock) {
        if (org.springframework.transaction.support.TransactionSynchronizationManager.isActualTransactionActive()
                && org.springframework.transaction.support.TransactionSynchronizationManager.isSynchronizationActive()) {
            org.springframework.transaction.support.TransactionSynchronizationManager.registerSynchronization(
                new org.springframework.transaction.support.TransactionSynchronization() {
                    @Override public void afterCompletion(int status) { lock.unlock(); }
                });
        } else {
            lock.unlock();
        }
    }

    void applyVerifiedMercadoPago(int id, BigDecimal amount, String paymentId) {
        int status=reservationStatusId("confirm");
        jdbc.update("update reserva set id_estado_reserva=?,adelanto=?,saldo=0,codigo_pase=?,fecmod=now(),usmod='MERCADOPAGO',pcmod='API' where id_reserva=? and estado='A'",status,amount,"MP-"+id, id);
        jdbc.update("""
            insert into pago_reserva(id_reserva,id_metodo_pago,monto,fecha_pago,numero_operacion,
            es_adelanto,comision_plataforma,monto_neto_dueno,estado_liquidacion,estado,usucre,pccre)
            values(?,?,?,now(),?,false,0,?,'aprobado','A','MERCADOPAGO','API')
            """,id,metodoPagoId("Tarjeta"),amount,"MP:"+paymentId,amount);
    }

    public Optional<BookingResponse> confirmBooking(int id, AuthUserDto authUser) {
        if (jdbc.queryForObject("select count(*) from information_schema.tables where table_schema='public' and table_name='mp_checkout'",Integer.class)>0
            && jdbc.queryForObject("select count(*) from mp_checkout where id_reserva=?",Integer.class,id)>0)
            throw new ResponseStatusException(HttpStatus.CONFLICT,"La confirmacion requiere un pago verificado por Mercado Pago");
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

        requireBookingPermission(id, authUser, "reserva.gestionar");

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
                select r.id_usuario, r.id_cliente, s.id_dueno, s.id_sede, r.id_estado_reserva,
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
        boolean isAdmin = Roles.isSuperAdmin(rol);
        boolean isVenueOwner = new TenantPermissions(jdbc).has(authUser, ((Number) row.get("id_sede")).intValue(), "reserva.cancelar");
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

        requireBookingPermission(id, authUser, "reserva.gestionar");

        return updateBookingStatus(id, reservationStatusId("complet"));
    }

    @Transactional
    public Optional<BookingResponse> rescheduleBooking(int id, String rawFecha, String rawHorario, AuthUserDto authUser) {
        if (authUser == null || authUser.id() == null || authUser.id().isBlank()) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Debes iniciar sesión para reprogramar una reserva.");
        }
        List<Map<String, Object>> rows = jdbc.queryForList("""
                select r.id_cancha, s.id_dueno
                from reserva r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = c.id_sede
                where r.id_reserva = ? and r.estado = 'A'
                """, id);
        if (rows.isEmpty()) {
            return Optional.empty();
        }
        requireBookingPermission(id, authUser, "reserva.gestionar");

        int courtId = ((Number) rows.get(0).get("id_cancha")).intValue();
        LocalDate fecha = parseDate(rawFecha);
        NormalizedSlotRange slotRange = resolveAndValidateSlotRange(rawHorario, null);
        ReentrantLock courtLock = courtLocks.computeIfAbsent(courtId, k -> new ReentrantLock());
        courtLock.lock();
        try {
            LockedCourtInfo lockedCourt = lockAndValidateCourt(courtId);
            validateNotPastInLima(fecha, slotRange.startHour());
            validateWithinVenueOperatingHours(lockedCourt.sedeId(), fecha, slotRange);
            validateNoOverlappingReservationsOrMaintenance(courtId, fecha, slotRange, id);
            QuoteResponse quote = venues.quoteCourtBooking(String.valueOf(courtId), new QuoteRequest(fecha.toString(), slotRange.hours()));
            if (!quote.valid()) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, quote.errorMessage());
            }
            // El total sigue la tarifa del nuevo horario; lo ya pagado (adelanto) se respeta y el saldo es la diferencia.
            // Si el nuevo horario es más barato, el saldo queda en 0 y la devolución del exceso se hace en caja.
            jdbc.update("""
                    update reserva
                    set fecha_reserva = ?, hora_inicio = ?, hora_fin = ?,
                        monto_total = ?, saldo = greatest(? - coalesce(adelanto, 0), 0),
                        fecmod = now(), usmod = 'API', pcmod = 'SPRING'
                    where id_reserva = ? and estado = 'A'
                    """, fecha, slotRange.startTime(), slotRange.endTime(),
                    BigDecimal.valueOf(quote.total()), BigDecimal.valueOf(quote.total()), id);
            return getBookingById(id);
        } finally {
            releaseCourtLockAfterTransaction(courtLock);
        }
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
                where r.codigo_pase = ? and r.estado = 'A' and r.codigo_pase not like 'MP-%'
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
        TenantPermissions permissions = new TenantPermissions(jdbc);
        if (authUser == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        if (!Roles.isOwnerOrAdmin(authUser.rol()) && permissions.venues(authUser,"reserva.ver").isEmpty())
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"No tienes permiso para consultar el listado operativo de reservas.");
        String scope;
        if (venueId != null && !venueId.isBlank()) {
            int id;
            try { id = Integer.parseInt(venueId.trim()); }
            catch (NumberFormatException ex) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador de sede inválido."); }
            if (!permissions.has(authUser,id,"reserva.ver")) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"No tienes permiso para consultar reservas de esta sede.");
            scope = "s.id_sede=" + id;
        } else {
            scope = permissions.scope("s.id_sede", authUser, "reserva.ver");
        }
        return jdbc.query(bookingsSql() + " where " + scope + " order by r.fecha_reserva desc,r.hora_inicio desc", bookingRowMapper());
    }

    private void requireBookingPermission(int bookingId, AuthUserDto user, String permission) {
        var venues = jdbc.queryForList("select c.id_sede from reserva r join cancha c on c.id_cancha=r.id_cancha where r.id_reserva=?", Integer.class, bookingId);
        if (venues.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Reserva no encontrada");
        if (!new TenantPermissions(jdbc).has(user,venues.get(0),permission))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,"No tienes permiso para modificar reservas de otra sede.");
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
        boolean isAdmin = Roles.isSuperAdmin(rol);
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
        validateNoOverlappingReservationsOrMaintenance(courtId, fecha, slotRange, 0);
    }

    private void validateNoOverlappingReservationsOrMaintenance(int courtId, LocalDate fecha, NormalizedSlotRange slotRange,
            int excludedReservaId) {
        List<int[]> activeReservations = jdbc.query("""
                        select r.hora_inicio, r.hora_fin
                        from reserva r
                        join estado_reserva er on er.id_estado_reserva = r.id_estado_reserva
                        where r.id_cancha = ?
                          and r.fecha_reserva = ?
                          and r.estado = 'A'
                          and r.id_reserva <> ?
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
                fecha,
                excludedReservaId);

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

    private String bookingsSql() {
        String methodSql="(select mp.nombre from pago_reserva pr join metodo_pago mp on mp.id_metodo_pago = pr.id_metodo_pago where pr.id_reserva = r.id_reserva and pr.estado = 'A' order by pr.id_pago_reserva desc limit 1)";
        if (jdbc.queryForObject("select count(*) from information_schema.tables where table_schema='public' and table_name='mp_checkout'",Integer.class)>0)
            methodSql="coalesce((select 'Mercado Pago' from mp_checkout x where x.id_reserva=r.id_reserva limit 1),"+methodSql+")";
        return """
                select r.id_reserva, r.codigo_pase, r.id_cancha, r.fecha_reserva, r.hora_inicio, r.hora_fin,
                       r.monto_total, r.adelanto, r.saldo, er.nombre as estado_nombre,
                       c.nombre_numero as cancha_nombre, s.nombre as sede_nombre, s.id_sede,
                       (select pr.estado_liquidacion from pago_reserva pr where pr.id_reserva = r.id_reserva and pr.estado = 'A' order by pr.id_pago_reserva desc limit 1) as pago_estado,
                       (select pr.numero_operacion from pago_reserva pr where pr.id_reserva = r.id_reserva and pr.estado = 'A' order by pr.id_pago_reserva desc limit 1) as pago_num_op,
                       %s as metodo_pago_nombre
                from reserva r
                join cancha c on c.id_cancha = r.id_cancha
                join sede s on s.id_sede = c.id_sede
                left join estado_reserva er on er.id_estado_reserva = r.id_estado_reserva
                """.formatted(methodSql);
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

    private record TimeRange(LocalTime start, LocalTime end) {
        static TimeRange from(String raw) {
            if (raw == null || raw.isBlank()) return new TimeRange(LocalTime.of(20, 0), LocalTime.of(21, 0));
            String[] parts = raw.split("-");
            LocalTime start = LocalTime.parse(parts[0].trim());
            LocalTime end = parts.length > 1 ? LocalTime.parse(parts[1].trim()) : start.plusHours(1);
            return new TimeRange(start, end);
        }
    }

    public List<ReviewResponse> listReviewsBySede(int sedeId) {
        try {
            return jdbc.query("""
                            select res.id_resena, res.id_sede,
                                   coalesce(trim(coalesce(c.nombres, '') || ' ' || coalesce(c.apellidos, '')), 'Cliente') as cliente_nombre,
                                   res.puntuacion, res.comentario, res.fecha_creacion,
                                   ca.id_cancha, ca.nombre_numero as cancha_nombre
                            from resena res
                            join cliente c on c.id_cliente = res.id_cliente
                            left join reserva r on r.id_reserva = res.id_reserva
                            left join cancha ca on ca.id_cancha = r.id_cancha
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
                                    : null,
                            rs.getObject("id_cancha") != null ? rs.getInt("id_cancha") : null,
                            rs.getString("cancha_nombre")),
                    sedeId);
        } catch (Exception e) {
            return List.of();
        }
    }

    public List<ReviewResponse> listReviewsByCourt(int canchaId) {
        try {
            return jdbc.query("""
                            select res.id_resena, res.id_sede,
                                   coalesce(trim(coalesce(c.nombres, '') || ' ' || coalesce(c.apellidos, '')), 'Cliente') as cliente_nombre,
                                   res.puntuacion, res.comentario, res.fecha_creacion,
                                   ca.id_cancha, ca.nombre_numero as cancha_nombre
                            from resena res
                            join cliente c on c.id_cliente = res.id_cliente
                            join reserva r on r.id_reserva = res.id_reserva
                            join cancha ca on ca.id_cancha = r.id_cancha
                            where ca.id_cancha = ? and res.estado = 'A'
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
                                    : null,
                            rs.getInt("id_cancha"),
                            rs.getString("cancha_nombre")),
                    canchaId);
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

}
