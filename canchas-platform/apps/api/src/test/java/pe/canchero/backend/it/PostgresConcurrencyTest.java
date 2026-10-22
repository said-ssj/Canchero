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

import javax.sql.DataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PostgresConcurrencyTest {

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
    void simultaneousBookingsForTheSameSlotHaveASingleWinnerAcrossServiceInstances() throws Exception {
        try (var firstApp = PostgresTestSupport.newApp(); var secondApp = PostgresTestSupport.newApp()) {
            List<Outcome<BookingResponse>> outcomes = runTogether(
                    () -> firstApp.data().createBooking(PostgresTestSupport.booking(
                                    String.valueOf(PostgresTestSupport.COURT_A), PostgresTestSupport.VENUE_A,
                                    PostgresTestSupport.PLAYER_1, "concurrent-booking-a"),
                            PostgresTestSupport.PLAYER_1, "concurrent-booking-a"),
                    () -> secondApp.data().createBooking(PostgresTestSupport.booking(
                                    String.valueOf(PostgresTestSupport.COURT_A), PostgresTestSupport.VENUE_A,
                                    PostgresTestSupport.PLAYER_2, "concurrent-booking-b"),
                            PostgresTestSupport.PLAYER_2, "concurrent-booking-b"));

            assertEquals(1, outcomes.stream().filter(Outcome::success).count());
            Outcome<BookingResponse> loser = outcomes.stream().filter(o -> !o.success()).findFirst().orElseThrow();
            assertEquals(409, statusOf(loser.error()));
            assertEquals(1, jdbc.queryForObject("select count(*) from reserva", Integer.class));
            assertEquals(1, jdbc.queryForObject("select count(*) from pago_reserva", Integer.class));
        }
    }

    @Test
    void simultaneousRetryWithTheSameBookingKeyReturnsTheSameReservation() throws Exception {
        try (var firstApp = PostgresTestSupport.newApp(); var secondApp = PostgresTestSupport.newApp()) {
            List<Outcome<BookingResponse>> outcomes = runTogether(
                    () -> firstApp.data().createBooking(PostgresTestSupport.booking(
                                    String.valueOf(PostgresTestSupport.COURT_A), PostgresTestSupport.VENUE_A,
                                    PostgresTestSupport.PLAYER_1, "concurrent-idempotent-booking"),
                            PostgresTestSupport.PLAYER_1, "concurrent-idempotent-booking"),
                    () -> secondApp.data().createBooking(PostgresTestSupport.booking(
                                    String.valueOf(PostgresTestSupport.COURT_A), PostgresTestSupport.VENUE_A,
                                    PostgresTestSupport.PLAYER_1, "concurrent-idempotent-booking"),
                            PostgresTestSupport.PLAYER_1, "concurrent-idempotent-booking"));

            assertTrue(outcomes.stream().allMatch(Outcome::success));
            assertEquals(outcomes.get(0).value().id(), outcomes.get(1).value().id());
            assertEquals(1, jdbc.queryForObject("select count(*) from reserva", Integer.class));
            assertEquals(1, jdbc.queryForObject("select count(*) from pago_reserva", Integer.class));
        }
    }

    @Test
    void simultaneousPosRetryWithTheSameKeyRecordsOneSaleAndOneStockMovement() throws Exception {
        try (var app = PostgresTestSupport.newApp()) {
            int sessionId = PostgresTestSupport.openSession(app, PostgresTestSupport.BOX_A,
                    PostgresTestSupport.OWNER_A, 100.0);
            List<Outcome<SaleDto>> outcomes = runTogether(
                    () -> app.data().processSale(PostgresTestSupport.sale(
                            PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                            "concurrent-pos-retry", PostgresTestSupport.PRODUCT_A, 2, "tarjeta", null,
                            List.of(new SalePaymentDto("tarjeta", new BigDecimal("5.00"), new BigDecimal("5.00"))))),
                    () -> app.data().processSale(PostgresTestSupport.sale(
                            PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                            "concurrent-pos-retry", PostgresTestSupport.PRODUCT_A, 2, "tarjeta", null,
                            List.of(new SalePaymentDto("tarjeta", new BigDecimal("5.00"), new BigDecimal("5.00"))))));

            assertTrue(outcomes.stream().allMatch(Outcome::success));
            assertEquals(outcomes.get(0).value().id(), outcomes.get(1).value().id());
            assertEquals(1, jdbc.queryForObject("select count(*) from venta", Integer.class));
            assertEquals(1, jdbc.queryForObject("select count(*) from venta_pago", Integer.class));
            assertEquals(1, jdbc.queryForObject("select count(*) from kardex where motivo like 'Venta POS #%'", Integer.class));
            assertEquals(38, stock(PostgresTestSupport.PRODUCT_A, PostgresTestSupport.VENUE_A));
        }
    }

    @Test
    void simultaneousSalesCannotOversellTheSameStock() throws Exception {
        jdbc.update("""
                insert into producto (id_producto, id_categoria, codigo_barras, nombre, precio_compra,
                                      precio_venta, stock_minimo, estado, usucre, pccre)
                values (3, 1, '7750003', 'Chocolate', 1.00, 3.00, 1, 'A', 'SEED', 'TEST')
                """);
        jdbc.update("""
                insert into kardex (id_producto, id_sede, id_tipo_mov_inv, cantidad, precio_unitario,
                                    saldo_stock, motivo, fecha, estado, usucre, pccre)
                values (3, ?, 1, 10, 1.00, 10, 'Stock inicial', now(), 'A', 'SEED', 'TEST')
                """, PostgresTestSupport.VENUE_A);

        try (var firstApp = PostgresTestSupport.newApp(); var secondApp = PostgresTestSupport.newApp()) {
            int sessionId = PostgresTestSupport.openSession(firstApp, PostgresTestSupport.BOX_A,
                    PostgresTestSupport.OWNER_A, 100.0);
            List<Outcome<SaleDto>> outcomes = runTogether(
                    () -> firstApp.data().processSale(PostgresTestSupport.sale(
                            PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                            "concurrent-stock-a", 3, 6, "tarjeta", null,
                            List.of(new SalePaymentDto("tarjeta", new BigDecimal("18.00"), new BigDecimal("18.00"))))),
                    () -> secondApp.data().processSale(PostgresTestSupport.sale(
                            PostgresTestSupport.VENUE_A, sessionId, PostgresTestSupport.OWNER_A,
                            "concurrent-stock-b", 3, 6, "tarjeta", null,
                            List.of(new SalePaymentDto("tarjeta", new BigDecimal("18.00"), new BigDecimal("18.00"))))));

            assertEquals(1, outcomes.stream().filter(Outcome::success).count());
            Outcome<SaleDto> loser = outcomes.stream().filter(o -> !o.success()).findFirst().orElseThrow();
            assertEquals(409, statusOf(loser.error()));
            assertEquals(1, jdbc.queryForObject("select count(*) from venta", Integer.class));
            assertEquals(4, stock(3, PostgresTestSupport.VENUE_A));
        }
    }

    @Test
    void simultaneousCashCloseCreatesExactlyOneAudit() throws Exception {
        try (var firstApp = PostgresTestSupport.newApp(); var secondApp = PostgresTestSupport.newApp()) {
            int sessionId = PostgresTestSupport.openSession(firstApp, PostgresTestSupport.BOX_A,
                    PostgresTestSupport.OWNER_A, 100.0);
            var outcomes = runTogether(
                    () -> firstApp.data().closeCashSession(sessionId,
                            new CloseCashSessionRequest(100.0, 0, 0, 0, "Cierre A",
                                    PostgresTestSupport.OWNER_A.id()), PostgresTestSupport.OWNER_A),
                    () -> secondApp.data().closeCashSession(sessionId,
                            new CloseCashSessionRequest(100.0, 0, 0, 0, "Cierre B",
                                    PostgresTestSupport.OWNER_A.id()), PostgresTestSupport.OWNER_A));

            assertEquals(1, outcomes.stream().filter(Outcome::success).count());
            Outcome<?> loser = outcomes.stream().filter(o -> !o.success()).findFirst().orElseThrow();
            assertEquals(409, statusOf(loser.error()));
            assertEquals(1, jdbc.queryForObject("select count(*) from arqueo_caja", Integer.class));
        }
    }

    @Test
    void databaseExclusionConstraintRejectsOverlapWithoutTheServiceRowLock() throws Exception {
        DataSource dataSource = PostgresTestServer.dataSource();
        try (Connection first = dataSource.getConnection(); Connection second = dataSource.getConnection()) {
            first.setAutoCommit(false);
            second.setAutoCommit(false);
            try {
                insertActiveReservation(first, "#CAN-RAW1");

                ExecutorService executor = Executors.newSingleThreadExecutor();
                try {
                    Future<Throwable> blocked = executor.submit(() -> {
                        try {
                            insertActiveReservation(second, "#CAN-RAW2");
                            second.commit();
                            return null;
                        } catch (Throwable ex) {
                            second.rollback();
                            return ex;
                        }
                    });

                    Thread.sleep(500);
                    first.commit();

                    Throwable error = blocked.get(20, TimeUnit.SECONDS);
                    assertNotNull(error, "La segunda reserva solapada debe ser rechazada por PostgreSQL");
                    SQLException sqlError = assertInstanceOf(SQLException.class, error);
                    assertEquals("23P01", sqlError.getSQLState());
                    assertEquals(1, jdbc.queryForObject("select count(*) from reserva", Integer.class));
                } finally {
                    executor.shutdownNow();
                }
            } finally {
                if (!first.getAutoCommit()) {
                    first.rollback();
                }
                if (!second.getAutoCommit()) {
                    second.rollback();
                }
            }
        }
    }

    private static void insertActiveReservation(Connection connection, String passCode) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                insert into reserva (id_cliente, id_cancha, id_estado_reserva, id_usuario, fecha_reserva,
                                     hora_inicio, hora_fin, monto_total, adelanto, saldo, codigo_pase,
                                     estado, usucre, pccre)
                values (?, ?, 2, ?, date '2026-10-23', time '14:00', time '15:00', 90, 90, 0, ?,
                        'A', 'TEST', 'IT')
                """)) {
            statement.setObject(1, PostgresTestSupport.CLIENT_1_ID);
            statement.setInt(2, PostgresTestSupport.COURT_A);
            statement.setObject(3, PostgresTestSupport.PLAYER_1_ID);
            statement.setString(4, passCode);
            statement.executeUpdate();
        }
    }

    private int stock(int productId, int venueId) {
        return jdbc.queryForObject("""
                select saldo_stock from kardex
                where id_producto = ? and id_sede = ? and estado = 'A'
                order by coalesce(fecha, feccre) desc, id_kardex desc limit 1
                """, Integer.class, productId, venueId);
    }

    @SafeVarargs
    private static <T> List<Outcome<T>> runTogether(Callable<T>... tasks) throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(tasks.length);
        CountDownLatch ready = new CountDownLatch(tasks.length);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Outcome<T>>> futures = new java.util.ArrayList<>();
            for (Callable<T> task : tasks) {
                futures.add(executor.submit(() -> {
                    ready.countDown();
                    start.await(10, TimeUnit.SECONDS);
                    try {
                        return new Outcome<>(task.call(), null);
                    } catch (Throwable ex) {
                        return new Outcome<>(null, ex);
                    }
                }));
            }
            assertTrue(ready.await(10, TimeUnit.SECONDS));
            start.countDown();
            List<Outcome<T>> results = new java.util.ArrayList<>();
            for (Future<Outcome<T>> future : futures) {
                results.add(future.get(30, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            executor.shutdownNow();
        }
    }

    private static int statusOf(Throwable error) {
        if (error instanceof ResponseStatusException statusException) {
            return statusException.getStatusCode().value();
        }
        if (error instanceof ExecutionException && error.getCause() != null) {
            return statusOf(error.getCause());
        }
        throw new AssertionError("Se esperaba ResponseStatusException pero fue: " + error, error);
    }

    private record Outcome<T>(T value, Throwable error) {
        boolean success() {
            return error == null;
        }
    }
}
