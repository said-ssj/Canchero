package pe.canchero.backend.it;

import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import pe.canchero.backend.service.AuthTokenService;
import pe.canchero.backend.service.SupabaseDataService;
import pe.canchero.backend.service.VenueAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.BookingRequest;
import pe.canchero.backend.web.dto.OpenCashSessionRequest;
import pe.canchero.backend.web.dto.ProcessSaleRequest;
import pe.canchero.backend.web.dto.SaleItemDto;
import pe.canchero.backend.web.dto.SalePaymentDto;

import javax.sql.DataSource;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

public final class PostgresTestSupport {

    public static final ZoneId LIMA = ZoneId.of("America/Lima");
    public static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-22T19:30:00Z"), LIMA);
    public static final String BOOKING_DATE = "2026-10-23";
    public static final String BOOKING_SLOT = "10:00 - 11:00";
    public static final double BOOKING_TOTAL = 90.0;

    public static final UUID OWNER_A_ID = UUID.fromString("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    public static final UUID OWNER_B_ID = UUID.fromString("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
    public static final UUID PLAYER_1_ID = UUID.fromString("11111111-1111-1111-1111-111111111111");
    public static final UUID PLAYER_2_ID = UUID.fromString("22222222-2222-2222-2222-222222222222");
    public static final UUID CLIENT_1_ID = UUID.fromString("c1111111-1111-1111-1111-111111111111");
    public static final UUID CLIENT_2_ID = UUID.fromString("c2222222-2222-2222-2222-222222222222");

    public static final int VENUE_A = 10;
    public static final int VENUE_B = 20;
    public static final int COURT_A = 101;
    public static final int COURT_B = 201;
    public static final int BOX_A = 1;
    public static final int BOX_B = 2;
    public static final int PRODUCT_A = 1;
    public static final int PRODUCT_B = 2;

    public static final AuthUserDto OWNER_A = new AuthUserDto(OWNER_A_ID.toString(), "Dueno A",
            "dueno.a@canchero.pe", "900000001", "dueno");
    public static final AuthUserDto OWNER_B = new AuthUserDto(OWNER_B_ID.toString(), "Dueno B",
            "dueno.b@canchero.pe", "900000002", "dueno");
    public static final AuthUserDto PLAYER_1 = new AuthUserDto(PLAYER_1_ID.toString(), "Jugador Uno",
            "jugador1@canchero.pe", "900000003", "cliente");
    public static final AuthUserDto PLAYER_2 = new AuthUserDto(PLAYER_2_ID.toString(), "Jugador Dos",
            "jugador2@canchero.pe", "900000004", "cliente");

    private PostgresTestSupport() {}

    public static JdbcTemplate jdbc() {
        return new JdbcTemplate(PostgresTestServer.dataSource());
    }

    public static App newApp() {
        AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext();
        context.register(TestConfig.class);
        context.refresh();
        return new App(
                context,
                context.getBean(SupabaseDataService.class),
                context.getBean(VenueAccessService.class),
                context.getBean(AuthTokenService.class),
                context.getBean(JdbcTemplate.class));
    }

    public static void seedTwoVenues(JdbcTemplate jdbc) {
        jdbc.update("insert into rol (id_rol, nombre, descripcion, estado) values "
                + "(1, 'cliente', 'Jugador', 'A'), (2, 'dueno', 'Propietario', 'A'), "
                + "(3, 'administrador', 'Administrador', 'A')");

        jdbc.update("""
                insert into usuario (id_usuario, id_rol, nombre, correo, telefono, password_hash, estado)
                values (?, 2, 'Dueno A', 'dueno.a@canchero.pe', '900000001', 'hash', 'A'),
                       (?, 2, 'Dueno B', 'dueno.b@canchero.pe', '900000002', 'hash', 'A'),
                       (?, 1, 'Jugador Uno', 'jugador1@canchero.pe', '900000003', 'hash', 'A'),
                       (?, 1, 'Jugador Dos', 'jugador2@canchero.pe', '900000004', 'hash', 'A')
                """, OWNER_A_ID, OWNER_B_ID, PLAYER_1_ID, PLAYER_2_ID);

        jdbc.update("""
                insert into cliente (id_cliente, id_usuario, tipo_documento, numero_documento,
                                     nombres, apellidos, telefono, correo, estado, usucre, pccre)
                values (?, ?, 'DNI', '70000001', 'Jugador', 'Uno', '900000003', 'jugador1@canchero.pe', 'A', 'SEED', 'TEST'),
                       (?, ?, 'DNI', '70000002', 'Jugador', 'Dos', '900000004', 'jugador2@canchero.pe', 'A', 'SEED', 'TEST')
                """, CLIENT_1_ID, PLAYER_1_ID, CLIENT_2_ID, PLAYER_2_ID);

        jdbc.update("insert into departamento (id_departamento, nombre, estado) values (1, 'Lima', 'A')");
        jdbc.update("insert into provincia (id_provincia, id_departamento, nombre, estado) values (1, 1, 'Lima', 'A')");
        jdbc.update("insert into distrito (id_distrito, id_provincia, nombre, estado) values (1, 1, 'Miraflores', 'A')");

        jdbc.update("""
                insert into sede (id_sede, id_dueno, id_distrito, nombre, direccion, telefono, estado, usucre, pccre)
                values (?, ?, 1, 'Sede A', 'Av. A 100', '900000001', 'A', 'SEED', 'TEST'),
                       (?, ?, 1, 'Sede B', 'Av. B 200', '900000002', 'A', 'SEED', 'TEST')
                """, VENUE_A, OWNER_A_ID, VENUE_B, OWNER_B_ID);

        jdbc.update("insert into tipo_cancha (id_tipo_cancha, nombre, estado) values (1, 'Futbol 7', 'A')");
        jdbc.update("""
                insert into cancha (id_cancha, id_sede, id_tipo_cancha, nombre_numero, techada, superficie, estado, usucre, pccre)
                values (?, ?, 1, 'Cancha A', true, 'Grass Sintetico', 'A', 'SEED', 'TEST'),
                       (?, ?, 1, 'Cancha B', true, 'Grass Sintetico', 'A', 'SEED', 'TEST')
                """, COURT_A, VENUE_A, COURT_B, VENUE_B);

        jdbc.update("""
                insert into tipo_horario (id_sede, dia_semana, apertura, cierre, estado)
                values (?, 5, '08:00:00', '00:00:00', 'A'), (?, 5, '08:00:00', '00:00:00', 'A')
                """, VENUE_A, VENUE_B);

        jdbc.update("""
                insert into tarifa_cancha (id_cancha, dia_semana, hora_inicio, hora_fin, precio, estado)
                values (?, 5, '08:00:00', '18:00:00', 90.00, 'A'),
                       (?, 5, '18:00:00', '00:00:00', 120.00, 'A'),
                       (?, 5, '08:00:00', '18:00:00', 90.00, 'A'),
                       (?, 5, '18:00:00', '00:00:00', 120.00, 'A')
                """, COURT_A, COURT_A, COURT_B, COURT_B);

        jdbc.update("""
                insert into estado_reserva (id_estado_reserva, nombre, color_hex, estado)
                values (1, 'Pendiente', '#FFC107', 'A'), (2, 'Confirmada', '#28A745', 'A'),
                       (3, 'Completada', '#17A2B8', 'A'), (4, 'Cancelada', '#DC3545', 'A')
                """);

        jdbc.update("""
                insert into metodo_pago (id_metodo_pago, nombre, descripcion, estado)
                values (1, 'Yape', 'Billetera digital', 'A'),
                       (2, 'Tarjeta débito/crédito', 'POS', 'A'),
                       (3, 'Efectivo', 'Caja', 'A'),
                       (4, 'Plin', 'Billetera digital', 'A')
                """);

        jdbc.update("""
                insert into caja (id_caja, id_sede, nombre_identificador, estado, usucre, pccre)
                values (?, ?, 'Caja A', 'A', 'SEED', 'TEST'), (?, ?, 'Caja B', 'A', 'SEED', 'TEST')
                """, BOX_A, VENUE_A, BOX_B, VENUE_B);

        jdbc.update("insert into categoria_producto (id_categoria, nombre, estado) values (1, 'Bebidas', 'A')");
        jdbc.update("""
                insert into producto (id_producto, id_categoria, codigo_barras, nombre, precio_compra,
                                      precio_venta, stock_minimo, estado, usucre, pccre)
                values (?, 1, '7750001', 'Agua', 1.20, 2.50, 5, 'A', 'SEED', 'TEST'),
                       (?, 1, '7750002', 'Gaseosa', 2.00, 3.00, 5, 'A', 'SEED', 'TEST')
                """, PRODUCT_A, PRODUCT_B);

        jdbc.update("""
                insert into kardex (id_producto, id_sede, id_tipo_mov_inv, cantidad, precio_unitario,
                                    saldo_stock, motivo, fecha, estado, usucre, pccre)
                values (?, ?, 1, 40, 1.20, 40, 'Stock inicial', now(), 'A', 'SEED', 'TEST'),
                       (?, ?, 1, 30, 2.00, 30, 'Stock inicial', now(), 'A', 'SEED', 'TEST')
                """, PRODUCT_A, VENUE_A, PRODUCT_B, VENUE_B);
    }

    public static int openSession(App app, int boxId, AuthUserDto owner, double openingCash) {
        return app.data().openCashSession(new OpenCashSessionRequest(
                boxId, owner.nombre(), owner.email(), openingCash, owner.id()), owner).id();
    }

    public static BookingRequest booking(String courtId, int venueId, AuthUserDto player, String key) {
        return new BookingRequest("Cancha", "Sede", String.valueOf(venueId), courtId,
                player.id(), BOOKING_DATE, BOOKING_SLOT, BOOKING_TOTAL, "tarjeta",
                List.of(), null, key);
    }

    public static ProcessSaleRequest sale(int venueId, int sessionId, AuthUserDto owner, String key,
            int productId, int quantity, String method, Double paid, List<SalePaymentDto> payments) {
        return new ProcessSaleRequest("boleta", method, owner.nombre(), "Cliente", "00000000",
                paid, sessionId, venueId, owner.id(),
                List.of(new SaleItemDto(productId, "", quantity, 0, 0)), payments, key);
    }

    public record App(AnnotationConfigApplicationContext context,
                      SupabaseDataService data,
                      VenueAccessService access,
                      AuthTokenService tokens,
                      JdbcTemplate jdbc) implements AutoCloseable {
        @Override
        public void close() {
            context.close();
        }
    }

    @Configuration
    @EnableTransactionManagement
    static class TestConfig {
        @Bean
        public DataSource dataSource() {
            return PostgresTestServer.dataSource();
        }

        @Bean
        public JdbcTemplate jdbcTemplate(DataSource dataSource) {
            return new JdbcTemplate(dataSource);
        }

        @Bean
        public PlatformTransactionManager transactionManager(DataSource dataSource) {
            return new DataSourceTransactionManager(dataSource);
        }

        @Bean
        public AuthTokenService authTokenService() {
            return new AuthTokenService("canchero-integration-test-secret-key-2026", CLOCK);
        }

        @Bean
        public SupabaseDataService dataService(JdbcTemplate jdbcTemplate, AuthTokenService authTokenService) {
            return new SupabaseDataService(jdbcTemplate, authTokenService, CLOCK);
        }

        @Bean
        public VenueAccessService venueAccessService(JdbcTemplate jdbcTemplate) {
            return new VenueAccessService(jdbcTemplate);
        }
    }
}
