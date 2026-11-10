package pe.canchero.backend.service;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.it.PostgresTestServer;
import pe.canchero.backend.it.PostgresTestSupport;
import pe.canchero.backend.web.dto.AuthUserDto;
import static org.junit.jupiter.api.Assertions.*;
import static pe.canchero.backend.it.PostgresTestSupport.*;

/** Ejecuta la misma migracion de Supabase en PostgreSQL local efimero. Nunca escribe fixtures remotos. */
class TenantRolesPostgresTest {
    JdbcTemplate jdbc;
    TenantPermissions permissions;
    TeamService team;
    AuthUserDto staff;

    @BeforeEach
    void setup() throws Exception {
        PostgresTestServer.requireAvailable();
        PostgresTestServer.resetSchema();
        jdbc=PostgresTestSupport.jdbc();
        seedTwoVenues(jdbc);
        jdbc.execute("create sequence rol_migration_seq start 100");
        jdbc.execute("alter table rol alter column id_rol set default nextval('rol_migration_seq')");
        jdbc.execute("alter table rol add column usucre varchar(100) default 'TEST'");
        jdbc.execute("alter table rol add column usmod varchar(100), add column pcmod varchar(100), add column fecmod timestamp");
        jdbc.execute("alter table usuario add column apellido varchar(100) default ''");
        jdbc.execute("DO $$ BEGIN IF NOT EXISTS(select 1 from pg_roles where rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(select 1 from pg_roles where rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$");
        Path root=Path.of(System.getProperty("user.dir")).toAbsolutePath();
        while(root!=null && !Files.exists(root.resolve("docs/sql/2026-11-07_negocios_roles_sede.sql")))root=root.getParent();
        assertNotNull(root,"No se encontro la migracion real");
        String sql=Files.readString(root.resolve("docs/sql/2026-11-07_negocios_roles_sede.sql"));
        jdbc.execute(sql);
        permissions=new TenantPermissions(jdbc);
        team=new TeamService(jdbc);
        staff=PLAYER_1; // La asignacion operativa no sustituye el rol personal del usuario.
    }

    @Test
    void ownersStayIsolatedAcrossEveryPermission() {
        List<String> codes=jdbc.queryForList("select codigo from permiso_sede",String.class);
        for(String code:codes){
            assertTrue(permissions.has(OWNER_A,VENUE_A,code),code);
            assertFalse(permissions.has(OWNER_A,VENUE_B,code),code);
            assertTrue(permissions.has(OWNER_B,VENUE_B,code),code);
            assertFalse(permissions.has(OWNER_B,VENUE_A,code),code);
        }
        assertFalse(permissions.has(OWNER_A,VENUE_A,"permiso.inventado"));
    }

    @Test
    void cashierHasSalesButNeitherInventoryNorForeignVenues() {
        team.assign(VENUE_A,new TeamService.Assignment(staff.email(),"cajero"),OWNER_A);
        assertTrue(permissions.has(staff,VENUE_A,"venta.crear"));
        assertTrue(permissions.has(staff,VENUE_A,"caja.operar"));
        assertFalse(permissions.has(staff,VENUE_A,"inventario.ingresar"));
        assertFalse(permissions.has(staff,VENUE_A,"personal.gestionar"));
        assertFalse(permissions.has(staff,VENUE_A,"caja.supervisar"));
        assertFalse(permissions.has(staff,VENUE_B,"venta.crear"));
    }

    @Test
    void warehouseAndAssistantCannotCollectMoney() {
        long assignment=team.assign(VENUE_A,new TeamService.Assignment(staff.email(),"almacen"),OWNER_A);
        assertTrue(permissions.has(staff,VENUE_A,"inventario.ingresar"));
        assertFalse(permissions.has(staff,VENUE_A,"caja.operar"));
        assertFalse(permissions.has(staff,VENUE_A,"venta.crear"));
        team.revoke(assignment,OWNER_A);
        assertFalse(permissions.has(staff,VENUE_A,"inventario.ingresar"));
        team.assign(VENUE_A,new TeamService.Assignment(staff.email(),"ayudante"),OWNER_A);
        assertTrue(permissions.has(staff,VENUE_A,"reserva.agenda"));
        assertFalse(permissions.has(staff,VENUE_A,"reserva.ver"));
        assertTrue(permissions.has(staff,VENUE_A,"pase.verificar"));
        assertFalse(permissions.has(staff,VENUE_A,"caja.operar"));
        assertFalse(permissions.has(staff,VENUE_A,"reserva.cancelar"));
    }

    @Test
    void adminRequiresAnAssignmentAndCannotBecomeGlobalOrOwner() {
        var admin=new AuthUserDto(staff.id(),staff.nombre(),staff.email(),staff.telefono(),"admin");
        assertFalse(permissions.has(admin,VENUE_A,"sede.editar"));
        team.assign(VENUE_A,new TeamService.Assignment(staff.email(),"admin"),OWNER_A);
        assertTrue(permissions.has(admin,VENUE_A,"sede.editar"));
        assertFalse(permissions.has(admin,VENUE_A,"sede.eliminar"));
        assertFalse(permissions.has(admin,VENUE_B,"sede.editar"));
        assertThrows(ResponseStatusException.class,()->team.assign(VENUE_B,new TeamService.Assignment(staff.email(),"admin"),admin));
        assertThrows(ResponseStatusException.class,()->team.assign(VENUE_A,new TeamService.Assignment(staff.email(),"superadmin"),admin));
        assertThrows(ResponseStatusException.class,()->new UserService(jdbc).listAllUsers(admin));
    }

    @Test
    void compositeKeysRejectCrossBusinessAssignmentsAndRevocationIsImmediate() {
        long assignment=team.assign(VENUE_A,new TeamService.Assignment(staff.email(),"cajero"),OWNER_A);
        Long member=jdbc.queryForObject("select id_miembro from asignacion_sede where id_asignacion=?",Long.class,assignment);
        Long business=jdbc.queryForObject("select id_negocio from sede where id_sede=?",Long.class,VENUE_B);
        assertThrows(DataIntegrityViolationException.class,()->jdbc.update("insert into asignacion_sede(id_miembro,id_negocio,id_sede,rol_codigo) values(?,?,?,'admin')",member,business,VENUE_B));
        assertThrows(ResponseStatusException.class,()->team.revoke(assignment,OWNER_B));
        team.revoke(assignment,OWNER_A);
        assertFalse(permissions.has(staff,VENUE_A,"venta.crear"));
        assertEquals("cliente",jdbc.queryForObject("select r.nombre from usuario u join rol r on r.id_rol=u.id_rol where u.id_usuario=?",String.class,UUID.fromString(staff.id())));
    }

    @Test
    void inactiveMembershipOrBusinessDoesNotKeepPermissions() {
        team.assign(VENUE_A,new TeamService.Assignment(staff.email(),"admin"),OWNER_A);
        jdbc.update("update miembro_negocio set estado='I' where id_usuario=?",UUID.fromString(staff.id()));
        assertFalse(permissions.has(staff,VENUE_A,"sede.editar"));
        jdbc.update("update negocio set estado='I' where id_dueno=?",OWNER_A_ID);
        assertFalse(permissions.has(OWNER_A,VENUE_A,"caja.operar"));
    }

    @Test
    void cashierCannotUseSomeoneElsesTurnButCanSellInOwnTurn() {
        team.assign(VENUE_A,new TeamService.Assignment(staff.email(),"cajero"),OWNER_A);
        try(var app=PostgresTestSupport.newApp()) {
            int session=openSession(app,BOX_A,OWNER_A,100);
            var request=sale(VENUE_A,session,staff,"roles-sale",PRODUCT_A,1,"tarjeta",null,
                    List.of(new pe.canchero.backend.web.dto.SalePaymentDto("tarjeta",new java.math.BigDecimal("2.50"),new java.math.BigDecimal("2.50"))));
            assertThrows(ResponseStatusException.class,()->app.pos().processSale(request));
            assertEquals(40,app.pos().listProducts(VENUE_A).get(0).stock());
            jdbc.update("update sesion_caja set id_usuario=? where id_sesion_caja=?",UUID.fromString(staff.id()),session);
            assertEquals(2.5,app.pos().processSale(request).total());
            assertEquals(39,app.pos().listProducts(VENUE_A).get(0).stock());
        }
    }

    @Test
    void sameOwnerCannotMixSaleAndCashSessionFromTwoDifferentVenues() {
        jdbc.update("update sede set id_dueno=? where id_sede=?",OWNER_A_ID,VENUE_B);
        try(var app=PostgresTestSupport.newApp()) {
            int sessionA=openSession(app,BOX_A,OWNER_A,100);
            var request=sale(VENUE_B,sessionA,OWNER_A,"roles-mixed-session",PRODUCT_B,1,"tarjeta",null,
                    List.of(new pe.canchero.backend.web.dto.SalePaymentDto("tarjeta",new java.math.BigDecimal("3.00"),new java.math.BigDecimal("3.00"))));
            assertThrows(ResponseStatusException.class,()->app.pos().processSale(request));
            assertEquals(30,app.pos().listProducts(VENUE_B).get(0).stock());
            assertTrue(app.pos().listSales(VENUE_B).isEmpty());
        }
    }

    @Test
    void membershipAllowsHttpAccessWithoutChangingPersonalRole() throws Exception {
        long id=team.assign(VENUE_A,new TeamService.Assignment(staff.email(),"cajero"),OWNER_A);
        var tokens=new AuthTokenService("local-tenant-test-secret");
        var auth=new AuthService(jdbc,tokens);
        try(var app=PostgresTestSupport.newApp()) {
            var mvc=org.springframework.test.web.servlet.setup.MockMvcBuilders.standaloneSetup(
                    new pe.canchero.backend.web.controller.PosController(app.pos(),app.access()),
                    new pe.canchero.backend.web.controller.TeamController(team))
                    .setControllerAdvice(new pe.canchero.backend.web.controller.ApiExceptionHandler())
                    .addInterceptors(new pe.canchero.backend.config.ApiAuthorizationInterceptor(tokens,auth)).build();
            String bearer="Bearer "+tokens.issue(UUID.fromString(staff.id()),true);
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/pos/products?sedeId="+VENUE_A).header("Authorization",bearer))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isOk());
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/pos/inventory?sedeId="+VENUE_A).header("Authorization",bearer))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/pos/products?sedeId="+VENUE_B).header("Authorization",bearer))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
            team.revoke(id,OWNER_A);
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/pos/products?sedeId="+VENUE_A).header("Authorization",bearer))
                    .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers.status().isForbidden());
        }
    }

    @Test
    void salesBookingsAndCashStayIsolatedWithTheActualNewSchema() {
        try(var app=PostgresTestSupport.newApp()) {
            int sessionA=openSession(app,BOX_A,OWNER_A,100);
            int sessionB=openSession(app,BOX_B,OWNER_B,100);
            var booking=app.data().createBooking(booking(String.valueOf(COURT_A),VENUE_A,PLAYER_1,"roles-booking"),PLAYER_1,"roles-booking");
            assertEquals(booking.id(),app.data().listBookings(String.valueOf(VENUE_A),OWNER_A).get(0).id());
            assertThrows(ResponseStatusException.class,()->app.data().listBookings(String.valueOf(VENUE_A),OWNER_B));
            assertThrows(ResponseStatusException.class,()->app.data().cancelBooking(Integer.parseInt(booking.id()),OWNER_B));
            assertThrows(ResponseStatusException.class,()->app.access().requireOwnedSession(sessionA,OWNER_B));
            assertThrows(ResponseStatusException.class,()->app.access().requireOpenOwnedSession(sessionB,OWNER_A));
            assertEquals(1,app.pos().listProducts(VENUE_A).size());
            assertEquals(1,app.pos().listProducts(VENUE_B).size());
            assertThrows(ResponseStatusException.class,()->new VenueAccessService(jdbc).requirePermission(VENUE_B,OWNER_A,"producto.ver"));
        }
    }
}
