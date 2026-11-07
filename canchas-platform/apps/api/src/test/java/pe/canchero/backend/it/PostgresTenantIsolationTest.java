package pe.canchero.backend.it;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.BookingResponse;
import pe.canchero.backend.web.dto.CloseCashSessionRequest;
import pe.canchero.backend.web.dto.SaleDto;
import pe.canchero.backend.web.dto.SalePaymentDto;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PostgresTenantIsolationTest {

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
    void ownerAndVenueScopedReadsAndWritesNeverLeakAcrossTenants() {
        try (var app = PostgresTestSupport.newApp()) {
            int sessionA = PostgresTestSupport.openSession(app, PostgresTestSupport.BOX_A,
                    PostgresTestSupport.OWNER_A, 100.0);
            int sessionB = PostgresTestSupport.openSession(app, PostgresTestSupport.BOX_B,
                    PostgresTestSupport.OWNER_B, 100.0);

            BookingResponse bookingA = app.data().createBooking(
                    PostgresTestSupport.booking(String.valueOf(PostgresTestSupport.COURT_A),
                            PostgresTestSupport.VENUE_A, PostgresTestSupport.PLAYER_1, "isolation-booking-a"),
                    PostgresTestSupport.PLAYER_1, "isolation-booking-a");
            BookingResponse bookingB = app.data().createBooking(
                    PostgresTestSupport.booking(String.valueOf(PostgresTestSupport.COURT_B),
                            PostgresTestSupport.VENUE_B, PostgresTestSupport.PLAYER_2, "isolation-booking-b"),
                    PostgresTestSupport.PLAYER_2, "isolation-booking-b");

            assertEquals(1, app.data().listBookings(String.valueOf(PostgresTestSupport.VENUE_A),
                    PostgresTestSupport.OWNER_A).size());
            assertEquals(bookingA.id(), app.data().listBookings(null,
                    PostgresTestSupport.OWNER_A).get(0).id());
            assertEquals(1, app.data().listBookings(String.valueOf(PostgresTestSupport.VENUE_B),
                    PostgresTestSupport.OWNER_B).size());
            assertForbidden(() -> app.data().listBookings(String.valueOf(PostgresTestSupport.VENUE_B),
                    PostgresTestSupport.OWNER_A));
            assertForbidden(() -> app.data().listBookings(String.valueOf(PostgresTestSupport.VENUE_A),
                    PostgresTestSupport.OWNER_B));
            assertForbidden(() -> app.data().listBookingsByPlayer(PostgresTestSupport.PLAYER_2_ID.toString(),
                    PostgresTestSupport.PLAYER_1));
            assertEquals(bookingB.id(), app.data().listBookingsByPlayer(
                    PostgresTestSupport.PLAYER_2_ID.toString(), PostgresTestSupport.PLAYER_2).get(0).id());

            assertForbidden(() -> app.access().requireOwnedVenue(PostgresTestSupport.VENUE_B,
                    PostgresTestSupport.OWNER_A));
            assertForbidden(() -> app.access().requireOwnedSession(sessionB, PostgresTestSupport.OWNER_A));
            assertForbidden(() -> app.access().requireOpenOwnedSession(sessionB, PostgresTestSupport.OWNER_A));

            assertEquals(1, app.pos().listProducts(PostgresTestSupport.VENUE_A).size());
            assertEquals(PostgresTestSupport.PRODUCT_A,
                    app.pos().listProducts(PostgresTestSupport.VENUE_A).get(0).id());
            assertEquals(1, app.pos().listProducts(PostgresTestSupport.VENUE_B).size());
            assertEquals(PostgresTestSupport.PRODUCT_B,
                    app.pos().listProducts(PostgresTestSupport.VENUE_B).get(0).id());
            assertThrows(ResponseStatusException.class, () -> app.pos().listProducts(null));

            SaleDto saleA = app.pos().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionA, PostgresTestSupport.OWNER_A,
                    "isolation-sale-a", PostgresTestSupport.PRODUCT_A, 2, "tarjeta", null,
                    List.of(new SalePaymentDto("tarjeta", new BigDecimal("5.00"), new BigDecimal("5.00")))));
            SaleDto saleB = app.pos().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_B, sessionB, PostgresTestSupport.OWNER_B,
                    "isolation-sale-b", PostgresTestSupport.PRODUCT_B, 2, "tarjeta", null,
                    List.of(new SalePaymentDto("tarjeta", new BigDecimal("6.00"), new BigDecimal("6.00")))));

            assertEquals(5.0, saleA.total());
            assertEquals(6.0, saleB.total());
            assertEquals(38, app.pos().listProducts(PostgresTestSupport.VENUE_A).get(0).stock());
            assertEquals(28, app.pos().listProducts(PostgresTestSupport.VENUE_B).get(0).stock());

            assertForbidden(() -> app.pos().processSale(PostgresTestSupport.sale(
                    PostgresTestSupport.VENUE_A, sessionB, PostgresTestSupport.OWNER_A,
                    "isolation-cross-sale", PostgresTestSupport.PRODUCT_A, 1, "tarjeta", null,
                    List.of(new SalePaymentDto("tarjeta", new BigDecimal("2.50"), new BigDecimal("2.50"))))));

            List<SaleDto> salesA = app.pos().listSales(PostgresTestSupport.VENUE_A);
            List<SaleDto> salesB = app.pos().listSales(PostgresTestSupport.VENUE_B);
            assertEquals(1, salesA.size());
            assertEquals(1, salesB.size());
            assertEquals(saleA.id(), salesA.get(0).id());
            assertEquals(saleB.id(), salesB.get(0).id());

            assertEquals(1, app.pos().listVentasBySession(sessionA).size());
            assertEquals(saleA.id().replace("VNT-", ""), app.pos().listVentasBySession(sessionA).get(0).id());
            assertEquals(1, app.pos().listVentasBySession(sessionB).size());
            assertEquals(saleB.id().replace("VNT-", ""), app.pos().listVentasBySession(sessionB).get(0).id());

            assertEquals(saleA.id().replace("VNT-", ""), app.pos().getVenta(Integer.parseInt(
                    saleA.id().replace("VNT-", ""))).orElseThrow().id());
            assertEquals(saleB.id().replace("VNT-", ""), app.pos().getVenta(Integer.parseInt(
                    saleB.id().replace("VNT-", ""))).orElseThrow().id());

            assertEquals(1, app.pos().listVentasForOwner(PostgresTestSupport.OWNER_A_ID.toString()).size());
            assertEquals(1, app.pos().listVentasForOwner(PostgresTestSupport.OWNER_B_ID.toString()).size());

            app.cash().closeCashSession(sessionA,
                    new CloseCashSessionRequest(100.0, 0, 0, 10.0, "Cierre A",
                            PostgresTestSupport.OWNER_A.id()), PostgresTestSupport.OWNER_A);
            app.cash().closeCashSession(sessionB,
                    new CloseCashSessionRequest(100.0, 0, 0, 6.0, "Cierre B",
                            PostgresTestSupport.OWNER_B.id()), PostgresTestSupport.OWNER_B);

            assertEquals(1, app.cash().listCashAuditsForVenue(PostgresTestSupport.VENUE_A).size());
            assertEquals(1, app.cash().listCashAuditsForVenue(PostgresTestSupport.VENUE_B).size());
            assertEquals(1, app.cash().listCashAuditsForOwner(
                    PostgresTestSupport.OWNER_A_ID.toString()).size());
            assertEquals(1, app.cash().listCashAuditsForOwner(
                    PostgresTestSupport.OWNER_B_ID.toString()).size());
            assertTrue(app.cash().listCashAuditsForVenue(PostgresTestSupport.VENUE_A)
                    .get(0).observaciones().contains("Cierre A"));
        }
    }

    private static void assertForbidden(org.junit.jupiter.api.function.Executable action) {
        ResponseStatusException exception = assertThrows(ResponseStatusException.class, action);
        assertEquals(403, exception.getStatusCode().value());
    }
}
