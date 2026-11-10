package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class CreditService extends JdbcSupport {
    private final JdbcTemplate jdbc;
    private final VenueAccessService access;
    private final CashService cashService;

    // Resilient memory store per venue (0 = default template seeds)
    private final Map<Integer, List<CreditAccountDto>> memoryAccounts = new ConcurrentHashMap<>();
    private final AtomicInteger nextAccountId = new AtomicInteger(100);
    private final AtomicInteger nextPaymentId = new AtomicInteger(1000);

    public CreditService(JdbcTemplate jdbc, VenueAccessService access, CashService cashService) {
        super(jdbc);
        this.jdbc = jdbc;
        this.access = access;
        this.cashService = cashService;
    }

    private List<CreditAccountDto> getVenueAccounts(int sedeId) {
        return memoryAccounts.computeIfAbsent(sedeId, id -> new ArrayList<>());
    }

    public boolean tablesExist() {
        try {
            Integer count = jdbc.queryForObject("""
                    select count(*) from information_schema.tables
                    where lower(table_schema) = 'public' and lower(table_name) in ('cuenta_por_cobrar', 'abono_credito')
                    """, Integer.class);
            return count != null && count >= 2;
        } catch (Exception e) {
            return false;
        }
    }

    public List<CreditAccountDto> listCredits(Integer sedeId, AuthUserDto user, String estadoFilter) {
        int venue = access.requirePermission(sedeId, user, "caja.operar");
        List<CreditAccountDto> accounts = getVenueAccounts(venue);
        LocalDate today = LocalDate.now();

        // Update overdue status dynamically
        List<CreditAccountDto> updated = new ArrayList<>();
        for (CreditAccountDto acc : accounts) {
            String currentStatus = acc.estado();
            if ("PENDIENTE".equals(currentStatus) && acc.saldo() > 0 && acc.fechaVencimiento() != null) {
                try {
                    LocalDate dueDate = LocalDate.parse(acc.fechaVencimiento());
                    if (dueDate.isBefore(today)) {
                        currentStatus = "VENCIDA";
                    }
                } catch (Exception ignored) {
                }
            }
            CreditAccountDto refreshed = new CreditAccountDto(
                    acc.id(), acc.sedeId(), acc.clienteNombre(), acc.clienteDocumento(),
                    acc.telefono(), acc.equipo(), acc.montoOriginal(), acc.saldo(),
                    acc.totalAbonado(), acc.concepto(), acc.fechaEmision(), acc.fechaVencimiento(),
                    currentStatus, acc.abonos()
            );
            updated.add(refreshed);
        }
        memoryAccounts.put(venue, updated);

        if (estadoFilter == null || estadoFilter.isBlank() || "TODOS".equalsIgnoreCase(estadoFilter)) {
            return updated;
        }
        return updated.stream()
                .filter(a -> a.estado().equalsIgnoreCase(estadoFilter))
                .toList();
    }

    public CreditAccountDto getCredit(int id, Integer sedeId, AuthUserDto user) {
        int venue = access.requirePermission(sedeId, user, "caja.operar");
        return getVenueAccounts(venue).stream()
                .filter(a -> a.id() == id)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cuenta por cobrar no encontrada"));
    }

    @Transactional
    public CreditAccountDto createCredit(CreditAccountRequest request, AuthUserDto user) {
        if (request.clienteNombre() == null || request.clienteNombre().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre del cliente o equipo es obligatorio");
        }
        if (request.montoOriginal() == null || request.montoOriginal() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto de la deuda debe ser mayor a 0");
        }
        int venue = access.requirePermission(request.sedeId(), user, "caja.operar");
        double original = round2(request.montoOriginal());
        String dueDate = request.fechaVencimiento() != null && !request.fechaVencimiento().isBlank()
                ? request.fechaVencimiento()
                : LocalDate.now().plusDays(7).toString();

        CreditAccountDto created = new CreditAccountDto(
                nextAccountId.incrementAndGet(),
                venue,
                request.clienteNombre().trim(),
                request.clienteDocumento() != null ? request.clienteDocumento().trim() : "",
                request.telefono() != null ? request.telefono().trim() : "",
                request.equipo() != null ? request.equipo().trim() : "",
                original,
                original,
                0.0,
                fallback(request.concepto(), "Consumo a cuenta / Fiado"),
                LocalDateTime.now().toString(),
                dueDate,
                "PENDIENTE",
                new ArrayList<>()
        );

        List<CreditAccountDto> list = getVenueAccounts(venue);
        list.add(0, created);
        return created;
    }

    @Transactional
    public CreditAccountDto registerPayment(int accountId, CreditPaymentRequest request, AuthUserDto user) {
        if (request.monto() == null || request.monto() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto a abonar debe ser mayor a 0");
        }
        List<CreditAccountDto> list = memoryAccounts.values().stream()
                .filter(l -> l.stream().anyMatch(a -> a.id() == accountId))
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cuenta por cobrar no encontrada"));

        CreditAccountDto current = list.stream().filter(a -> a.id() == accountId).findFirst().orElseThrow();
        int venue = access.requirePermission(current.sedeId(), user, "caja.operar");

        double abonoMonto = round2(request.monto());
        if (abonoMonto > current.saldo() + 0.01) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "El monto del abono (S/ " + abonoMonto + ") excede el saldo restante (S/ " + current.saldo() + ")");
        }

        double nuevoSaldo = round2(Math.max(0, current.saldo() - abonoMonto));
        double nuevoTotalAbonado = round2(current.totalAbonado() + abonoMonto);
        String nuevoEstado = nuevoSaldo <= 0.001 ? "CANCELADA" : current.estado();

        String cashier = user != null ? user.nombre() : "Cajero";
        String method = fallback(request.medioPago(), "efectivo").toLowerCase(Locale.ROOT);

        CreditPaymentDto payment = new CreditPaymentDto(
                nextPaymentId.incrementAndGet(),
                accountId,
                request.sesionCajaId(),
                LocalDateTime.now().toString(),
                abonoMonto,
                method,
                request.nroOperacion(),
                request.observacion(),
                cashier
        );

        // If paid in cash and session is active, integrate into cash shift so drawer balances
        if ("efectivo".equalsIgnoreCase(method) && request.sesionCajaId() != null && request.sesionCajaId() > 0) {
            try {
                cashService.createMovimientoCaja(new MovimientoCajaRequest(
                        String.valueOf(request.sesionCajaId()),
                        "ingreso",
                        "Abono a Crédito #" + accountId + " (" + current.clienteNombre() + ")",
                        BigDecimal.valueOf(abonoMonto),
                        "efectivo",
                        request.nroOperacion()
                ));
            } catch (Exception ignored) {
                // Cash shift integration graceful fallback
            }
        }

        List<CreditPaymentDto> updatedPayments = new ArrayList<>(current.abonos());
        updatedPayments.add(0, payment);

        CreditAccountDto updated = new CreditAccountDto(
                current.id(), current.sedeId(), current.clienteNombre(), current.clienteDocumento(),
                current.telefono(), current.equipo(), current.montoOriginal(), nuevoSaldo,
                nuevoTotalAbonado, current.concepto(), current.fechaEmision(), current.fechaVencimiento(),
                nuevoEstado, updatedPayments
        );

        list.removeIf(a -> a.id() == accountId);
        list.add(0, updated);
        return updated;
    }

    public CreditSummaryDto getSummary(Integer sedeId, AuthUserDto user) {
        int venue = access.requirePermission(sedeId, user, "caja.operar");
        List<CreditAccountDto> accounts = listCredits(venue, user, null);

        double totalPorCobrar = 0.0;
        double totalVencido = 0.0;
        double totalCobradoMes = 0.0;
        int clientesDeudores = 0;
        int cuentasVencidas = 0;

        LocalDate now = LocalDate.now();
        String currentMonthPrefix = now.format(DateTimeFormatter.ofPattern("yyyy-MM"));

        for (CreditAccountDto acc : accounts) {
            if (acc.saldo() > 0) {
                totalPorCobrar += acc.saldo();
                clientesDeudores++;
            }
            if ("VENCIDA".equalsIgnoreCase(acc.estado()) && acc.saldo() > 0) {
                totalVencido += acc.saldo();
                cuentasVencidas++;
            }
            for (CreditPaymentDto p : acc.abonos()) {
                if (p.fecha() != null && p.fecha().startsWith(currentMonthPrefix)) {
                    totalCobradoMes += p.monto();
                }
            }
        }

        return new CreditSummaryDto(
                round2(totalPorCobrar),
                round2(totalVencido),
                round2(totalCobradoMes),
                clientesDeudores,
                cuentasVencidas
        );
    }
}
