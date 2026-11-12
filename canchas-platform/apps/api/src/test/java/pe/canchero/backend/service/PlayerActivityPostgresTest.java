package pe.canchero.backend.service;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.it.*;
import static org.junit.jupiter.api.Assertions.*;
import static pe.canchero.backend.it.PostgresTestSupport.*;

class PlayerActivityPostgresTest {
 JdbcTemplate jdbc; PlayerActivityService data;
 @BeforeEach void setup() throws Exception {
  PostgresTestServer.requireAvailable(); PostgresTestServer.resetSchema(); jdbc=PostgresTestSupport.jdbc(); seedTwoVenues(jdbc);
  jdbc.execute("DO $$ BEGIN IF NOT EXISTS(select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(select 1 from pg_roles where rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$");
  jdbc.execute(Files.readString(Path.of("../../supabase/migrations/20261112080000_favoritos_sede.sql")));
  data=new PlayerActivityService(jdbc);
 }
 @Test void favoritesArePersonalIdempotentAndClosedToDirectAccess(){
  data.favorite(PLAYER_1,VENUE_A,true);data.favorite(PLAYER_1,VENUE_A,true);
  assertEquals(java.util.List.of(String.valueOf(VENUE_A)),data.favorites(PLAYER_1));
  assertTrue(data.favorites(PLAYER_2).isEmpty());
  data.favorite(PLAYER_2,VENUE_A,false);assertEquals(1,data.favorites(PLAYER_1).size());
  assertFalse(jdbc.queryForObject("select has_table_privilege('authenticated','public.favorito_sede','SELECT')",Boolean.class));
  assertTrue(jdbc.queryForObject("select relrowsecurity from pg_class where oid='public.favorito_sede'::regclass",Boolean.class));
  data.favorite(PLAYER_1,VENUE_A,false);assertTrue(data.favorites(PLAYER_1).isEmpty());
  assertEquals(404,assertThrows(ResponseStatusException.class,()->data.favorite(PLAYER_1,999999,true)).getStatusCode().value());
 }
 @Test void paymentHistoryOnlyListsThePayerEvenForAnOwner(){
  jdbc.update("insert into reserva(id_reserva,id_cliente,id_usuario,id_cancha,id_estado_reserva,fecha_reserva,hora_inicio,hora_fin,monto_total,estado) values(700,?,?,?,4,'2026-11-12','10:00','11:00',90,'A')",CLIENT_1_ID,OWNER_A_ID,COURT_A);
  jdbc.update("insert into pago_reserva(id_reserva,id_metodo_pago,monto,numero_operacion,es_adelanto,estado) values(700,1,30,'QA-DEP',true,'A'),(700,2,60,'QA-BAL',false,'A')");
  var rows=data.payments(PLAYER_1,0).items();assertEquals(2,rows.size());
  assertEquals("700",rows.getFirst().bookingId());assertEquals("Sede A",rows.getFirst().venueName());
  assertEquals(0,new java.math.BigDecimal("90").compareTo(rows.stream().map(PlayerActivityService.Payment::amount).reduce(java.math.BigDecimal.ZERO,java.math.BigDecimal::add)));
  assertTrue(data.payments(PLAYER_2,0).items().isEmpty());assertTrue(data.payments(OWNER_A,0).items().isEmpty());
  assertThrows(ResponseStatusException.class,()->data.payments(PLAYER_1,-1));
 }
}
