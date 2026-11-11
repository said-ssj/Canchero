package pe.canchero.backend.service;
import java.nio.file.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.config.PasswordUtil;
import pe.canchero.backend.it.*;
import static pe.canchero.backend.it.PostgresTestSupport.*;
import static org.junit.jupiter.api.Assertions.*;
class AdminSettingsPostgresTest {
 JdbcTemplate jdbc;VenuePreferencesService preferences;AccountPasswordService passwords;
 @BeforeEach void setup() throws Exception {
  PostgresTestServer.requireAvailable();PostgresTestServer.resetSchema();jdbc=PostgresTestSupport.jdbc();seedTwoVenues(jdbc);
  jdbc.execute("DO $$ BEGIN IF NOT EXISTS(select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(select 1 from pg_roles where rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$");
  Path root=Path.of(System.getProperty("user.dir")).toAbsolutePath();while(root!=null&&!Files.exists(root.resolve("supabase/migrations/20261111062000_preferencias_sede.sql")))root=root.getParent();assertNotNull(root);
  jdbc.execute(Files.readString(root.resolve("supabase/migrations/20261111062000_preferencias_sede.sql")));
  preferences=new VenuePreferencesService(jdbc);passwords=new AccountPasswordService(jdbc);
 }
 @Test void persistsPreferencesWithoutChangingPublicIdentityOrOtherVenues(){
  var original=jdbc.queryForMap("select nombre,telefono from sede where id_sede=?",VENUE_A);
  preferences.save(VENUE_A,new VenuePreferencesService.Preferences(35,"Titular de prueba","999888777"),OWNER_A);
  var fresh=new VenuePreferencesService(jdbc).get(VENUE_A,OWNER_A);
  assertEquals(35,fresh.minimumDepositPercent());assertEquals("999888777",fresh.walletPhone());
  assertEquals(original,jdbc.queryForMap("select nombre,telefono from sede where id_sede=?",VENUE_A));
  assertEquals(50,preferences.get(VENUE_B,OWNER_B).minimumDepositPercent());
  preferences.save(VENUE_A,new VenuePreferencesService.Preferences(40,null,null),OWNER_A);
  assertEquals("Titular de prueba",preferences.get(VENUE_A,OWNER_A).walletHolder());
 }
 @Test void rejectsForeignOwnerAndInvalidValuesWithoutWriting(){
  assertThrows(ResponseStatusException.class,()->preferences.get(VENUE_A,OWNER_B));
  assertThrows(ResponseStatusException.class,()->preferences.save(VENUE_A,new VenuePreferencesService.Preferences(30,"Otro","999888777"),OWNER_B));
  assertThrows(ResponseStatusException.class,()->preferences.save(VENUE_A,new VenuePreferencesService.Preferences(5,null,null),OWNER_A));
  assertThrows(ResponseStatusException.class,()->preferences.save(VENUE_A,new VenuePreferencesService.Preferences(null,null,"123"),OWNER_A));
  assertEquals(50,preferences.get(VENUE_A,OWNER_A).minimumDepositPercent());
 }
 @Test void changesOnlyAuthenticatedPasswordAfterCheckingCurrentAndRejectsBadRequests(){
  String old=PasswordUtil.hash("ClaveAnterior2026!");
  jdbc.update("update usuario set password_hash=? where id_usuario=?",old,OWNER_A_ID);
  assertThrows(ResponseStatusException.class,()->passwords.change(OWNER_A,"Incorrecta","NuevaClave2026!"));
  assertEquals(old,jdbc.queryForObject("select password_hash from usuario where id_usuario=?",String.class,OWNER_A_ID));
  assertThrows(ResponseStatusException.class,()->passwords.change(OWNER_A,"ClaveAnterior2026!","short"));
  assertThrows(ResponseStatusException.class,()->passwords.change(OWNER_A,"ClaveAnterior2026!","😀".repeat(30)));
  passwords.change(OWNER_A,"ClaveAnterior2026!","NuevaClave2026!");
  String encoded=jdbc.queryForObject("select password_hash from usuario where id_usuario=?",String.class,OWNER_A_ID);
  assertTrue(PasswordUtil.matches("NuevaClave2026!",encoded));assertNotEquals(old,encoded);
  assertEquals("hash",jdbc.queryForObject("select password_hash from usuario where id_usuario=?",String.class,OWNER_B_ID));
 }
}
