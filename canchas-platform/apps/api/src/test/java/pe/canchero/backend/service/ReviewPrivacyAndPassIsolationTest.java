package pe.canchero.backend.service;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import pe.canchero.backend.config.ApiAuthorizationInterceptor;
import pe.canchero.backend.web.controller.BookingController;
import pe.canchero.backend.web.controller.ReviewController;

import static org.hamcrest.Matchers.*;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ReviewPrivacyAndPassIsolationTest {

    private MockMvc mvc;
    private JdbcTemplate jdbc;
    private AuthTokenService tokenService;
    private SupabaseDataService dataService;

    private UUID ownerAId;
    private UUID ownerBId;
    private UUID player1UserId;
    private UUID player1ClienteId;
    private UUID player2UserId;
    private UUID player2ClienteId;

    private String tokenPlayer1;
    private String tokenPlayer2;
    private String tokenOwnerB;

    @BeforeEach
    void setup() {
        var ds = new SingleConnectionDataSource(
                "jdbc:h2:mem:review_privacy_test_" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1;MODE=PostgreSQL",
                "sa",
                "",
                true);
        jdbc = new JdbcTemplate(ds);

        // Core schema
        jdbc.execute("""
                create table rol (
                    id_rol int primary key,
                    nombre varchar(50) not null,
                    estado char(1) not null
                )
                """);
        jdbc.execute("""
                create table usuario (
                    id_usuario uuid primary key,
                    id_rol int not null,
                    nombre varchar(100) not null,
                    correo varchar(120) not null,
                    telefono varchar(30),
                    contrasena_hash varchar(255) not null,
                    estado char(1) not null,
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
        jdbc.execute("create table cancha (id_cancha int primary key, id_sede int, nombre_numero varchar(100), estado char(1))");
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
                    id_reserva int not null unique,
                    id_metodo_pago int,
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
                create table resena (
                    id_resena int generated by default as identity primary key,
                    id_sede int not null,
                    id_cliente uuid not null,
                    id_reserva int,
                    puntuacion int not null,
                    comentario varchar(2000),
                    es_sintetica boolean default false,
                    estado char(1) default 'A',
                    fecha_creacion timestamp default current_timestamp,
                    usucre varchar(40),
                    pccre varchar(40),
                    feccre timestamp default current_timestamp,
                    usmod varchar(40),
                    pcmod varchar(40),
                    fecmod timestamp
                )
                """);

        // Seed catalogs
        jdbc.update("insert into rol values (1, 'cliente', 'A'), (2, 'dueño', 'A'), (3, 'admin', 'A')");
        jdbc.update("insert into metodo_pago values (1, 'Efectivo', 'A'), (2, 'Tarjeta', 'A')");
        jdbc.update("insert into estado_reserva values (1, 'Pendiente', 'A'), (2, 'Confirmada', 'A'), (3, 'Completada', 'A'), (4, 'Cancelada', 'A')");

        // Seed users & clients
        ownerAId = UUID.randomUUID();
        ownerBId = UUID.randomUUID();
        player1UserId = UUID.randomUUID();
        player1ClienteId = UUID.randomUUID();
        player2UserId = UUID.randomUUID();
        player2ClienteId = UUID.randomUUID();

        jdbc.update("insert into usuario values (?, 2, 'Owner A', 'ownerA@canchero.pe', '900000001', 'hash', 'A', current_timestamp)", ownerAId);
        jdbc.update("insert into usuario values (?, 2, 'Owner B', 'ownerB@canchero.pe', '900000002', 'hash', 'A', current_timestamp)", ownerBId);
        jdbc.update("insert into usuario values (?, 1, 'Carlos Jugador', 'player1@canchero.pe', '900000003', 'hash', 'A', current_timestamp)", player1UserId);
        jdbc.update("insert into usuario values (?, 1, 'Mateo Goleador', 'player2@canchero.pe', '900000004', 'hash', 'A', current_timestamp)", player2UserId);

        jdbc.update("insert into cliente values (?, ?, 'DNI', '11111111', 'Carlos', 'Perez', '900000003', 'player1@canchero.pe', 'A', 'API', 'SPRING', current_timestamp, null, null, null)",
                player1ClienteId, player1UserId);
        jdbc.update("insert into cliente values (?, ?, 'DNI', '22222222', 'Mateo', 'Silva', '900000004', 'player2@canchero.pe', 'A', 'API', 'SPRING', current_timestamp, null, null, null)",
                player2ClienteId, player2UserId);

        // Sedes & Canchas
        jdbc.update("insert into sede values (10, ?, 'Sede Norte Los Olivos', 'A')", ownerAId.toString());
        jdbc.update("insert into sede values (20, ?, 'Sede Sur Miraflores', 'A')", ownerBId.toString());

        jdbc.update("insert into cancha values (101, 10, 'Cancha Sintética 1', 'A')");
        jdbc.update("insert into cancha values (201, 20, 'Cancha Sintética 2', 'A')");

        // Reservas:
        // Reserva 101: Sede 10, Player 1, Completada (con pase secreto PASE-SECRET-101)
        jdbc.update("""
                insert into reserva (id_reserva, id_cliente, id_cancha, id_estado_reserva, id_usuario, fecha_reserva, hora_inicio, hora_fin, monto_total, adelanto, saldo, codigo_pase, estado)
                values (101, ?, 101, 3, ?, '2026-10-15', '18:00:00', '19:00:00', 120.0, 120.0, 0.0, 'PASE-SECRET-101', 'A')
                """, player1ClienteId, player1UserId);

        // Reserva 102: Sede 10, Player 1, Confirmada (no completada aún, pase PASE-ACTIVE-102)
        jdbc.update("""
                insert into reserva (id_reserva, id_cliente, id_cancha, id_estado_reserva, id_usuario, fecha_reserva, hora_inicio, hora_fin, monto_total, adelanto, saldo, codigo_pase, estado)
                values (102, ?, 101, 2, ?, '2026-10-25', '19:00:00', '20:00:00', 120.0, 120.0, 0.0, 'PASE-ACTIVE-102', 'A')
                """, player1ClienteId, player1UserId);

        // Reserva 103: Sede 10, Cancelada / Inactiva
        jdbc.update("""
                insert into reserva (id_reserva, id_cliente, id_cancha, id_estado_reserva, id_usuario, fecha_reserva, hora_inicio, hora_fin, monto_total, adelanto, saldo, codigo_pase, estado)
                values (103, ?, 101, 4, ?, '2026-10-10', '10:00:00', '11:00:00', 100.0, 0.0, 100.0, 'PASE-CANCEL-103', 'I')
                """, player1ClienteId, player1UserId);

        // Reserva 201: Sede 20, Player 2, Completada (Sede de Owner B, pase PASE-VENUE-B)
        jdbc.update("""
                insert into reserva (id_reserva, id_cliente, id_cancha, id_estado_reserva, id_usuario, fecha_reserva, hora_inicio, hora_fin, monto_total, adelanto, saldo, codigo_pase, estado)
                values (201, ?, 201, 3, ?, '2026-10-14', '20:00:00', '21:00:00', 140.0, 140.0, 0.0, 'PASE-VENUE-B-201', 'A')
                """, player2ClienteId, player2UserId);

        // Pago Reserva 101 (contiene detalles confidenciales)
        jdbc.update("""
                insert into pago_reserva (id_pago_reserva, id_reserva, id_metodo_pago, monto, fecha_pago, numero_operacion, es_adelanto, comision_plataforma, monto_neto_dueno, estado_liquidacion, estado)
                values (501, 101, 2, 120.0, current_timestamp, 'CARD-AUTH-999888777', true, 6.0, 114.0, 'Liquidado', 'A')
                """);

        // Pre-exist review on Sede 10 for Reserva 101
        jdbc.update("""
                insert into resena (id_sede, id_cliente, id_reserva, puntuacion, comentario, estado)
                values (10, ?, 101, 5, 'Excelente césped y atención de primera', 'A')
                """, player1ClienteId);

        // Services & Tokens
        tokenService = new AuthTokenService("test-fase4-secret-key-canchero-token-xyz-123456");
        dataService = new SupabaseDataService(jdbc, tokenService);

        tokenPlayer1 = tokenService.issue(player1UserId, true);
        tokenPlayer2 = tokenService.issue(player2UserId, true);
        tokenOwnerB = tokenService.issue(ownerBId, true);

        mvc = MockMvcBuilders.standaloneSetup(
                        new ReviewController(dataService),
                        new BookingController(dataService))
                .addInterceptors(new ApiAuthorizationInterceptor(tokenService, dataService))
                .build();
    }

    @Test
    void publicReviewListExcludesPassCodeAndPrivateData() throws Exception {
        mvc.perform(get("/api/reviews/sede/10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].clienteNombre").value("Carlos Perez"))
                .andExpect(jsonPath("$[0].puntuacion").value(5))
                .andExpect(jsonPath("$[0].comentario").value("Excelente césped y atención de primera"))
                .andExpect(jsonPath("$[0].reservaCodigoPase").doesNotExist())
                .andExpect(jsonPath("$[0].codigoPase").doesNotExist())
                .andExpect(jsonPath("$[0].dni").doesNotExist())
                .andExpect(jsonPath("$[0].telefono").doesNotExist())
                .andExpect(jsonPath("$[0].total").doesNotExist())
                .andExpect(jsonPath("$[0].saldo").doesNotExist());
    }

    @Test
    void cannotDerivePassCodesFromReviewsToQueryPassEndpoint() throws Exception {
        // Public user reads reviews of Sede 10
        String responseContent = mvc.perform(get("/api/reviews/sede/10"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // The response must NEVER contain the pass code "PASE-SECRET-101"
        org.junit.jupiter.api.Assertions.assertFalse(responseContent.contains("PASE-SECRET-101"));
        org.junit.jupiter.api.Assertions.assertFalse(responseContent.contains("PASE-"));

        // Attempting to query pass using review id or arbitrary text must return 404
        mvc.perform(get("/api/bookings/pase/1"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Pase no encontrado"));
    }

    @Test
    void publicPassLookupReturnsMinimalVerificationDataWithoutFinancialLeaks() throws Exception {
        mvc.perform(get("/api/bookings/pase/PASE-SECRET-101"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value("101"))
                .andExpect(jsonPath("$.codigoPase").value("PASE-SECRET-101"))
                .andExpect(jsonPath("$.venueName").value("Sede Norte Los Olivos"))
                .andExpect(jsonPath("$.courtName").value("Cancha Sintética 1"))
                .andExpect(jsonPath("$.fecha").value("2026-10-15"))
                .andExpect(jsonPath("$.horario").value("18:00 - 19:00"))
                .andExpect(jsonPath("$.status").value("Completada"))
                .andExpect(jsonPath("$.titularNombre").value("Carlos"))
                // Assert financial and sensitive details are completely excluded
                .andExpect(jsonPath("$.total").doesNotExist())
                .andExpect(jsonPath("$.paidAmount").doesNotExist())
                .andExpect(jsonPath("$.balanceAmount").doesNotExist())
                .andExpect(jsonPath("$.paymentStatus").doesNotExist())
                .andExpect(jsonPath("$.paymentMethod").doesNotExist())
                .andExpect(jsonPath("$.paymentOperationNumber").doesNotExist())
                .andExpect(jsonPath("$.idempotencyKey").doesNotExist())
                .andExpect(jsonPath("$.retentionStatus").doesNotExist())
                .andExpect(jsonPath("$.tranches").doesNotExist())
                .andExpect(jsonPath("$.jugadores").doesNotExist());
    }

    @Test
    void nonExistentOrInvalidPassCodeResponds404() throws Exception {
        mvc.perform(get("/api/bookings/pase/PASE-INEXISTENTE-999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Pase no encontrado"));
    }

    @Test
    void cancelledOrInactiveReservationPassResponds404() throws Exception {
        // Reserva 103 has estado = 'I'
        mvc.perform(get("/api/bookings/pase/PASE-CANCEL-103"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.message").value("Pase no encontrado"));
    }

    @Test
    void unauthenticatedReviewCreationRejectedWith401() throws Exception {
        mvc.perform(post("/api/reviews")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sedeId": 10,
                            "puntuacion": 5,
                            "comentario": "Intento de reseña anónima"
                        }
                        """))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reviewCreationForAnotherPlayersReservationRejectedWith403() throws Exception {
        // Player 2 attempts to post a review for Reservation 101 belonging to Player 1
        mvc.perform(post("/api/reviews")
                .header("Authorization", "Bearer " + tokenPlayer2)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sedeId": 10,
                            "reservaId": "101",
                            "puntuacion": 4,
                            "comentario": "Reseña sobre reserva ajena"
                        }
                        """))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.message").value("No puedes calificar una reserva ajena"));

        // Verify no second review was inserted for Sede 10
        assertEquals(1, jdbc.queryForObject("select count(*) from resena where id_sede = 10", Integer.class));
    }

    @Test
    void reviewCreationForNonFinalizedReservationRejectedWith400() throws Exception {
        // Player 1 attempts to review Reservation 102 which is still 'Confirmada' (not completed)
        mvc.perform(post("/api/reviews")
                .header("Authorization", "Bearer " + tokenPlayer1)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sedeId": 10,
                            "reservaId": "102",
                            "puntuacion": 5,
                            "comentario": "Partido que aún no juego"
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Solo reservas finalizadas pueden calificarse"));
    }

    @Test
    void reviewCreationForReservationOfDifferentVenueRejectedWith400() throws Exception {
        // Player 2 has completed Reservation 201 at Sede 20, but specifies sedeId = 10
        mvc.perform(post("/api/reviews")
                .header("Authorization", "Bearer " + tokenPlayer2)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sedeId": 10,
                            "reservaId": "201",
                            "puntuacion": 5,
                            "comentario": "Calificando sede incorrecta"
                        }
                        """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("La reserva no corresponde a esta sede"));
    }

    @Test
    void duplicateReviewForSameReservationRejectedWith409() throws Exception {
        // Reservation 101 was already reviewed in setup
        mvc.perform(post("/api/reviews")
                .header("Authorization", "Bearer " + tokenPlayer1)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "sedeId": 10,
                            "reservaId": "101",
                            "puntuacion": 5,
                            "comentario": "Segunda reseña para el mismo partido"
                        }
                        """))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value("Ya calificaste esta reserva"));
    }

    @Test
    void missingOrManualReservationIsRejectedWithoutAnyClientOrReviewWrite() throws Exception {
        int clients = jdbc.queryForObject("select count(*) from cliente", Integer.class);
        int reviews = jdbc.queryForObject("select count(*) from resena", Integer.class);
        for (String reservation : new String[] { "null", "\"\"", "\"manual\"", "\"invalid\"" }) {
            mvc.perform(post("/api/reviews")
                    .header("Authorization", "Bearer " + tokenPlayer1)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"sedeId\":10,\"reservaId\":" + reservation + ",\"puntuacion\":5,\"comentario\":\"Prueba sin reserva\"}"))
                    .andExpect(status().isBadRequest());
        }
        assertEquals(clients, jdbc.queryForObject("select count(*) from cliente", Integer.class));
        assertEquals(reviews, jdbc.queryForObject("select count(*) from resena", Integer.class));
    }

    @Test
    void legitimateReviewCreationByTitularSucceedsWithNoPassLeak() throws Exception {
        // Create a completed reservation 202 for Player 2 at Sede 20
        jdbc.update("""
                insert into reserva (id_reserva, id_cliente, id_cancha, id_estado_reserva, id_usuario, fecha_reserva, hora_inicio, hora_fin, monto_total, adelanto, saldo, codigo_pase, estado)
                values (202, ?, 201, 3, ?, '2026-10-16', '19:00:00', '20:00:00', 140.0, 140.0, 0.0, 'PASE-TITULAR-202', 'A')
                """, player2ClienteId, player2UserId);

        mvc.perform(post("/api/reviews")
                .header("Authorization", "Bearer " + tokenPlayer2)
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                        {
                            "venueId": 20,
                            "bookingId": "202",
                            "puntuacion": 5,
                            "comentario": "Gran partido nocturno, luces perfectas"
                        }
                        """))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.clienteNombre").value("Mateo Silva"))
                .andExpect(jsonPath("$.puntuacion").value(5))
                .andExpect(jsonPath("$.comentario").value("Gran partido nocturno, luces perfectas"))
                .andExpect(jsonPath("$.reservaCodigoPase").doesNotExist())
                .andExpect(jsonPath("$.codigoPase").doesNotExist());

        // Also verify the public list endpoint for Sede 20 returns it without any pass code
        mvc.perform(get("/api/reviews/sede/20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$", hasSize(1)))
                .andExpect(jsonPath("$[0].reservaCodigoPase").doesNotExist())
                .andExpect(jsonPath("$[0].codigoPase").doesNotExist());
    }

    @Test
    void competitorOwnerCannotHarvestPassesOrAccessPrivateDataFromOtherVenues() throws Exception {
        // Owner B queries public reviews of Owner A's venue (Sede 10)
        String reviewsOfVenueA = mvc.perform(get("/api/reviews/sede/10")
                .header("Authorization", "Bearer " + tokenOwnerB))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();

        // Must NOT contain pass codes
        org.junit.jupiter.api.Assertions.assertFalse(reviewsOfVenueA.contains("PASE-SECRET-101"));
        org.junit.jupiter.api.Assertions.assertFalse(reviewsOfVenueA.contains("PASE-"));

        // Even with owner credentials, Owner B cannot look up private booking data via pass
        // because the pass endpoint only yields minimal gatekeeper info (no payment or financial info)
        mvc.perform(get("/api/bookings/pase/PASE-SECRET-101")
                .header("Authorization", "Bearer " + tokenOwnerB))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.total").doesNotExist())
                .andExpect(jsonPath("$.paidAmount").doesNotExist())
                .andExpect(jsonPath("$.paymentStatus").doesNotExist());
    }
}
