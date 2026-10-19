package pe.canchero.backend.web.controller;

import java.util.List;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.VenueHoursService;
import pe.canchero.backend.service.VenueHoursService.DayHours;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/venues/{sedeId}/hours")
public class VenueHoursController {
    private final VenueHoursService service;

    public VenueHoursController(VenueHoursService service) {
        this.service = service;
    }

    @GetMapping
    public List<DayHours> list(@PathVariable int sedeId) {
        return service.list(sedeId);
    }

    @PutMapping
    public List<DayHours> save(@PathVariable int sedeId,
            @RequestAttribute("auth.user") AuthUserDto user, @RequestBody List<DayHours> days) {
        return service.save(sedeId, user, days);
    }
}
