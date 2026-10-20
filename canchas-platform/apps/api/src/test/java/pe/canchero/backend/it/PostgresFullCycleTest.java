package pe.canchero.backend.it;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import pe.canchero.backend.web.dto.BookingResponse;
import pe.canchero.backend.web.dto.CashAuditDto;
import pe.canchero.backend.web.dto.CashBalanceDto;
import pe.canchero.backend.web.dto.CloseCashSessionRequest;
import pe.canchero.backend.web.dto.SaleDto;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PostgresFullCycleTest {

    private JdbcTemplate jdbc;

    @BeforeAll
    static void requirePostgres() {
        PostgresTestServer.requireAvailable();
    }

    @BeforeEach
    void resetDatabase() {
        PostgresTestServer.resetSchema();
        jdbc = PostgresTestSupport.jdbc();
        PostgresTestSupport.seedTwoVenues(jdbc);
    }

    @Test
    void bookingCancellationPosSaleAndCashCloseSurviveAFullCycleOnPostgres() {
        try (var app = PostgresTestSupport.newApp()) {
            int sessionId = PostgresTestSupport.openSession(app, PostgresTestSupport.BOX_A,
                    PostgresTestSupport.OWNER_A, 100.0);

            BookingResponse first = app.data().createBooking(
                    PostgresTestSupport.booking(String.valueOf(PostgresTestSupport.COURT_A),
                            PostgresTestSupport.VENUE_A, PostgresTestSupport.PLAYER_1, "full-cycle-booking-1"),
                    PostgresTestSupport.PLAYER_1, "full-cycle-booking-1");

            assertEquals("Confirmada", first.status());
            assertEquals(90.0, first.total());
            assertEquals("aprobado", first.paymentStatus());
            assertEquals(90.0, first.paidAmount());
            assertEquals(0.0, first.balanceAmount());
            assertTrue(first.codigoPase().startsWith("#CAN-"));

            Map<String, Object> bookingPayment = jdbc.queryForMap("""
                    select pr.monto, pr.comision_plataforma, pr.monto_neto_dueno, pr.estado_liquidacion,
                           pr.numero_operacion, mp.nombre as metodo
                    from pago_reserva pr join metodo_pago mp on mp.id_metodo_pago = pr.id_metodo_pago
                    where pr.id_reserva = ?
                    """, Integer.parseInt(first.id()));
            assertEquals(0, new BigDecimal("90.00").compareTo((BigDecimal) bookingPayment.get("monto")));
            assertEquals(0, new BigDecimal("4.50").compareTo((BigDecimal) bookingPayment.get("comision_plataforma")));
            assertEquals(0, new BigDecimal("85.50").compareTo((BigDecimal) bookingPayment.get("monto_neto_dueno")));
            assertEquals("aprobado", bookingPayment.get("estado_liquidacion"));
            assertEquals("IDEMP:full-cycle-booking-1", bookingPayment.get("numero_operacion"));
            assertEquals("Tarjeta débito/crédito", bookingPayment.get("metodo"));

            BookingResponse cancelled = app.data().cancelBooking(Integer.parseInt(first.id()),
                    PostgresTestSupport.PLAYER_1).orElseThrow();
            assertEquals("Cancelada", cancelled.status());

            BookingResponse second = app.data().createBooking(
                    PostgresTestSupport.booking(String.valueOf(PostgresTestSupport.COURT_A),
                            PostgresTestSupport.VENUE_A, PostgresTestSupport.PLAYER_1, "full-cycle-booking-2"),
                    PostgresTestSupport.PLAYER_1, "full-cycle-booking-2");
            assertNotEquals(first.id(), second.id());
            assertEquals("Confirmada", second.status());
            assertEquals(1, jdbc.queryForObject("""
                    select count(*) from reserva
                    where id_cancha = ? and fecha_reserva = ?::date
                      and estado = 'A' and id_estado_reserva in (1,2)
                    """, Integer.class, PostgresTestSupport.COURT_A, PostgresTestSupport.BOOKING_DATE));

            SaleDto sale = app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "full-cycle-sale-1", PostgresTestSupport.PRODUCT_A, 4, "efectivo", 20.0, null));

            assertEquals(10.0, sale.total());
            assertEquals("efectivo", sale.metodoPago());
            assertEquals(20.0, sale.montoPagado());
            assertEquals(10.0, sale.vuelto());
            assertEquals(1, sale.items().size());
            assertEquals(4, sale.items().get(0).cantidad());

            int stock = app.data().listProducts(PostgresTestSupport.VENUE_A).stream()
                    .filter(p -> p.id() == PostgresTestSupport.PRODUCT_A)
                    .findFirst().orElseThrow().stock();
            assertEquals(36, stock);

            List<Map<String, Object>> salePayments = jdbc.queryForList("""
                    select p.monto, p.monto_recibido, mp.nombre
                    from venta_pago p join metodo_pago mp on mp.id_metodo_pago = p.id_metodo_pago
                    where p.id_venta = ?
                    """, Integer.parseInt(sale.id().replace("VNT-", "")));
            assertEquals(1, salePayments.size());
            assertEquals(0, new BigDecimal("10.00").compareTo((BigDecimal) salePayments.get(0).get("monto")));
            assertEquals(0, new BigDecimal("20.00").compareTo((BigDecimal) salePayments.get(0).get("monto_recibido")));

            CashBalanceDto balance = app.data().cashBalance(sessionId);
            assertEquals(0, new BigDecimal("10.00").compareTo(balance.pagosEfectivo()));
            assertEquals(0, BigDecimal.ZERO.compareTo(balance.pagosDigital()));
            assertEquals(0, new BigDecimal("110.00").compareTo(balance.montoSistema()));

            CashAuditDto audit = app.data().closeCashSession(sessionId,
                    new CloseCashSessionRequest(110.0, 0, 0, 0, "Cierre ciclo completo",
                            PostgresTestSupport.OWNER_A.id()),
                    PostgresTestSupport.OWNER_A);

            assertEquals(110.0, audit.totalEfectivoFisico());
            assertEquals(10.0, audit.totalPagosEfectivo());
            assertEquals(110.0, audit.montoSistema());
            assertEquals(0.0, audit.diferencia());
            assertTrue(audit.desgloseDisponible());
            assertEquals("Cierre ciclo completo", audit.observaciones());

            assertTrue(app.data().getOpenCashSession(PostgresTestSupport.BOX_A).isEmpty());

            List<CashAuditDto> audits = app.data().listCashAuditsForVenue(PostgresTestSupport.VENUE_A);
            assertEquals(1, audits.size());
            assertEquals(audit.id(), audits.get(0).id());

            assertEquals(1, app.data().listVentasBySession(sessionId).size());
            assertTrue(app.data().getVenta(Integer.parseInt(sale.id().replace("VNT-", ""))).isPresent());
            assertFalse(app.data().getVenta(999999).isPresent());
        }
    }
}
