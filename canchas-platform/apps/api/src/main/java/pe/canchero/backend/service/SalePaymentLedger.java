package pe.canchero.backend.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.*;

// All mutations run inside the caller's sale/close transaction and session row lock.
final class SalePaymentLedger {
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();
    private final JdbcTemplate jdbc;
    SalePaymentLedger(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    boolean available() {
        boolean tables = jdbc.queryForObject("""
                select count(*) from information_schema.tables
                where lower(table_schema) = 'public' and lower(table_name) in ('venta_pago', 'venta_operacion')
                """, Integer.class) == 2;
        return tables && jdbc.queryForObject("""
                select count(*) from information_schema.columns where lower(table_schema)='public'
                and lower(table_name)='arqueo_caja' and lower(column_name) in ('pagos_efectivo','ingresos_manuales','egresos_manuales')
                """, Integer.class) == 3;
    }

    void requireSchema() {
        if (!available()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                "El registro de pagos POS requiere aplicar la migracion de pagos; no se guardo ninguna venta");
    }

    String key(ProcessSaleRequest request) {
        String value = request.idempotencyKey();
        if (value == null || value.isBlank()) return UUID.randomUUID().toString();
        if (!value.matches("[A-Za-z0-9_-]{8,100}")) throw bad("Clave de operacion invalida");
        return value;
    }

    String fingerprint(ProcessSaleRequest request) {
        try {
            // Include every submitted item/payment field; retries must not change the operation.
            byte[] value = JSON.writeValueAsBytes(Arrays.asList(request.sedeId(), request.sesionCajaId(),
                    request.tipoComprobante(), request.metodoPago(), request.montoPagado(), request.items(),
                    request.pagos(), request.clienteNombre(), request.clienteDocumento()));
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value));
        } catch (java.security.NoSuchAlgorithmException | com.fasterxml.jackson.core.JsonProcessingException ex) {
            throw new IllegalStateException(ex);
        }
    }

    Integer replay(ProcessSaleRequest request, String key, String hash) {
        var rows = jdbc.queryForList("select id_venta, huella from venta_operacion where id_usuario = ? and clave = ?",
                UUID.fromString(request.usuarioId()), key);
        if (rows.isEmpty()) return null;
        if (!hash.equals(rows.get(0).get("huella"))) throw new ResponseStatusException(HttpStatus.CONFLICT,
                "La clave de operacion ya se utilizo con otros datos");
        return ((Number) rows.get(0).get("id_venta")).intValue();
    }

    void lockSession(Integer sessionId) {
        if (sessionId == null) throw new ResponseStatusException(HttpStatus.CONFLICT, "Abre un turno de caja");
        var rows = jdbc.queryForList("select estado, fecha_cierre from sesion_caja where id_sesion_caja = ? for update", sessionId);
        if (rows.isEmpty()) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Turno no encontrado");
        if (!"A".equals(rows.get(0).get("estado")) || rows.get(0).get("fecha_cierre") != null)
            throw new ResponseStatusException(HttpStatus.CONFLICT, "El turno esta cerrado");
    }

    List<SalePaymentDto> normalize(ProcessSaleRequest request, BigDecimal total) {
        List<SalePaymentDto> raw = request.pagos();
        if (raw == null || raw.isEmpty()) {
            String method = method(request.metodoPago());
            BigDecimal received = "efectivo".equals(method) && request.montoPagado() != null
                    ? money(BigDecimal.valueOf(request.montoPagado())) : total;
            raw = List.of(new SalePaymentDto(method, total, received));
        }
        if (raw.size() > 4) throw bad("Demasiados medios de pago");
        List<SalePaymentDto> result = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        BigDecimal sum = BigDecimal.ZERO;
        for (SalePaymentDto part : raw) {
            if (part == null) throw bad("Pago invalido");
            String method = method(part.metodoPago());
            if (!Set.of("efectivo", "tarjeta", "yape", "plin").contains(method)) throw bad("Medio POS no soportado");
            if (!seen.add(method)) throw bad("Un medio de pago no puede repetirse");
            BigDecimal amount = money(part.monto());
            if (amount.signum() <= 0) throw bad("El importe debe ser positivo");
            BigDecimal received = part.montoRecibido() == null ? amount : money(part.montoRecibido());
            if (received.compareTo(amount) < 0 || (!"efectivo".equals(method) && received.compareTo(amount) != 0))
                throw bad("Importe recibido incompatible con el medio de pago");
            methodId(method);
            sum = sum.add(amount);
            result.add(new SalePaymentDto(method, amount, received));
        }
        if (sum.compareTo(total) != 0) throw bad("La suma de pagos debe coincidir con el total de la venta");
        return result;
    }

    void record(int saleId, ProcessSaleRequest request, String key, String hash, List<SalePaymentDto> payments) {
        for (SalePaymentDto part : payments) jdbc.update("""
                insert into venta_pago (id_venta,id_metodo_pago,monto,monto_recibido,estado,usucre,pccre)
                values (?,?,?,?,'A','API','SPRING')
                """, saleId, methodId(part.metodoPago()), part.monto(), part.montoRecibido());
        jdbc.update("insert into venta_operacion (id_venta,id_usuario,clave,huella) values (?,?,?,?)",
                saleId, UUID.fromString(request.usuarioId()), key, hash);
    }

    List<SalePaymentDto> payments(int saleId) {
        if (!available()) return List.of();
        return jdbc.query("""
                select mp.nombre, p.monto, p.monto_recibido from venta_pago p
                join metodo_pago mp on mp.id_metodo_pago=p.id_metodo_pago
                where p.id_venta=? and p.estado='A' order by p.id_venta_pago
                """, (r, n) -> new SalePaymentDto(method(r.getString(1)), r.getBigDecimal(2), r.getBigDecimal(3)), saleId);
    }

    record Totals(BigDecimal efectivo, BigDecimal digital) {}

    Totals totals(int sessionId) {
        int sales = jdbc.queryForObject("select count(*) from venta where id_sesion_caja=? and estado='A'", Integer.class, sessionId);
        BigDecimal cash = BigDecimal.ZERO;
        BigDecimal digital = BigDecimal.ZERO;
        if (sales > 0) {
            if (!available()) throw new ResponseStatusException(HttpStatus.CONFLICT, "Hay ventas sin desglose de pagos persistido");
            Integer missing = jdbc.queryForObject("""
                    select count(*) from venta v where v.id_sesion_caja=? and v.estado='A'
                    and v.total <> coalesce((select sum(p.monto) from venta_pago p where p.id_venta=v.id_venta and p.estado='A'),0)
                    """, Integer.class, sessionId);
            if (missing > 0) throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Existen ventas historicas sin pagos completos; requiere conciliacion, no se puede inferir efectivo");
            var parts = jdbc.query("""
                    select mp.nombre, sum(p.monto) from venta_pago p join venta v on v.id_venta=p.id_venta
                    join metodo_pago mp on mp.id_metodo_pago=p.id_metodo_pago
                    where v.id_sesion_caja=? and v.estado='A' and p.estado='A' group by mp.nombre
                    """, (r,n) -> new SalePaymentDto(method(r.getString(1)), r.getBigDecimal(2), null), sessionId);
            for (var part : parts) {
                if ("efectivo".equals(part.metodoPago())) cash = cash.add(part.monto()); else digital = digital.add(part.monto());
            }
        }
        // Reservations already have their own payment ledger; never infer amounts from reservation totals.
        Integer foreign = jdbc.queryForObject("""
                select count(*) from pago_reserva p join reserva r on r.id_reserva=p.id_reserva
                join cancha ca on ca.id_cancha=r.id_cancha join sesion_caja sc on sc.id_sesion_caja=p.id_sesion_caja
                join caja cb on cb.id_caja=sc.id_caja where p.id_sesion_caja=? and p.estado='A' and ca.id_sede<>cb.id_sede
                """, Integer.class, sessionId);
        if (foreign != null && foreign > 0) throw new ResponseStatusException(HttpStatus.CONFLICT, "Hay cobros vinculados a otra sede; requiere revision");
        var rents = jdbc.query("""
                select mp.nombre, sum(p.monto) from pago_reserva p join metodo_pago mp on mp.id_metodo_pago=p.id_metodo_pago
                where p.id_sesion_caja=? and p.estado='A' group by mp.nombre
                """, (r,n) -> new SalePaymentDto(method(r.getString(1)), r.getBigDecimal(2), null), sessionId);
        for (var part : rents) {
            if ("efectivo".equals(part.metodoPago())) cash = cash.add(part.monto()); else digital = digital.add(part.monto());
        }
        return new Totals(cash, digital);
    }

    private int methodId(String name) {
        String alias = "tarjeta".equals(name) ? "tarjeta d\u00e9bito/cr\u00e9dito" : name;
        var ids = jdbc.queryForList("select id_metodo_pago from metodo_pago where lower(trim(nombre)) in (?,?) and estado='A'", Integer.class, name, alias);
        if (ids.size() != 1) throw new ResponseStatusException(HttpStatus.CONFLICT, "Medio de pago no disponible: " + name);
        return ids.get(0);
    }

    private String method(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if ("tarjeta d\u00e9bito/cr\u00e9dito".equals(value)) value = "tarjeta";
        if ("transferencia bancaria".equals(value)) value = "transferencia";
        if (!Set.of("efectivo", "tarjeta", "yape", "plin", "transferencia").contains(value)) throw bad("Medio de pago no soportado");
        return value;
    }

    static BigDecimal money(BigDecimal value) {
        if (value == null || value.abs().compareTo(new BigDecimal("9999999999.99")) > 0) throw bad("Importe invalido");
        try { return value.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException ex) { throw bad("Usa importes con un maximo de dos decimales"); }
    }

    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
}
