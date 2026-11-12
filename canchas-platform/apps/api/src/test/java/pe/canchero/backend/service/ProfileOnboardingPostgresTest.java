package pe.canchero.backend.service;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.it.*;
import pe.canchero.backend.web.controller.PlayerProfileController;
import static org.junit.jupiter.api.Assertions.*;
import static pe.canchero.backend.it.PostgresTestSupport.*;

class ProfileOnboardingPostgresTest {
 JdbcTemplate jdbc;PlayerProfileController profiles;AnnotationConfigApplicationContext context;
 @Configuration @EnableTransactionManagement static class Transactions{}
 @BeforeEach void setup()throws Exception{
  PostgresTestServer.requireAvailable();PostgresTestServer.resetSchema();jdbc=PostgresTestSupport.jdbc();seedTwoVenues(jdbc);
  jdbc.execute("alter table usuario add column apellido varchar(80); create table perfil_jugador(id_usuario uuid primary key references usuario(id_usuario),direccion text,foto text,id_distrito integer);");
  jdbc.execute("DO $$ BEGIN IF NOT EXISTS(select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(select 1 from pg_roles where rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$");
  jdbc.execute(Files.readString(Path.of("../../docs/sql/perfiles_comunidad.sql")));
  jdbc.execute(Files.readString(Path.of("../../supabase/migrations/20261111090000_identificador_perfil.sql")));
  context=new AnnotationConfigApplicationContext();context.register(Transactions.class);context.registerBean(JdbcTemplate.class,()->jdbc);context.registerBean(DataSourceTransactionManager.class,()->new DataSourceTransactionManager(jdbc.getDataSource()));context.registerBean(PlayerProfileController.class);context.refresh();profiles=context.getBean(PlayerProfileController.class);
 }
 @AfterEach void close(){if(context!=null)context.close();}
 PlayerProfileController.Profile data(String handle){return new PlayerProfileController.Profile("Nombres completos","Apellidos completos","","",null,true,null,handle);}
 @Test void firstAccessRequiresFullNameAndChosenHandleButOptionalFieldsCanBeEmpty(){
  assertFalse(profiles.profile(PLAYER_1).completo());assertNull(profiles.profile(PLAYER_1).handle());
  var saved=profiles.save(PLAYER_1,data("@Mi_Usuario"));assertTrue(saved.completo());assertEquals("mi_usuario",saved.handle());assertNull(saved.idDistrito());assertEquals("Apellidos completos",saved.apellido());
  assertFalse(new ProfileHandleService(jdbc).state(PLAYER_1).canChange());
 }
 @Test void duplicateHandleRollsBackTheEntireProfileAndDoesNotInventAnIdentifier(){
  profiles.save(PLAYER_1,data("unico"));
  String old=jdbc.queryForObject("select nombre from usuario where id_usuario=?",String.class,PLAYER_2_ID);
  assertEquals(409,assertThrows(ResponseStatusException.class,()->profiles.save(PLAYER_2,data("UNICO"))).getStatusCode().value());
  assertEquals(old,jdbc.queryForObject("select nombre from usuario where id_usuario=?",String.class,PLAYER_2_ID));
  assertFalse(profiles.profile(PLAYER_2).completo());assertNull(profiles.profile(PLAYER_2).handle());
 }
 @Test void cannotMarkIncompleteDataCompleteAndExistingHandleIsPreservedForOldClients(){
  assertEquals(400,assertThrows(ResponseStatusException.class,()->profiles.save(PLAYER_1,data(null))).getStatusCode().value());
  assertEquals(400,assertThrows(ResponseStatusException.class,()->profiles.save(PLAYER_1,new PlayerProfileController.Profile("Nombre","","","",null,true,null,"nombre"))).getStatusCode().value());
  profiles.save(PLAYER_1,data("actual"));
  var saved=profiles.save(PLAYER_1,new PlayerProfileController.Profile("Otros nombres","Apellidos","","",null,false,null));
  assertEquals("actual",saved.handle());assertTrue(saved.completo());
  assertEquals(409,assertThrows(ResponseStatusException.class,()->profiles.save(PLAYER_1,data("otro"))).getStatusCode().value());
 }
}
