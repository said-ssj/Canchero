package pe.canchero.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.*;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.*;
import static org.springframework.test.web.client.response.MockRestResponseCreators.*;

class VenueWeatherServiceTest {
    @Test void readsNumericCoordinatesFromPostgres() {
        pe.canchero.backend.it.PostgresTestServer.requireAvailable();
        pe.canchero.backend.it.PostgresTestServer.resetSchema();
        var jdbc=pe.canchero.backend.it.PostgresTestSupport.jdbc();
        pe.canchero.backend.it.PostgresTestSupport.seedTwoVenues(jdbc);
        jdbc.execute("alter table sede alter column latitud type numeric(9,6), alter column longitud type numeric(9,6)");
        jdbc.update("update sede set latitud=-14.06,longitud=-75.72 where id_sede=10");
        var builder=RestClient.builder().baseUrl("https://api.open-meteo.com");
        var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(anything()).andRespond(withSuccess("""
            {"current":{"time":"2026-11-07T14:00","temperature_2m":23,"weather_code":2,"is_day":1}}
            """,org.springframework.http.MediaType.APPLICATION_JSON));
        assertTrue(new VenueWeatherService(jdbc,true,"",builder.build(),Clock.systemUTC()).forecast(10).available());
        server.verify();
    }
    @Test void cachesForecastAndKeepsLimaHourlyTimesWithoutInventingMissingCoordinates() throws Exception {
        var jdbc=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:weather;DB_CLOSE_DELAY=-1","sa",""));
        jdbc.execute("create table sede(id_sede int,latitud double precision,longitud double precision,estado char)");
        jdbc.update("insert into sede values(1,-14.06,-75.72,'A'),(2,null,null,'A')");
        var builder=RestClient.builder().baseUrl("https://api.open-meteo.com");
        var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString("/v1/forecast?latitude=-14.06")))
                .andRespond(withSuccess("""
                {"current":{"time":"2026-11-07T14:15","temperature_2m":23.4,"weather_code":2,"is_day":1},
                 "hourly":{"time":["2026-11-07T18:00"],"temperature_2m":[20],"weather_code":[3],"is_day":[0],"precipitation_probability":[12]}}
                """,org.springframework.http.MediaType.APPLICATION_JSON));
        var service=new VenueWeatherService(jdbc,true,"",builder.build(),Clock.fixed(Instant.parse("2026-11-07T19:00:00Z"),ZoneOffset.UTC));
        var forecast=service.forecast(1);
        assertTrue(forecast.available());
        assertEquals(12,forecast.hourly().getFirst().rainProbability());
        assertEquals("2026-11-07T18:00",forecast.hourly().getFirst().time());
        assertSame(forecast,service.forecast(1));
        assertFalse(service.forecast(2).available());
        assertFalse(service.forecast(999).available());
        server.verify();
    }
    @Test void providerFailureDoesNotBlockBookings() {
        var jdbc=new JdbcTemplate(new DriverManagerDataSource("jdbc:h2:mem:weatherFailure;DB_CLOSE_DELAY=-1","sa",""));
        jdbc.execute("create table sede(id_sede int,latitud double precision,longitud double precision,estado char)");
        jdbc.update("insert into sede values(1,-14,-75,'A')");
        var builder=RestClient.builder().baseUrl("https://api.open-meteo.com");
        var server=MockRestServiceServer.bindTo(builder).build();
        server.expect(anything()).andRespond(withServerError());
        var service=new VenueWeatherService(jdbc,true,"",builder.build(),Clock.systemUTC());
        assertFalse(service.forecast(1).available());
        server.verify();
    }
}
