package pe.canchero.backend.service;

import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.SQLException;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DelegatingDataSource;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import static org.junit.jupiter.api.Assertions.*;

class VenueCatalogQueriesTest {
    @Test
    void listsVenuesWithTwoQueriesRegardlessOfVenueCountAndPreservesDetailStates() {
        var statements = new AtomicInteger();
        var source = new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";MODE=PostgreSQL;DB_CLOSE_DELAY=-1", "sa", "");
        var counted = new DelegatingDataSource(source) {
            @Override public Connection getConnection() throws SQLException {
                var connection = super.getConnection();
                return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class},
                        (proxy, method, args) -> {
                            if (method.getName().equals("prepareStatement") || method.getName().equals("createStatement")) statements.incrementAndGet();
                            try { return method.invoke(connection, args); }
                            catch (InvocationTargetException ex) { throw ex.getCause(); }
                        });
            }
        };
        var jdbc = new JdbcTemplate(counted);
        jdbc.execute("create table provincia (id_provincia int primary key, nombre varchar(100))");
        jdbc.execute("create table distrito (id_distrito int primary key, id_provincia int, nombre varchar(100))");
        jdbc.execute("""
                create table sede (id_sede int primary key, nombre varchar(100), direccion varchar(100),
                telefono varchar(20), descripcion varchar(100), imagen_url varchar(100), id_dueno uuid,
                latitud double precision, longitud double precision, rating decimal(3,2), id_distrito int, estado char(1))
                """);
        jdbc.execute("create table tipo_cancha (id_tipo_cancha int primary key, nombre varchar(100))");
        jdbc.execute("""
                create table cancha (id_cancha int primary key, id_sede int, id_tipo_cancha int, nombre_numero varchar(100),
                techada boolean, foto_url varchar(100), superficie varchar(100), estado char(1))
                """);
        jdbc.execute("create table tarifa_cancha (id_cancha int, hora_inicio time, hora_fin time, precio decimal(10,2), estado char(1))");
        jdbc.update("insert into provincia values (1, 'Ica')");
        jdbc.update("insert into distrito values (1, 1, 'Distrito')");
        jdbc.update("insert into tipo_cancha values (1, 'Futbol 7')");
        for (int id = 1; id <= 20; id++) {
            jdbc.update("insert into sede (id_sede, nombre, rating, id_distrito, estado) values (?, ?, 4, 1, 'A')", id, "Sede " + id);
            jdbc.update("insert into cancha values (?, ?, 1, 'Cancha', false, null, 'Grass', 'A')", id, id);
        }
        jdbc.update("insert into cancha values (99, 1, 1, 'Mantenimiento', false, null, 'Grass', 'I')");
        var service = new SupabaseDataService(jdbc, null);
        statements.set(0);
        var venues = service.listVenues(null, null, null);
        assertEquals(20, venues.size());
        assertEquals(2, statements.get(), "No per-venue SQL is allowed in the list mapper");
        assertTrue(venues.stream().allMatch(v -> v.canchas().size() == 1 && v.canchas().get(0).disponible()));
        assertTrue(venues.stream().allMatch(v -> v.ciudad().equals("Ica") && v.distrito().equals("Distrito")));
        assertEquals(2, service.getVenue("1").orElseThrow().canchas().size());
        assertTrue(service.listVenues("Otra ciudad", null, null).isEmpty());
    }
}
