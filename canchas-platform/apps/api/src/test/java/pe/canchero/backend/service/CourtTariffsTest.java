package pe.canchero.backend.service;

import java.util.UUID;
import java.util.List;
import java.sql.Time;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.util.ReflectionTestUtils;
import pe.canchero.backend.web.dto.CourtRequest;
import static org.junit.jupiter.api.Assertions.*;

class CourtTariffsTest {
    @Test
    void persistsBothDailyRatesWithoutFlatteningTheNightPrice() {
        var jdbc = new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1", "sa", ""));
        jdbc.execute("""
                create table tarifa_cancha (id_cancha int, dia_semana int, hora_inicio time,
                hora_fin time, precio decimal(10,2), estado char(1), usucre varchar(100),
                pccre varchar(100), fecmod timestamp, usmod varchar(100))
                """);
        var request = new CourtRequest("54", "Cancha", "Futbol 7", "Grass", null, List.of(), true, true, 50, 60.0, "18:00");
        ReflectionTestUtils.invokeMethod(new SupabaseDataService(jdbc, null), "syncTarifas", 701, request);
        assertEquals(14, jdbc.queryForObject("select count(*) from tarifa_cancha where estado = 'A'", Integer.class));
        assertEquals(7, jdbc.queryForObject("select count(*) from tarifa_cancha where precio = 50 and hora_fin = ?", Integer.class, Time.valueOf("18:00:00")));
        assertEquals(7, jdbc.queryForObject("select count(*) from tarifa_cancha where precio = 60 and hora_inicio = ?", Integer.class, Time.valueOf("18:00:00")));
    }
}
