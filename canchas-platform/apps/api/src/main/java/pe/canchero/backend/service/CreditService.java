package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.PreparedStatement;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

@Service
public class CreditService extends JdbcSupport {
    private final JdbcTemplate jdbc;
    private final VenueAccessService access;
    private final CashService cashService;

    public CreditService(JdbcTemplate jdbc, VenueAccessService access, CashService cashService) {
        super(jdbc);
        this.jdbc = jdbc;
        this.access = access;
        this.cashService = cashService;
    }

    public boolean tablesExist() {
        try {
            Integer count = jdbc.queryForObject("""
                    select count(*) from information_schema.tables
                    where lower(table_schema) = 'public'
                      and lower(table_name) in ('cuenta_por_cobrar', 'abono_credito')
                    """, Integer.class);
            return count != null && count == 2;
        } catch (Exception e) {
            return false;
        }
    }

    private void requireTables() {
        if (!tablesExist()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "El módulo de créditos requiere aplicar la migración de persistencia");
    }

    public List<CreditAccountDto> listCredits(Integer sedeId, AuthUserDto user, String estadoFilter) {
        requireTables();
        int venue = access.requirePermission(sedeId, user, "caja.operar");
        List<CreditAccountDto> accounts = jdbc.query("""
                select id_cuenta, id_sede, cliente_nombre, cliente_documento, telefono, equipo,
                       monto_original, saldo, total_abonado, concepto, fecha_emision,
                       fecha_vencimiento, estado
                from cuenta_por_cobrar where id_sede = ?
                order by fecha_emision desc, id_cuenta desc
                """, (rs, row) -> mapAccount(rs, true), venue);
        if (estadoFilter == null || estadoFilter.isBlank() || "TODOS".equalsIgnoreCase(estadoFilter)) return accounts;
        return accounts.stream().filter(a -> a.estado().equalsIgnoreCase(estadoFilter)).toList();
    }

    public CreditAccountDto getCredit(int id, Integer sedeId, AuthUserDto user) {
        requireTables();
        return findAccount(id, access.requirePermission(sedeId, user, "caja.operar"), true);
    }

    @Transactional
    public CreditAccountDto createCredit(CreditAccountRequest request, AuthUserDto user) {
        requireTables();
        if (request.clienteNombre() == null || request.clienteNombre().isBlank())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El nombre del cliente o equipo es obligatorio");
        if (request.montoOriginal() == null || !Double.isFinite(request.montoOriginal()) || request.montoOriginal() <= 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto de la deuda debe ser mayor a 0");
        int venue = access.requirePermission(request.sedeId(), user, "caja.operar");
        LocalDate dueDate;
        try {
            dueDate = request.fechaVencimiento() == null || request.fechaVencimiento().isBlank()
                    ? LocalDate.now().plusDays(7) : LocalDate.parse(request.fechaVencimiento());
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fecha de vencimiento no es válida");
        }
        BigDecimal amount = money(request.montoOriginal());
        KeyHolder key = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement statement = connection.prepareStatement("""
                insert into cuenta_por_cobrar
                    (id_sede, cliente_nombre, cliente_documento, telefono, equipo, monto_original,
                     saldo, total_abonado, concepto, fecha_vencimiento, usucre)
                values (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
                """, new String[]{"id_cuenta"});
            statement.setInt(1, venue);
            statement.setString(2, request.clienteNombre().trim());
            statement.setString(3, safe(request.clienteDocumento()));
            statement.setString(4, safe(request.telefono()));
            statement.setString(5, safe(request.equipo()));
            statement.setBigDecimal(6, amount);
            statement.setBigDecimal(7, amount);
            statement.setString(8, fallback(request.concepto(), "Consumo a cuenta / Fiado"));
            statement.setDate(9, java.sql.Date.valueOf(dueDate));
            statement.setString(10, user.nombre());
            return statement;
        }, key);
        Integer id = key.getKey() == null ? null : key.getKey().intValue();
        if (id == null) throw new IllegalStateException("No se pudo recuperar el ID de la cuenta de crÃ©dito");
        return findAccount(id, venue, true);
    }

    @Transactional
    public CreditAccountDto registerPayment(int accountId, CreditPaymentRequest request, AuthUserDto user) {
        requireTables();
        if (request.monto() == null || !Double.isFinite(request.monto()) || request.monto() <= 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El monto a abonar debe ser mayor a 0");
        Integer venue = jdbc.queryForList("select id_sede from cuenta_por_cobrar where id_cuenta = ?",
                Integer.class, accountId).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cuenta por cobrar no encontrada"));
        access.requirePermission(venue, user, "caja.operar");
        CreditAccountDto current = jdbc.query("""
                select id_cuenta, id_sede, cliente_nombre, cliente_documento, telefono, equipo,
                       monto_original, saldo, total_abonado, concepto, fecha_emision,
                       fecha_vencimiento, estado
                from cuenta_por_cobrar where id_cuenta = ? and id_sede = ? for update
                """, (rs, row) -> mapAccount(rs, false), accountId, venue).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cuenta por cobrar no encontrada"));
        BigDecimal amount = money(request.monto());
        BigDecimal balance = money(current.saldo());
        if (amount.compareTo(balance) > 0)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El abono excede el saldo restante (S/ " + balance + ")");
        if (request.sesionCajaId() != null) {
            Integer cashVenue = jdbc.queryForList("""
                    select c.id_sede from sesion_caja sc join caja c on c.id_caja = sc.id_caja
                    where sc.id_sesion_caja = ?
                    """, Integer.class, request.sesionCajaId()).stream().findFirst().orElse(null);
            if (cashVenue == null || !venue.equals(cashVenue))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La sesión de caja no pertenece a esta sede");
        }
        BigDecimal newBalance = balance.subtract(amount).setScale(2, RoundingMode.HALF_UP);
        BigDecimal paid = money(current.totalAbonado()).add(amount).setScale(2, RoundingMode.HALF_UP);
        String method = fallback(request.medioPago(), "efectivo").toLowerCase(Locale.ROOT);
        jdbc.update("""
                insert into abono_credito
                    (id_cuenta, id_sesion_caja, monto, medio_pago, nro_operacion, observacion, cajero_nombre, usucre)
                values (?, ?, ?, ?, ?, ?, ?, ?)
                """, accountId, request.sesionCajaId(), amount, method, request.nroOperacion(),
                request.observacion(), user.nombre(), user.nombre());
        jdbc.update("""
                update cuenta_por_cobrar set saldo = ?, total_abonado = ?, estado = ?, fecmod = now(), usmod = ?
                where id_cuenta = ? and id_sede = ?
                """, newBalance, paid, newBalance.signum() == 0 ? "CANCELADA" : "PENDIENTE",
                user.nombre(), accountId, venue);
        if ("efectivo".equalsIgnoreCase(method) && request.sesionCajaId() != null) {
            cashService.createMovimientoCaja(new MovimientoCajaRequest(String.valueOf(request.sesionCajaId()),
                    "ingreso", "Abono a Crédito #" + accountId + " (" + current.clienteNombre() + ")",
                    amount, "efectivo", request.nroOperacion()));
        }
        return findAccount(accountId, venue, true);
    }

    public CreditSummaryDto getSummary(Integer sedeId, AuthUserDto user) {
        List<CreditAccountDto> accounts = listCredits(sedeId, user, null);
        BigDecimal due = BigDecimal.ZERO, overdue = BigDecimal.ZERO, paidMonth = BigDecimal.ZERO;
        int debtors = 0, overdueAccounts = 0;
        String month = LocalDate.now().format(DateTimeFormatter.ofPattern("yyyy-MM"));
        for (CreditAccountDto account : accounts) {
            BigDecimal balance = money(account.saldo());
            if (balance.signum() > 0) { due = due.add(balance); debtors++; }
            if ("VENCIDA".equalsIgnoreCase(account.estado()) && balance.signum() > 0) {
                overdue = overdue.add(balance); overdueAccounts++;
            }
            for (CreditPaymentDto payment : account.abonos())
                if (payment.fecha() != null && payment.fecha().startsWith(month)) paidMonth = paidMonth.add(money(payment.monto()));
        }
        return new CreditSummaryDto(due.doubleValue(), overdue.doubleValue(), paidMonth.doubleValue(), debtors, overdueAccounts);
    }

    private CreditAccountDto findAccount(int id, int venue, boolean withPayments) {
        return jdbc.query("""
                select id_cuenta, id_sede, cliente_nombre, cliente_documento, telefono, equipo,
                       monto_original, saldo, total_abonado, concepto, fecha_emision,
                       fecha_vencimiento, estado
                from cuenta_por_cobrar where id_cuenta = ? and id_sede = ?
                """, (rs, row) -> mapAccount(rs, withPayments), id, venue).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Cuenta por cobrar no encontrada"));
    }

    private CreditAccountDto mapAccount(ResultSet rs, boolean withPayments) throws SQLException {
        int id = rs.getInt("id_cuenta");
        int venue = rs.getInt("id_sede");
        String due = rs.getDate("fecha_vencimiento").toLocalDate().toString();
        String status = rs.getString("estado");
        double balance = rs.getBigDecimal("saldo").doubleValue();
        if ("PENDIENTE".equalsIgnoreCase(status) && balance > 0 && LocalDate.parse(due).isBefore(LocalDate.now())) status = "VENCIDA";
        List<CreditPaymentDto> payments = withPayments ? jdbc.query("""
                select id_abono, id_cuenta, id_sesion_caja, fecha_abono, monto, medio_pago,
                       nro_operacion, observacion, cajero_nombre
                from abono_credito where id_cuenta = ? order by fecha_abono desc, id_abono desc
                """, (p, row) -> new CreditPaymentDto(p.getInt("id_abono"), p.getInt("id_cuenta"),
                p.getObject("id_sesion_caja") == null ? null : p.getInt("id_sesion_caja"),
                p.getTimestamp("fecha_abono").toLocalDateTime().toString(), p.getBigDecimal("monto").doubleValue(),
                p.getString("medio_pago"), p.getString("nro_operacion"), p.getString("observacion"),
                p.getString("cajero_nombre")), id) : List.of();
        return new CreditAccountDto(id, venue, rs.getString("cliente_nombre"), rs.getString("cliente_documento"),
                rs.getString("telefono"), rs.getString("equipo"), rs.getBigDecimal("monto_original").doubleValue(),
                balance, rs.getBigDecimal("total_abonado").doubleValue(), rs.getString("concepto"),
                rs.getTimestamp("fecha_emision").toLocalDateTime().toString(), due, status, payments);
    }

    private static BigDecimal money(double amount) { return BigDecimal.valueOf(amount).setScale(2, RoundingMode.HALF_UP); }
    private static String safe(String value) { return value == null ? "" : value.trim(); }
}
