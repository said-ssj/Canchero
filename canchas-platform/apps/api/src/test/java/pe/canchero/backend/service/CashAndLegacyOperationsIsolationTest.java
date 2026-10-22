package pe.canchero.backend.service;

import java.math.BigDecimal;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.config.ApiAuthorizationInterceptor;
import pe.canchero.backend.web.controller.CajaController;
import pe.canchero.backend.web.controller.CashController;
import pe.canchero.backend.web.controller.MovimientoCajaController;
import pe.canchero.backend.web.controller.PagoReservaController;
import pe.canchero.backend.web.controller.SesionCajaController;
import pe.canchero.backend.web.controller.VentaController;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class CashAndLegacyOperationsIsolationTest {

    private JdbcTemplate jdbc;
    private SupabaseDataService dataService;
    private CashVenueStateService venueStateService;
    private VenueAccessService accessService;
    private AuthTokenService tokenService;
    private MockMvc mvc;

    private UUID ownerAId;
    private UUID ownerBId;
    private UUID player1Id;
    private UUID player2Id;
    private UUID adminId;

    private String tokenOwnerA;
    private String tokenOwnerB;
    private String tokenPlayer1;
    private String tokenPlayer2;
    private String tokenAdmin;

    @BeforeEach
    void setup() {
        SingleConnectionDataSource ds = new SingleConnectionDataSource(
                "jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1;MODE=PostgreSQL",
                "sa",
                "",
                true);
        jdbc = new JdbcTemplate(ds);

        jdbc.execute("create table rol (id_rol int primary key, nombre varchar(50), estado char(1))");
        jdbc.execute("""
                create table usuario (
                    id_usuario uuid primary key,
                    id_rol int,
                    nombre varchar(120),
                    correo varchar(120),
                    telefono varchar(30),
                    password_hash varchar(255),
                    estado char(1),
                    feccre timestamp default current_timestamp
                )
                """);
        jdbc.execute("""
                create table cliente (
                    id_cliente uuid primary key,
                    id_usuario uuid,
                    tipo_documento varchar(20) not null,
                    numero_documento varchar(30) not null,
                    nombres varchar(100) not null,
                    apellidos varchar(100) not null,
                    telefono varchar(30),
                    correo varchar(120),
                    estado char(1) not null,
                    usucre varchar(40),
                    pccre varchar(40),
                    feccre timestamp default current_timestamp,
                    usmod varchar(40),
                    pcmod varchar(40),
                    fecmod timestamp
                )
                """);
        jdbc.execute("create table sede (id_sede int primary key, id_dueno varchar(40), nombre varchar(100), estado char(1))");
        jdbc.execute("create table cancha (id_cancha int primary key, id_sede int, nombre varchar(100), estado char(1))");
        jdbc.execute("create table estado_reserva (id_estado_reserva int primary key, nombre varchar(50), estado char(1))");
        jdbc.execute("create table metodo_pago (id_metodo_pago int primary key, nombre varchar(50), estado char(1))");
        jdbc.execute("""
                create table reserva (
                    id_reserva int primary key,
                    id_cliente uuid,
                    id_cancha int,
                    id_estado_reserva int,
                    id_usuario uuid,
                    fecha_reserva date,
                    hora_inicio time,
                    hora_fin time,
                    monto_total decimal(10,2),
                    adelanto decimal(10,2),
                    saldo decimal(10,2),
                    codigo_pase varchar(40),
                    estado char(1)
                )
                """);
        jdbc.execute("""
                create table pago_reserva (
                    id_pago_reserva int primary key,
                    id_reserva int,
                    id_metodo_pago int,
                    id_sesion_caja int,
                    monto decimal(10,2),
                    fecha_pago timestamp default current_timestamp,
                    numero_operacion varchar(50),
                    es_adelanto boolean,
                    comision_plataforma decimal(10,2),
                    monto_neto_dueno decimal(10,2),
                    estado_liquidacion varchar(40),
                    estado char(1)
                )
                """);
        jdbc.execute("""
                create table caja (
                    id_caja int generated by default as identity primary key,
                    id_sede int,
                    nombre_identificador varchar(100),
                    estado char(1),
                    usucre varchar(40),
                    pccre varchar(40)
                )
                """);
        jdbc.execute("""
                create table sesion_caja (
                    id_sesion_caja int generated by default as identity primary key,
                    id_caja int,
                    id_usuario uuid,
                    fecha_apertura timestamp,
                    monto_apertura decimal(10,2),
                    fecha_cierre timestamp,
                    monto_cierre decimal(10,2),
                    monto_sistema decimal(10,2),
                    diferencia decimal(10,2),
                    estado char(1),
                    usucre varchar(40),
                    pccre varchar(40),
                    fecmod timestamp,
                    usmod varchar(40),
                    pcmod varchar(40)
                )
                """);
        jdbc.execute("""
                create table movimiento_caja (
                    id_movimiento int generated by default as identity primary key,
                    id_sesion_caja int,
                    id_tipo_movimiento int,
                    monto decimal(10,2),
                    concepto varchar(255),
                    fecha_movimiento timestamp,
                    estado char(1),
                    usucre varchar(40),
                    pccre varchar(40)
                )
                """);
        jdbc.execute("""
                create table arqueo_caja (
                    id_arqueo int generated by default as identity primary key,
                    id_sesion_caja int,
                    id_usuario uuid,
                    fecha_arqueo timestamp,
                    total_efectivo decimal(10,2),
                    total_digital decimal(10,2),
                    observaciones varchar(255),
                    estado char(1),
                    usucre varchar(40),
                    pccre varchar(40)
                )
                """);
        jdbc.execute("create table categoria_producto (id_categoria int primary key, nombre varchar(50))");
        jdbc.execute("""
                create table producto (
                    id_producto int generated by default as identity primary key,
                    id_categoria int,
                    codigo_barras varchar(50),
                    nombre varchar(100),
                    precio_compra decimal(10,2),
                    precio_venta decimal(10,2),
                    stock_minimo int,
                    estado char(1),
                    usucre varchar(40),
                    pccre varchar(40)
                )
                """);
        jdbc.execute("""
                create table kardex (
                    id_kardex int generated by default as identity primary key,
                    id_producto int,
                    id_sede int,
                    id_tipo_mov_inv int,
                    cantidad int,
                    precio_unitario decimal(10,2),
                    saldo_stock int,
                    motivo varchar(255),
                    fecha timestamp,
                    feccre timestamp default current_timestamp,
                    estado char(1),
                    usucre varchar(40),
                    pccre varchar(40)
                )
                """);
        jdbc.execute("""
                create table venta (
                    id_venta int generated by default as identity primary key,
                    id_usuario uuid,
                    id_sesion_caja int,
                    fecha_venta timestamp,
                    subtotal decimal(10,2),
                    igv decimal(10,2),
                    total decimal(10,2),
                    tipo_comprobante varchar(40),
                    numero_comprobante varchar(40),
                    estado char(1),
                    usucre varchar(40),
                    pccre varchar(40),
                    feccre timestamp default current_timestamp
                )
                """);
        jdbc.execute("""
                create table venta_detalle (
                    id_venta_detalle int generated by default as identity primary key,
                    id_venta int,
                    id_producto int,
                    cantidad int,
                    precio_unitario decimal(10,2),
                    subtotal decimal(10,2),
                    estado char(1),
                    usucre varchar(40),
                    pccre varchar(40)
                )
                """);

        jdbc.execute("create table venta_pago (id_venta_pago int generated by default as identity primary key,id_venta int not null,id_metodo_pago int not null,monto numeric(12,2) not null,monto_recibido numeric(12,2) not null,estado char(1),usucre varchar,pccre varchar,unique(id_venta,id_metodo_pago))");
        jdbc.execute("create table venta_operacion (id_venta int primary key,id_usuario uuid not null,clave varchar(100) not null,huella varchar(64),unique(id_usuario,clave))");
        jdbc.execute("alter table arqueo_caja add pagos_efectivo numeric(12,2)");
        jdbc.execute("alter table arqueo_caja add ingresos_manuales numeric(12,2)");
        jdbc.execute("alter table arqueo_caja add egresos_manuales numeric(12,2)");
        // Seed roles
        jdbc.update("insert into rol values (1, 'cliente', 'A'), (2, 'dueño', 'A'), (3, 'admin', 'A')");
        jdbc.update("insert into metodo_pago values (1, 'Efectivo', 'A'), (2, 'Tarjeta', 'A'), (3, 'Yape', 'A'), (4, 'Plin', 'A')");
        jdbc.update("insert into estado_reserva values (1, 'Pendiente', 'A'), (2, 'Confirmada', 'A')");
        jdbc.update("insert into categoria_producto values (1, 'Bebidas')");

        // Seed users
        ownerAId = UUID.randomUUID();
        ownerBId = UUID.randomUUID();
        player1Id = UUID.randomUUID();
        player2Id = UUID.randomUUID();
        adminId = UUID.randomUUID();

        jdbc.update("insert into usuario values (?, 2, 'Owner A', 'ownerA@canchero.pe', '900000001', 'hash', 'A', current_timestamp)", ownerAId);
        jdbc.update("insert into usuario values (?, 2, 'Owner B', 'ownerB@canchero.pe', '900000002', 'hash', 'A', current_timestamp)", ownerBId);
        jdbc.update("insert into usuario values (?, 1, 'Player 1', 'player1@canchero.pe', '900000003', 'hash', 'A', current_timestamp)", player1Id);
        jdbc.update("insert into usuario values (?, 1, 'Player 2', 'player2@canchero.pe', '900000004', 'hash', 'A', current_timestamp)", player2Id);
        jdbc.update("insert into usuario values (?, 3, 'Admin', 'admin@canchero.pe', '900000005', 'hash', 'A', current_timestamp)", adminId);

        // Sedes: Owner A has 10 and 20; Owner B has 30
        jdbc.update("insert into sede values (10, ?, 'Sede Norte', 'A')", ownerAId.toString());
        jdbc.update("insert into sede values (20, ?, 'Sede Sur', 'A')", ownerAId.toString());
        jdbc.update("insert into sede values (30, ?, 'Sede Este', 'A')", ownerBId.toString());

        // Canchas
        jdbc.update("insert into cancha values (101, 10, 'Cancha 101', 'A')");
        jdbc.update("insert into cancha values (301, 30, 'Cancha 301', 'A')");

        // Reservas & Pagos
        jdbc.update("""
                insert into reserva (id_reserva, id_cliente, id_cancha, id_estado_reserva, id_usuario, fecha_reserva, hora_inicio, hora_fin, monto_total, adelanto, saldo, codigo_pase, estado)
                values (101, ?, 101, 2, ?, '2026-10-25', '10:00:00', '11:00:00', 100.0, 100.0, 0.0, 'PASE-101', 'A')
                """, player1Id, player1Id);
        jdbc.update("""
                insert into pago_reserva (id_pago_reserva, id_reserva, id_metodo_pago, monto, fecha_pago, numero_operacion, es_adelanto, comision_plataforma, monto_neto_dueno, estado_liquidacion, estado)
                values (501, 101, 2, 100.0, current_timestamp, 'OP-501', true, 5.0, 95.0, 'Pendiente', 'A')
                """);

        // Cajas: Caja 1 (Sede 10 - Owner A), Caja 2 (Sede 20 - Owner A), Caja 3 (Sede 30 - Owner B)
        jdbc.update("insert into caja (id_caja, id_sede, nombre_identificador, estado) values (1, 10, 'Caja Norte 1', 'A')");
        jdbc.update("insert into caja (id_caja, id_sede, nombre_identificador, estado) values (2, 20, 'Caja Sur 1', 'A')");
        jdbc.update("insert into caja (id_caja, id_sede, nombre_identificador, estado) values (3, 30, 'Caja Este 1', 'A')");

        // Sesion Caja 10 (Caja 1, Owner A) - Abierta
        jdbc.update("""
                insert into sesion_caja (id_sesion_caja, id_caja, id_usuario, fecha_apertura, monto_apertura, estado)
                values (10, 1, ?, current_timestamp, 100.0, 'A')
                """, ownerAId);

        // Sesion Caja 30 (Caja 3, Owner B) - Abierta
        jdbc.update("""
                insert into sesion_caja (id_sesion_caja, id_caja, id_usuario, fecha_apertura, monto_apertura, estado)
                values (30, 3, ?, current_timestamp, 200.0, 'A')
                """, ownerBId);

        // Product and Kardex for Sede 10
        jdbc.update("insert into producto (id_producto, id_categoria, codigo_barras, nombre, precio_compra, precio_venta, stock_minimo, estado) values (1, 1, '775001', 'Agua Mineral', 1.0, 2.5, 5, 'A')");
        jdbc.update("insert into kardex (id_producto, id_sede, id_tipo_mov_inv, cantidad, precio_unitario, saldo_stock, motivo, fecha, estado) values (1, 10, 1, 20, 1.0, 20, 'Stock Inicial', current_timestamp, 'A')");

        // Services
        tokenService = new AuthTokenService("test-phase3-secret-key-canchero-token-xyz");
        dataService = new SupabaseDataService(jdbc, tokenService);
        accessService = new VenueAccessService(jdbc);
        venueStateService = new CashVenueStateService(jdbc, dataService);

        tokenOwnerA = tokenService.issue(ownerAId, true);
        tokenOwnerB = tokenService.issue(ownerBId, true);
        tokenPlayer1 = tokenService.issue(player1Id, true);
        tokenPlayer2 = tokenService.issue(player2Id, true);
        tokenAdmin = tokenService.issue(adminId, true);

        mvc = MockMvcBuilders.standaloneSetup(
                        new CashController(dataService, venueStateService, accessService),
                        new CajaController(dataService, accessService),
                        new SesionCajaController(dataService, accessService),
                        new MovimientoCajaController(dataService, accessService),
                        new PagoReservaController(dataService, accessService),
                        new VentaController(dataService, accessService),
                        new pe.canchero.backend.web.controller.PosController(dataService, accessService))
                .addInterceptors(new ApiAuthorizationInterceptor(tokenService, dataService))
                .build();
    }

    @Test
    void anonymousRequestsAreRejectedWith401AcrossAllCashAndLegacyEndpoints() throws Exception {
        mvc.perform(get("/api/cash/boxes")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/cash/sessions").contentType(MediaType.APPLICATION_JSON).content("{\"cajaId\":1,\"montoApertura\":100}")).andExpect(status().isUnauthorized());
        mvc.perform(patch("/api/cash/sessions/10/close").contentType(MediaType.APPLICATION_JSON).content("{\"totalEfectivoFisico\":100}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/cash/movements").contentType(MediaType.APPLICATION_JSON).content("{\"sesionId\":10,\"tipo\":\"ingreso\",\"monto\":20}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/cash/audits")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/cajas")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/cajas").contentType(MediaType.APPLICATION_JSON).content("{\"nombre\":\"Caja X\"}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/sesiones-caja")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/sesiones-caja/abrir").contentType(MediaType.APPLICATION_JSON).content("{\"cajaId\":\"1\"}")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/sesiones-caja/10/cerrar")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/movimientos-caja/sesion/10")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/movimientos-caja").contentType(MediaType.APPLICATION_JSON).content("{\"sesionCajaId\":\"10\",\"tipo\":\"ingreso\",\"monto\":10}")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/pagos-reserva/reserva/101")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/ventas")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/ventas").contentType(MediaType.APPLICATION_JSON).content("{\"sesionCajaId\":\"10\"}")).andExpect(status().isUnauthorized());
    }

    private pe.canchero.backend.web.dto.ProcessSaleRequest paymentRequest(String key, java.util.List<pe.canchero.backend.web.dto.SalePaymentDto> payments) {
        return new pe.canchero.backend.web.dto.ProcessSaleRequest("boleta", payments.size() == 1 ? payments.get(0).metodoPago() : "mixto",
                null, null, null, null, 10, 10, ownerAId.toString(),
                java.util.List.of(new pe.canchero.backend.web.dto.SaleItemDto(1, "ignored", 4, 999, 3996)), payments, key);
    }

    @Test
    void simultaneousRetriesUseSeparateConnectionsAndWriteOnlyOnce() throws Exception {
        String url = jdbc.getDataSource().getConnection().getMetaData().getURL();
        var datasource = new org.springframework.jdbc.datasource.DriverManagerDataSource(url, "sa", "");
        var concurrentJdbc = new JdbcTemplate(datasource);
        var service = new SupabaseDataService(concurrentJdbc, tokenService);
        var transaction = new org.springframework.transaction.support.TransactionTemplate(
                new org.springframework.jdbc.datasource.DataSourceTransactionManager(datasource));
        var request = paymentRequest("concurrent-sale-key", java.util.List.of(
                new pe.canchero.backend.web.dto.SalePaymentDto("tarjeta", new BigDecimal("10.00"), null)));
        var start = new java.util.concurrent.CountDownLatch(1);
        try (var pool = java.util.concurrent.Executors.newFixedThreadPool(2)) {
            java.util.concurrent.Callable<String> work = () -> {
                start.await();
                return transaction.execute(status -> service.processSale(request).id());
            };
            var first = pool.submit(work);
            var second = pool.submit(work);
            start.countDown();
            assertEquals(first.get(10, java.util.concurrent.TimeUnit.SECONDS), second.get(10, java.util.concurrent.TimeUnit.SECONDS));
        }
        assertEquals(1, jdbc.queryForObject("select count(*) from venta", Integer.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from venta_pago", Integer.class));
        assertEquals(16, service.listProducts(10).get(0).stock());
    }

    @Test
    void refusesCashBalanceIfReservationPaymentBelongsToAnotherVenue() {
        jdbc.update("update reserva set id_cancha=301 where id_reserva=101");
        jdbc.update("insert into pago_reserva (id_pago_reserva,id_reserva,id_metodo_pago,id_sesion_caja,monto,estado) values (603,101,1,10,5,'A')");
        assertEquals(409, assertThrows(org.springframework.web.server.ResponseStatusException.class,
                () -> dataService.cashBalance(10)).getStatusCode().value());
    }

    @Test
    void persistsEverySupportedMethodAndCashChangeWithoutCreditingReceivedCashAsRevenue() throws Exception {
        for (String method : java.util.List.of("efectivo", "tarjeta", "yape", "plin")) {
            setup();
            var part = new pe.canchero.backend.web.dto.SalePaymentDto(method, new BigDecimal("10.00"), new BigDecimal(method.equals("efectivo") ? "20.00" : "10.00"));
            var sale = dataService.processSale(paymentRequest("method-test-key", java.util.List.of(part)));
            assertEquals(10, sale.total());
            assertEquals(method, sale.metodoPago());
            assertEquals(method.equals("efectivo") ? 10 : 0, sale.vuelto());
            assertEquals(new BigDecimal("10.00"), dataService.listSales(10).get(0).pagos().get(0).monto());
            var audit = dataService.closeCashSession(10, new pe.canchero.backend.web.dto.CloseCashSessionRequest(method.equals("efectivo") ? 110 : 100,999,999,999,"Test",null),
                    new pe.canchero.backend.web.dto.AuthUserDto(ownerAId.toString(),"Owner","","","dueno"));
            assertEquals(0, audit.diferencia());
            assertEquals(method.equals("efectivo") ? 10 : 0, audit.totalPagosEfectivo());
            assertTrue(audit.desgloseDisponible());
        }
    }

    @Test
    void combinesSaleAndReservationPaymentsBySessionWithoutMixingDigitalCash() {
        var sale = dataService.processSale(paymentRequest("mixed-test-key", java.util.List.of(
                new pe.canchero.backend.web.dto.SalePaymentDto("efectivo",new BigDecimal("4.00"),new BigDecimal("10.00")),
                new pe.canchero.backend.web.dto.SalePaymentDto("tarjeta",new BigDecimal("6.00"),null))));
        assertEquals("mixto", sale.metodoPago());
        assertEquals(6, sale.vuelto());
        jdbc.update("insert into pago_reserva (id_pago_reserva,id_reserva,id_metodo_pago,id_sesion_caja,monto,estado) values (601,101,1,10,5,'A'),(602,101,3,10,8,'A')");
        var balance = dataService.cashBalance(10);
        assertEquals(new BigDecimal("9.00"), balance.pagosEfectivo());
        assertEquals(new BigDecimal("14.00"), balance.pagosDigital());
        var audit = dataService.closeCashSession(10,new pe.canchero.backend.web.dto.CloseCashSessionRequest(109,0,0,999,"Test",null),
                new pe.canchero.backend.web.dto.AuthUserDto(ownerAId.toString(),"Owner","","","dueno"));
        assertEquals(109, audit.montoSistema());
        assertEquals(9, dataService.listCashAuditsForOwner(ownerAId.toString()).get(0).totalPagosEfectivo());
        assertEquals(new BigDecimal("14.00"), jdbc.queryForObject("select total_digital from arqueo_caja",BigDecimal.class));
    }

    @Test
    void idempotentRetryDoesNotDuplicateSalePaymentOrStockAndRejectsChangedRequest() {
        var request = paymentRequest("retry-sale-key",java.util.List.of(new pe.canchero.backend.web.dto.SalePaymentDto("tarjeta",new BigDecimal("10.00"),null)));
        var sale = dataService.processSale(request);
        assertEquals(sale.id(), dataService.processSale(request).id());
        assertEquals(1,jdbc.queryForObject("select count(*) from venta",Integer.class));
        assertEquals(1,jdbc.queryForObject("select count(*) from venta_pago",Integer.class));
        assertEquals(16,jdbc.queryForObject("select saldo_stock from kardex order by id_kardex desc limit 1",Integer.class));
        var changed = paymentRequest("retry-sale-key",java.util.List.of(new pe.canchero.backend.web.dto.SalePaymentDto("efectivo",new BigDecimal("10.00"),null)));
        assertEquals(409,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->dataService.processSale(changed)).getStatusCode().value());
    }

    @Test
    void invalidSplitIsRejectedBeforeAnySaleOrStockWrite() {
        var request = paymentRequest("invalid-sale-key",java.util.List.of(new pe.canchero.backend.web.dto.SalePaymentDto("yape",new BigDecimal("9.00"),null)));
        assertEquals(400,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->dataService.processSale(request)).getStatusCode().value());
        assertEquals(0,jdbc.queryForObject("select count(*) from venta",Integer.class));
        assertEquals(1,jdbc.queryForObject("select count(*) from kardex",Integer.class));
    }

    @Test
    void historicalSaleWithoutPaymentNeverBecomesCashOrAnAutomaticallyRepairedSale() {
        jdbc.update("insert into venta (id_usuario,id_sesion_caja,total,estado) values (?,10,10,'A')",ownerAId);
        assertEquals(409,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->dataService.cashBalance(10)).getStatusCode().value());
        assertEquals("sin_desglose",dataService.listSales(10).get(0).metodoPago());
        assertEquals(0,jdbc.queryForObject("select count(*) from venta_pago",Integer.class));
    }

    @Test
    void missingMigrationReturns503WithoutCreatingAnUnpaidSale() {
        jdbc.execute("drop table venta_operacion");
        var request = paymentRequest("schema-sale-key",java.util.List.of(new pe.canchero.backend.web.dto.SalePaymentDto("tarjeta",new BigDecimal("10.00"),null)));
        assertEquals(503,assertThrows(org.springframework.web.server.ResponseStatusException.class,()->dataService.processSale(request)).getStatusCode().value());
        assertEquals(0,jdbc.queryForObject("select count(*) from venta",Integer.class));
    }

    @Test
    void paymentPersistenceFailureRollsBackSaleItemsAndInventoryInATransaction() {
        jdbc.execute("alter table venta_pago add constraint simulated_failure check (monto < 1)");
        var transaction = new org.springframework.transaction.support.TransactionTemplate(
                new org.springframework.jdbc.datasource.DataSourceTransactionManager(jdbc.getDataSource()));
        var request = paymentRequest("rollback-sale-key",java.util.List.of(new pe.canchero.backend.web.dto.SalePaymentDto("tarjeta",new BigDecimal("10.00"),null)));
        assertThrows(org.springframework.dao.DataAccessException.class,()->transaction.execute(status->dataService.processSale(request)));
        assertEquals(0,jdbc.queryForObject("select count(*) from venta",Integer.class));
        assertEquals(0,jdbc.queryForObject("select count(*) from venta_detalle",Integer.class));
        assertEquals(1,jdbc.queryForObject("select count(*) from kardex",Integer.class));
    }

    @Test
    void ownerListingBoxesWithoutSedeIdReturnsOnlyOwnVenuesBoxes() throws Exception {
        // Owner A owns Sede 10 (Caja 1) and Sede 20 (Caja 2). Owner B owns Sede 30 (Caja 3).
        mvc.perform(get("/api/cash/boxes")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value(1))
                .andExpect(jsonPath("$[0].sedeId").value(10))
                .andExpect(jsonPath("$[1].id").value(2))
                .andExpect(jsonPath("$[1].sedeId").value(20));

        // Legacy /api/cajas
        mvc.perform(get("/api/cajas")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(2)))
                .andExpect(jsonPath("$[0].id").value("1"))
                .andExpect(jsonPath("$[1].id").value("2"));
    }

    @Test
    void ownerQueryingForeignVenueBoxesOrCajaReturnsForbidden() throws Exception {
        // Owner A tries to list boxes of Sede 30 (Owner B)
        mvc.perform(get("/api/cash/boxes?sedeId=30")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("La sede no pertenece a tu cuenta"));

        // Legacy /api/cajas?sedeId=30
        mvc.perform(get("/api/cajas?sedeId=30")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isForbidden());

        // Direct get on Caja 3 (Owner B)
        mvc.perform(get("/api/cajas/3")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("La caja no pertenece a tu cuenta"));
    }

    @Test
    void ownerOpeningSessionOnForeignBoxIsForbidden() throws Exception {
        // Owner A tries to open a session on Caja 3 (Owner B) via /api/cash/sessions
        mvc.perform(post("/api/cash/sessions")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "cajaId": 3,
                            "montoApertura": 50.0
                        }
                        """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("La caja no pertenece a tu cuenta"));

        // Legacy /api/sesiones-caja/abrir
        mvc.perform(post("/api/sesiones-caja/abrir")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "cajaId": "3",
                            "montoInicial": 50.0
                        }
                        """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("La caja no pertenece a tu cuenta"));
    }

    @Test
    void serverDerivesAuthorFromTokenAndIgnoresSpoofedUserIdInRequest() throws Exception {
        // Owner A creates session on Caja 2 with spoofed usuarioId = ownerBId
        mvc.perform(post("/api/cash/sessions")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content(String.format("""
                        {
                            "cajaId": 2,
                            "montoApertura": 80.0,
                            "usuarioId": "%s"
                        }
                        """, ownerBId)))
                .andExpect(status().isOk());

        // Verify in DB that id_usuario is ownerAId, NOT ownerBId
        UUID recordedUser = jdbc.queryForObject("select id_usuario from sesion_caja where id_caja = 2", UUID.class);
        assertEquals(ownerAId, recordedUser);

        // Now close session on Caja 2 with spoofed usuarioId = ownerBId
        Integer sessionId = jdbc.queryForObject("select id_sesion_caja from sesion_caja where id_caja = 2", Integer.class);
        mvc.perform(patch("/api/cash/sessions/" + sessionId + "/close")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content(String.format("""
                        {
                            "totalEfectivoFisico": 80.0,
                            "montoSistema": 9999.0,
                            "diferencia": 0.0,
                            "usuarioId": "%s"
                        }
                        """, ownerBId)))
                .andExpect(status().isOk());

        // Verify in DB that arqueo_caja author is ownerAId, NOT ownerBId
        UUID auditUser = jdbc.queryForObject("select id_usuario from arqueo_caja where id_sesion_caja = ?", UUID.class, sessionId);
        assertEquals(ownerAId, auditUser);
    }

    @Test
    void authoritativeSystemBalanceCalculatedFromDatabaseRecordsIgnoringClientNumbers() throws Exception {
        // Session 10 on Caja 1 has monto_apertura = 100.00
        // Register manual movement: Ingreso S/ 50.00
        mvc.perform(post("/api/cash/movements")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sesionId": 10,
                            "tipo": "ingreso",
                            "monto": 50.0,
                            "concepto": "Cambio inicial extra"
                        }
                        """))
                .andExpect(status().isOk());

        // Register manual movement: Egreso S/ 20.00
        mvc.perform(post("/api/cash/movements")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sesionId": 10,
                            "tipo": "egreso",
                            "monto": 20.0,
                            "concepto": "Compra de bolsas"
                        }
                        """))
                .andExpect(status().isOk());

        // Register sale in Session 10: 4 units of Agua Mineral @ 2.50 = S/ 10.00
        mvc.perform(post("/api/ventas")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sesionCajaId": "10",
                            "metodoPago": "efectivo",
                            "detalles": [
                                {
                                    "productoId": "1",
                                    "cantidad": 4,
                                    "precioUnitario": 2.50
                                }
                            ]
                        }
                        """))
                .andExpect(status().isCreated());

        // Sales lack persisted payment splits: neither client's total nor sale.total can prove cash.
        mvc.perform(patch("/api/cash/sessions/10/close")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "totalEfectivoFisico": 135.0,
                            "montoSistema": 999.0,
                            "diferencia": 0.0,
                            "totalDigital": 0.0,
                            "observaciones": "Cierre con faltante de 5 soles"
                        }
                        """))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.montoSistema").value(140.0))
                .andExpect(jsonPath("$.diferencia").value(-5.0));
    }

    @Test
    void cardSaleCannotBecomeAFictitiousCashShortageInEitherCloseEndpoint() throws Exception {
        mvc.perform(post("/api/ventas").header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sesionCajaId\":\"10\",\"metodoPago\":\"tarjeta\",\"detalles\":[{\"productoId\":\"1\",\"cantidad\":4,\"precioUnitario\":2.5}]}"))
                .andExpect(status().isCreated());
        mvc.perform(patch("/api/cash/sessions/10/close").header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON).content("{\"totalEfectivoFisico\":100,\"totalDigital\":10}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.montoSistema").value(100.0))
                .andExpect(jsonPath("$.diferencia").value(0.0));
        mvc.perform(post("/api/sesiones-caja/10/cerrar").header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isConflict());
        assertEquals("I", jdbc.queryForObject("select estado from sesion_caja where id_sesion_caja = 10", String.class));
        assertEquals(1, jdbc.queryForObject("select count(*) from arqueo_caja", Integer.class));
    }

    @Test
    void closingWithoutSalesUsesPersistedCashMovementsNotClientTotals() throws Exception {
        jdbc.update("insert into movimiento_caja (id_sesion_caja,id_tipo_movimiento,monto,concepto,estado) values (10,1,20,'Ingreso','A'),(10,2,5,'Egreso','A')");
        mvc.perform(patch("/api/cash/sessions/10/close").header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"totalEfectivoFisico\":110,\"montoSistema\":999,\"diferencia\":0}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.montoSistema").value(115.0))
                .andExpect(jsonPath("$.diferencia").value(-5.0));
    }

    @Test
    void closedSessionRejectsSubsequentMutationsWithConflict409() throws Exception {
        // Close Session 10 first
        mvc.perform(patch("/api/cash/sessions/10/close")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "totalEfectivoFisico": 100.0,
                            "montoSistema": 100.0,
                            "diferencia": 0.0
                        }
                        """))
                .andExpect(status().isOk());

        // 1. Double close via /api/cash -> 409
        mvc.perform(patch("/api/cash/sessions/10/close")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"totalEfectivoFisico\": 100.0}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("El turno de caja ya se encuentra cerrado"));

        // 2. Double close via legacy /api/sesiones-caja -> 409
        mvc.perform(post("/api/sesiones-caja/10/cerrar")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("El turno de caja ya se encuentra cerrado"));

        // 3. Register cash movement on closed session -> 409
        mvc.perform(post("/api/cash/movements")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sesionId": 10,
                            "tipo": "ingreso",
                            "monto": 25.0
                        }
                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("El turno de caja ya se encuentra cerrado"));

        // 4. Register movement via legacy route -> 409
        mvc.perform(post("/api/movimientos-caja")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sesionCajaId": "10",
                            "tipo": "ingreso",
                            "monto": 25.0
                        }
                        """))
                .andExpect(status().isConflict());

        // 5. Register sale on closed session -> 409
        mvc.perform(post("/api/ventas")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sesionCajaId": "10",
                            "metodoPago": "efectivo",
                            "detalles": [
                                {
                                    "productoId": "1",
                                    "cantidad": 1,
                                    "precioUnitario": 2.50
                                }
                            ]
                        }
                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("El turno de caja ya se encuentra cerrado"));
    }

    @Test
    void foreignSessionAccessAndMovementsAreForbidden() throws Exception {
        // Owner A attempts to inspect movements of Session 30 (owned by B)
        mvc.perform(get("/api/cash/sessions/30/movements")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("El turno no pertenece a tu cuenta"));

        // Legacy /api/movimientos-caja/sesion/30
        mvc.perform(get("/api/movimientos-caja/sesion/30")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("El turno no pertenece a tu cuenta"));

        // Owner A attempts to register movement on Session 30
        mvc.perform(post("/api/cash/movements")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sesionId": 30,
                            "tipo": "ingreso",
                            "monto": 15.0
                        }
                        """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("El turno no pertenece a tu cuenta"));

        // Owner A attempts to close Session 30
        mvc.perform(patch("/api/cash/sessions/30/close")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"totalEfectivoFisico\": 200.0}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("El turno no pertenece a tu cuenta"));
    }

    @Test
    void incompatibleIdsAndInvalidAmountsAreRejectedWith400() throws Exception {
        // Negative movement amount
        mvc.perform(post("/api/cash/movements")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sesionId": 10,
                            "tipo": "ingreso",
                            "monto": -10.0
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("El monto debe ser mayor que cero"));

        // Negative opening cash
        mvc.perform(post("/api/cash/sessions")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "cajaId": 2,
                            "montoApertura": -50.0
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("El monto de apertura no puede ser negativo"));

        // Create caja without venue
        mvc.perform(post("/api/cajas")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nombre\":\"Caja Huérfana\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Selecciona una sede"));

        // Sale with mismatched sedeId (Sede 20 provided, but Session 10 belongs to Sede 10)
        mvc.perform(post("/api/ventas?sedeId=20")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sesionCajaId": "10",
                            "metodoPago": "efectivo",
                            "detalles": [
                                {
                                    "productoId": "1",
                                    "cantidad": 1,
                                    "precioUnitario": 2.50
                                }
                            ]
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("La sede indicada no coincide con el turno de caja"));
    }

    @Test
    void reservationPaymentAccessEnforcesOwnershipAndTitularity() throws Exception {
        // Reservation 101 on Sede 10 (Owner A), Player 1 is titular.
        // 1. Owner A can view payments -> 200
        mvc.perform(get("/api/pagos-reserva/reserva/101")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].monto").value(100.0));

        // 2. Player 1 (titular) can view payments -> 200
        mvc.perform(get("/api/pagos-reserva/reserva/101")
                .header("Authorization", "Bearer " + tokenPlayer1))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)));

        // 3. Admin can view payments -> 200
        mvc.perform(get("/api/pagos-reserva/reserva/101")
                .header("Authorization", "Bearer " + tokenAdmin))
                .andExpect(status().isOk());

        // 4. Player 2 (unrelated) is rejected -> 403
        mvc.perform(get("/api/pagos-reserva/reserva/101")
                .header("Authorization", "Bearer " + tokenPlayer2))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("No tienes acceso a los pagos de esta reserva"));

        // 5. Owner B (unrelated owner) is rejected -> 403
        mvc.perform(get("/api/pagos-reserva/reserva/101")
                .header("Authorization", "Bearer " + tokenOwnerB))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("No tienes acceso a los pagos de esta reserva"));

        // 6. Non-existent reservation -> 404
        mvc.perform(get("/api/pagos-reserva/reserva/999")
                .header("Authorization", "Bearer " + tokenOwnerA))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Reserva no encontrada"));
    }

    @Test
    void rejectedOperationsLeaveZeroPartialWrites() throws Exception {
        int initialMovements = jdbc.queryForObject("select count(*) from movimiento_caja", Integer.class);
        int initialSales = jdbc.queryForObject("select count(*) from venta", Integer.class);
        int initialSessions = jdbc.queryForObject("select count(*) from sesion_caja", Integer.class);
        int initialBoxes = jdbc.queryForObject("select count(*) from caja", Integer.class);

        // Attempt foreign box session open (403)
        mvc.perform(post("/api/cash/sessions")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"cajaId\": 3, \"montoApertura\": 50.0}"))
                .andExpect(status().isForbidden());

        // Attempt foreign session movement (403)
        mvc.perform(post("/api/cash/movements")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sesionId\": 30, \"tipo\": \"ingreso\", \"monto\": 15.0}"))
                .andExpect(status().isForbidden());

        // Attempt negative amount movement (400)
        mvc.perform(post("/api/cash/movements")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sesionId\": 10, \"tipo\": \"ingreso\", \"monto\": -50.0}"))
                .andExpect(status().isBadRequest());

        // Attempt create caja without venue (400)
        mvc.perform(post("/api/cajas")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"nombre\":\"Caja Huérfana\"}"))
                .andExpect(status().isBadRequest());

        // Attempt foreign sale (403)
        mvc.perform(post("/api/ventas")
                .header("Authorization", "Bearer " + tokenOwnerA)
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"sesionCajaId\":\"30\",\"metodoPago\":\"efectivo\"}"))
                .andExpect(status().isForbidden());

        // Verify counts remain unchanged
        assertEquals(initialMovements, jdbc.queryForObject("select count(*) from movimiento_caja", Integer.class));
        assertEquals(initialSales, jdbc.queryForObject("select count(*) from venta", Integer.class));
        assertEquals(initialSessions, jdbc.queryForObject("select count(*) from sesion_caja", Integer.class));
        assertEquals(initialBoxes, jdbc.queryForObject("select count(*) from caja", Integer.class));
    }
}
