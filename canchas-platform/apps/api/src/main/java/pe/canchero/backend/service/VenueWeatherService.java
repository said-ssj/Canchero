package pe.canchero.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

@Service
public class VenueWeatherService {
    public record Conditions(String time, double temperature, int code, boolean day, Integer rainProbability) {}
    public record Forecast(boolean available, String updatedAt, Conditions current, List<Conditions> hourly) {
        public static Forecast unavailable() { return new Forecast(false, null, null, List.of()); }
    }
    private record Cached(Forecast forecast, Instant expires) {}
    private final Map<Integer,Cached> cache = new ConcurrentHashMap<>();
    private final JdbcTemplate jdbc;
    private final RestClient client;
    private final Clock clock;
    private final boolean enabled;
    private final String key;

    @Autowired
    public VenueWeatherService(JdbcTemplate jdbc, @Value("${WEATHER_ENABLED:true}") boolean enabled,
            @Value("${OPEN_METEO_API_KEY:}") String key) {
        this(jdbc, enabled, key, client(key), Clock.systemUTC());
    }
    VenueWeatherService(JdbcTemplate jdbc, boolean enabled, String key, RestClient client, Clock clock) {
        this.jdbc=jdbc; this.enabled=enabled; this.key=key; this.client=client; this.clock=clock;
    }
    private static RestClient client(String key) {
        var timeouts = new SimpleClientHttpRequestFactory();
        timeouts.setConnectTimeout(Duration.ofSeconds(3)); timeouts.setReadTimeout(Duration.ofSeconds(4));
        return RestClient.builder().baseUrl(key.isBlank() ? "https://api.open-meteo.com" : "https://customer-api.open-meteo.com")
                .requestFactory(timeouts).build();
    }
    public Forecast forecast(int venue) {
        if (!enabled) return Forecast.unavailable();
        Instant now=clock.instant();
        Cached previous=cache.get(venue);
        if (previous != null && previous.expires().isAfter(now)) return previous.forecast();
        if (cache.size() >= 256) {
            cache.entrySet().removeIf(e -> e.getValue().expires().isBefore(now));
            if (cache.size() >= 256) cache.keySet().stream().findFirst().ifPresent(cache::remove);
        }
        return cache.compute(venue,(id,entry) -> {
            if (entry!=null && entry.expires().isAfter(clock.instant())) return entry;
            Forecast result=fetch(venue,now);
            return new Cached(result,now.plusSeconds(result.available() ? 1200 : 180));
        }).forecast();
    }
    private Forecast fetch(int venue, Instant now) {
        Forecast result=Forecast.unavailable();
        var coordinates=jdbc.query("select latitud,longitud from sede where id_sede=? and estado='A'",
                (rs,row) -> new Double[]{rs.getObject(1)==null ? null : rs.getDouble(1),
                    rs.getObject(2)==null ? null : rs.getDouble(2)},venue);
        if (!coordinates.isEmpty()) {
            Double lat=coordinates.getFirst()[0], lon=coordinates.getFirst()[1];
            if (lat!=null && lon!=null && Double.isFinite(lat) && Double.isFinite(lon)
                    && Math.abs(lat)<=90 && Math.abs(lon)<=180 && !(lat==0 && lon==0)) {
                try {
                    JsonNode body=client.get().uri(b -> {
                        b.path("/v1/forecast").queryParam("latitude",lat).queryParam("longitude",lon)
                                .queryParam("current","temperature_2m,weather_code,is_day")
                                .queryParam("hourly","temperature_2m,weather_code,is_day,precipitation_probability")
                                .queryParam("timezone","America/Lima").queryParam("forecast_days",7);
                        if (!key.isBlank()) b.queryParam("apikey",key);
                        return b.build();
                    }).retrieve().body(JsonNode.class);
                    result=parse(body,now);
                } catch (RuntimeException ignored) {
                    // El clima es opcional: una falla del proveedor no impide reservar.
                }
            }
        }
        return result;
    }
    static Forecast parse(JsonNode body, Instant now) {
        if (body==null || !body.path("current").path("temperature_2m").isNumber()
                || !body.path("current").path("weather_code").isNumber()) return Forecast.unavailable();
        JsonNode current=body.path("current"), hourly=body.path("hourly");
        var items=new ArrayList<Conditions>();
        for (int i=0;i<hourly.path("time").size();i++) {
            if (!hourly.path("temperature_2m").path(i).isNumber() || !hourly.path("weather_code").path(i).isInt()) continue;
            JsonNode rain=hourly.path("precipitation_probability").path(i);
            items.add(new Conditions(hourly.path("time").path(i).asText(),
                    hourly.path("temperature_2m").path(i).asDouble(),hourly.path("weather_code").path(i).asInt(),
                    hourly.path("is_day").path(i).asInt()==1,rain.isNumber() ? rain.asInt() : null));
        }
        return new Forecast(true,now.toString(),new Conditions(current.path("time").asText(),
                current.path("temperature_2m").asDouble(),current.path("weather_code").asInt(),
                current.path("is_day").asInt()==1,null),List.copyOf(items));
    }
}
