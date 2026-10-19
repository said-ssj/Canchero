package pe.canchero.backend.service;

import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.controller.PosController;
import pe.canchero.backend.web.dto.*;
import static org.junit.jupiter.api.Assertions.*;

class PosIsolationTest {
    private JdbcTemplate jdbc;
    private SupabaseDataService data;
    private VenueAccessService access;
    private final AuthUserDto owner = new AuthUserDto("owner-a", "Owner A", "", "", "admin");

    @BeforeEach
    void setup() {
        jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:"+UUID.randomUUID()+";DB_CLOSE_DELAY=-1;MODE=PostgreSQL", "sa", ""));
        jdbc.execute("create table sede (id_sede int, id_dueno varchar, estado varchar)");
        jdbc.execute("create table categoria_producto (id_categoria int, nombre varchar)");
        jdbc.execute("create table producto (id_producto int, id_categoria int, codigo_barras varchar, nombre varchar, precio_compra numeric, precio_venta numeric, stock_minimo int, estado varchar)");
        jdbc.execute("create table kardex (id_kardex int, id_producto int, id_sede int, saldo_stock int, fecha timestamp, feccre timestamp, estado varchar)");
        jdbc.execute("create table caja (id_caja int, id_sede int, estado varchar)");
        jdbc.execute("create table sesion_caja (id_sesion_caja int, id_caja int, estado varchar, fecha_cierre timestamp)");
        jdbc.update("insert into sede values (1,'owner-a','A'),(2,'owner-a','A'),(3,'owner-b','A'),(4,'owner-a','A')");
        jdbc.update("insert into categoria_producto values (1,'General')");
        jdbc.update("insert into producto values (1,1,'a','Propio',2,3,1,'A'),(2,1,'b','Ajeno',2,3,1,'A'),(3,1,'c','Sin vinculo',2,3,1,'A')");
        jdbc.update("insert into kardex values (1,1,1,9,'2026-01-01',null,'A'),(2,1,1,0,'2026-01-02',null,'A'),(3,1,2,22,'2026-01-01',null,'A'),(4,2,3,88,'2026-01-01',null,'A'),(5,1,1,999,'2026-01-03',null,'I')");
        jdbc.update("insert into caja values (1,1,'A'),(2,3,'A')");
        jdbc.update("insert into sesion_caja values (10,1,'A',null),(20,2,'A',null),(30,1,'A',current_timestamp)");
        data = new SupabaseDataService(jdbc, null);
        access = new VenueAccessService(jdbc);
    }

    @Test
    void excludesGlobalAndForeignProductsWhileKeepingRealZeroStock() {
        var own = data.listProducts(1);
        assertEquals(1, own.size());
        assertEquals(1, own.get(0).id());
        assertEquals(1, own.get(0).sedeId());
        assertEquals(0, own.get(0).stock());
        assertEquals(22, data.listProducts(2).get(0).stock());
        assertEquals(88, data.listProducts(3).get(0).stock());
        assertTrue(data.listProducts(4).isEmpty());
        assertThrows(ResponseStatusException.class, () -> data.listProducts(null));
    }

    @Test
    void rejectsForeignVenueEvenForAdminAndDoesNotAcceptAnImplicitVenue() {
        assertEquals(1, access.requireOwnedVenue(1, owner));
        assertEquals(2, access.requireOwnedVenue(2, owner));
        assertEquals(403, assertThrows(ResponseStatusException.class, () -> access.requireOwnedVenue(3, owner)).getStatusCode().value());
        assertEquals(401, assertThrows(ResponseStatusException.class, () -> access.requireOwnedVenue(1, null)).getStatusCode().value());
        assertEquals(400, assertThrows(ResponseStatusException.class, () -> access.requireOwnedVenue(null, owner)).getStatusCode().value());
        assertEquals(404, assertThrows(ResponseStatusException.class, () -> access.requireOwnedVenue(999, owner)).getStatusCode().value());
    }

    @Test
    void allPosRoutesRejectAnotherOwnersVenueBeforeReadingOrWriting() {
        var controller = new PosController(data, access);
        assertThrows(ResponseStatusException.class, () -> controller.products(3, owner));
        assertThrows(ResponseStatusException.class, () -> controller.inventory(3, owner));
        assertThrows(ResponseStatusException.class, () -> controller.sales(3, owner));
        assertThrows(ResponseStatusException.class, () -> controller.inventoryEntry(new InventoryEntryRequest(1,1,1,"test",3), owner));
        assertThrows(ResponseStatusException.class, () -> controller.processSale(new ProcessSaleRequest(null,null,null,null,null,null,20,3,null,List.of()), owner));
        assertEquals(5, jdbc.queryForObject("select count(*) from kardex", Integer.class));
    }

    @Test
    void requiresAnOpenCashSessionInTheSelectedVenue() {
        assertDoesNotThrow(() -> access.requireOpenSession(10,1));
        for (Integer session : new Integer[]{null,20,30}) {
            assertEquals(409, assertThrows(ResponseStatusException.class, () -> access.requireOpenSession(session,1)).getStatusCode().value());
        }
    }
}
