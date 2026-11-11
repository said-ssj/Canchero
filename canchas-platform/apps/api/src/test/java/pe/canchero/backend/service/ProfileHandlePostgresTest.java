package pe.canchero.backend.service;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.it.*;
import static pe.canchero.backend.it.PostgresTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;
class ProfileHandlePostgresTest {
 JdbcTemplate jdbc;ProfileHandleService handles;TransactionTemplate transaction;
 @BeforeEach void setup() throws Exception {
  PostgresTestServer.requireAvailable();PostgresTestServer.resetSchema();jdbc=PostgresTestSupport.jdbc();seedTwoVenues(jdbc);
  jdbc.execute("DO $$ BEGIN IF NOT EXISTS(select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(select 1 from pg_roles where rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$");
  jdbc.execute(Files.readString(Path.of("../../docs/sql/perfiles_comunidad.sql")));
  jdbc.execute(Files.readString(Path.of("../../supabase/migrations/20261111090000_identificador_perfil.sql")));
  handles=new ProfileHandleService(jdbc);transaction=new TransactionTemplate(new DataSourceTransactionManager(jdbc.getDataSource()));
 }
 @Test void initialChoicePersistsAndCannotChangeAgain(){
  assertTrue(handles.state(PLAYER_1).canChange());
  var state=transaction.execute(s->handles.change(PLAYER_1,"@Jugador_1"));
  assertEquals("jugador_1",state.handle());assertFalse(state.canChange());assertNotNull(state.nextChangeAt());
  assertThrows(ResponseStatusException.class,()->transaction.execute(s->handles.change(PLAYER_1,"otro_identificador")));
  assertEquals(state.nextChangeAt(),transaction.execute(s->handles.change(PLAYER_1,"jugador_1")).nextChangeAt());
  assertNull(handles.state(PLAYER_2).handle());
 }
 @Test void uniquenessAndValidationDoNotModifyOtherUsers(){
  transaction.execute(s->handles.change(PLAYER_1,"persona_real"));
  assertThrows(ResponseStatusException.class,()->transaction.execute(s->handles.change(PLAYER_2,"persona_real")));
  assertThrows(ResponseStatusException.class,()->transaction.execute(s->handles.change(PLAYER_2,"<script>")));
  assertNull(handles.state(PLAYER_2).handle());
 }
 @Test void databaseRejectsBypassAndKeepsTimestampOnUnrelatedChanges(){
  transaction.execute(s->handles.change(PLAYER_1,"jugador_uno"));
  var before=handles.state(PLAYER_1);
  assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("update perfil_comunidad set identificador='otro',identificador_cambiado_en=now()-interval '1 year' where id_usuario=?",PLAYER_1_ID));
  jdbc.update("update perfil_comunidad set biografia='Nueva bio',identificador_cambiado_en=null where id_usuario=?",PLAYER_1_ID);
  assertEquals(before.nextChangeAt(),handles.state(PLAYER_1).nextChangeAt());
  assertThrows(org.springframework.dao.DataIntegrityViolationException.class,()->jdbc.update("update perfil_comunidad set identificador=null where id_usuario=?",PLAYER_1_ID));
 }
 @Test void unlocksAfterThreeCalendarMonthsAndKeepsPrivateRls(){
  transaction.execute(s->handles.change(PLAYER_1,"jugador_uno"));
  // Only the isolated test owner can disable a trigger to seed a historical date.
  jdbc.execute("alter table perfil_comunidad disable trigger perfil_identificador_cambio");
  jdbc.update("update perfil_comunidad set identificador_cambiado_en=now()-interval '3 months 1 day' where id_usuario=?",PLAYER_1_ID);
  jdbc.execute("alter table perfil_comunidad enable trigger perfil_identificador_cambio");
  assertTrue(handles.state(PLAYER_1).canChange());
  assertEquals("nuevo_identificador",transaction.execute(s->handles.change(PLAYER_1,"nuevo_identificador")).handle());
  assertFalse(handles.state(PLAYER_1).canChange());
  assertTrue(jdbc.queryForObject("select relrowsecurity from pg_class where oid='public.perfil_comunidad'::regclass",Boolean.class));
  assertFalse(jdbc.queryForObject("select has_table_privilege('anon','public.perfil_comunidad','UPDATE')",Boolean.class));
 }
 @Test void concurrentChangesOfSameAccountAllowOnlyOneCommit() throws Exception {
  var start=new java.util.concurrent.CountDownLatch(1);
  try(var executor=java.util.concurrent.Executors.newFixedThreadPool(2)){
   java.util.concurrent.Callable<Boolean> first=()->{start.await();try{transaction.execute(t->handles.change(PLAYER_1,"primer_nombre"));return true;}catch(ResponseStatusException e){return false;}};
   java.util.concurrent.Callable<Boolean> second=()->{start.await();try{transaction.execute(t->handles.change(PLAYER_1,"segundo_nombre"));return true;}catch(ResponseStatusException e){return false;}};
   var a=executor.submit(first);var b=executor.submit(second);start.countDown();
   assertNotEquals(a.get(10,java.util.concurrent.TimeUnit.SECONDS),b.get(10,java.util.concurrent.TimeUnit.SECONDS));
   assertFalse(handles.state(PLAYER_1).canChange());
  }
 }
 @Test void usesCalendarMonthsInsteadOfNinetyDays(){
  assertEquals("2027-04-30",jdbc.queryForObject("select (timestamp '2027-01-31 12:00' + interval '3 months')::date::text",String.class));
 }

}
