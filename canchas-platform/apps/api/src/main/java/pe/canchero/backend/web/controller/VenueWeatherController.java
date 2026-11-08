package pe.canchero.backend.web.controller;

import java.time.Duration;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.VenueWeatherService;

@RestController
@RequestMapping("/api/venues")
public class VenueWeatherController {
    private final VenueWeatherService weather;
    public VenueWeatherController(VenueWeatherService weather) { this.weather=weather; }
    @GetMapping("/{id}/weather")
    public ResponseEntity<VenueWeatherService.Forecast> forecast(@PathVariable int id) {
        return ResponseEntity.ok().cacheControl(CacheControl.maxAge(Duration.ofMinutes(3)).cachePublic()).body(weather.forecast(id));
    }
}
