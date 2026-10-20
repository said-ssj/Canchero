package pe.canchero.backend.it;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.CashAuditDto;
import pe.canchero.backend.web.dto.CashBalanceDto;
import pe.canchero.backend.web.dto.CloseCashSessionRequest;
import pe.canchero.backend.web.dto.ProcessSaleRequest;
import pe.canchero.backend.web.dto.SaleDto;
import pe.canchero.backend.web.dto.SalePaymentDto;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PostgresPaymentMethodsTest {

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
    void cashCardYapePlinAndMixedPaymentsReconcileAgainstStockAndCashClose() {
        try (var app = PostgresTestSupport.newApp()) {
            int sessionId = PostgresTestSupport.openSession(app, PostgresTestSupport.BOX_A,
                    PostgresTestSupport.OWNER_A, 100.0);

            SaleDto cash = app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-cash-1", PostgresTestSupport.PRODUCT_A, 4, "efectivo", 20.0, null));
            assertEquals(10.0, cash.total());
            assertEquals("efectivo", cash.metodoPago());
            assertEquals(20.0, cash.montoPagado());
            assertEquals(10.0, cash.vuelto());

            SaleDto card = app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-card-1", PostgresTestSupport.PRODUCT_A, 4, "tarjeta", null,
                    List.of(new SalePaymentDto("tarjeta", new BigDecimal("10.00"), new BigDecimal("10.00")))));
            assertEquals("tarjeta", card.metodoPago());
            assertEquals(10.0, card.montoPagado());
            assertEquals(0.0, card.vuelto());

            SaleDto yape = app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-yape-1", PostgresTestSupport.PRODUCT_A, 4, "yape", null, null));
            assertEquals("yape", yape.metodoPago());
            assertEquals(10.0, yape.montoPagado());
            assertEquals(0.0, yape.vuelto());

            SaleDto plin = app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-plin-1", PostgresTestSupport.PRODUCT_A, 4, "plin", null, null));
            assertEquals("plin", plin.metodoPago());
            assertEquals(10.0, plin.montoPagado());
            assertEquals(0.0, plin.vuelto());

            SaleDto mixed = app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-mixed-1", PostgresTestSupport.PRODUCT_A, 4, "mixto", null,
                    List.of(new SalePaymentDto("efectivo", new BigDecimal("4.00"), new BigDecimal("10.00")),
                            new SalePaymentDto("tarjeta", new BigDecimal("6.00"), new BigDecimal("6.00")))));
            assertEquals("mixto", mixed.metodoPago());
            assertEquals(16.0, mixed.montoPagado());
            assertEquals(6.0, mixed.vuelto());
            assertEquals(2, mixed.pagos().size());

            assertEquals(20, app.data().listProducts(PostgresTestSupport.VENUE_A).stream()
                    .filter(p -> p.id() == PostgresTestSupport.PRODUCT_A)
                    .findFirst().orElseThrow().stock());
            assertEquals(6, jdbc.queryForObject("select count(*) from venta_pago", Integer.class));

            SaleDto retried = app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-card-1", PostgresTestSupport.PRODUCT_A, 4, "tarjeta", null,
                    List.of(new SalePaymentDto("tarjeta", new BigDecimal("10.00"), new BigDecimal("10.00")))));
            assertEquals(card.id(), retried.id());
            assertEquals(6, jdbc.queryForObject("select count(*) from venta_pago", Integer.class));
            assertEquals(20, app.data().listProducts(PostgresTestSupport.VENUE_A).stream()
                    .filter(p -> p.id() == PostgresTestSupport.PRODUCT_A)
                    .findFirst().orElseThrow().stock());

            CashBalanceDto balance = app.data().cashBalance(sessionId);
            assertEquals(0, new BigDecimal("14.00").compareTo(balance.pagosEfectivo()));
            assertEquals(0, new BigDecimal("36.00").compareTo(balance.pagosDigital()));
            assertEquals(0, new BigDecimal("114.00").compareTo(balance.montoSistema()));

            assertBadRequest(() -> app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-invalid-change", PostgresTestSupport.PRODUCT_A, 4, "efectivo", 5.0, null)));
            assertBadRequest(() -> app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-invalid-digital-change", PostgresTestSupport.PRODUCT_A, 4, "tarjeta", null,
                    List.of(new SalePaymentDto("tarjeta", new BigDecimal("10.00"), new BigDecimal("12.00"))))));
            assertBadRequest(() -> app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-invalid-sum", PostgresTestSupport.PRODUCT_A, 4, "mixto", null,
                    List.of(new SalePaymentDto("efectivo", new BigDecimal("4.00"), new BigDecimal("4.00")),
                            new SalePaymentDto("tarjeta", new BigDecimal("5.00"), new BigDecimal("5.00"))))));
            assertBadRequest(() -> app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-invalid-method", PostgresTestSupport.PRODUCT_A, 4, "transferencia", null, null)));
            assertBadRequest(() -> app.data().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                    "pay-invalid-duplicate", PostgresTestSupport.PRODUCT_A, 4, "mixto", null,
                    List.of(new SalePaymentDto("efectivo", new BigDecimal("5.00"), new BigDecimal("5.00")),
                            new SalePaymentDto("efectivo", new BigDecimal("5.00"), new BigDecimal("5.00"))))));

            assertEquals(5, jdbc.queryForObject("select count(*) from venta", Integer.class));
            assertEquals(6, jdbc.queryForObject("select count(*) from venta_pago", Integer.class));

            CashAuditDto audit = app.data().closeCashSession(sessionId,
                    new CloseCashSessionRequest(114.0, 0, 0, 0, "Cierre medios de pago",
                            PostgresTestSupport.OWNER_A.id()), PostgresTestSupport.OWNER_A);
            assertEquals(114.0, audit.totalEfectivoFisico());
            assertEquals(14.0, audit.totalPagosEfectivo());
            assertEquals(114.0, audit.montoSistema());
            assertEquals(0.0, audit.diferencia());
            assertTrue(audit.desgloseDisponible());
            assertEquals(0, new BigDecimal("36.00").compareTo(jdbc.queryForObject(
                    "select total_digital from arqueo_caja where id_arqueo = ?",
                    BigDecimal.class, Integer.parseInt(audit.id()))));
            assertEquals(0, new BigDecimal("14.00").compareTo(jdbc.queryForObject(
                    "select pagos_efectivo from arqueo_caja where id_arqueo = ?",
                    BigDecimal.class, Integer.parseInt(audit.id()))));
        }
    }

    private static void assertBadRequest(org.junit.jupiter.api.function.Executable action) {
        ResponseStatusException exception = assertThrows(ResponseStatusException.class, action);
        assertEquals(400, exception.getStatusCode().value());
    }
}
