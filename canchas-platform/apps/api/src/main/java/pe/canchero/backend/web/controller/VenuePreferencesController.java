package pe.canchero.backend.web.controller;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.VenuePreferencesService;
import pe.canchero.backend.web.dto.AuthUserDto;
@RestController
@RequestMapping("/api/venues/{id}/preferences")
public class VenuePreferencesController {
 private final VenuePreferencesService data;
 public VenuePreferencesController(VenuePreferencesService data){this.data=data;}
 @GetMapping public VenuePreferencesService.Preferences get(@PathVariable int id,@RequestAttribute("auth.user") AuthUserDto user){return data.get(id,user);}
 @PutMapping public VenuePreferencesService.Preferences put(@PathVariable int id,@RequestBody VenuePreferencesService.Preferences value,@RequestAttribute("auth.user") AuthUserDto user){return data.save(id,value,user);}
}
