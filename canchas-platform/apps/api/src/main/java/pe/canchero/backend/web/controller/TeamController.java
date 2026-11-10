package pe.canchero.backend.web.controller;

import java.util.List;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.TeamService;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/team")
public class TeamController {
    private final TeamService team;
    public TeamController(TeamService team) { this.team=team; }
    @GetMapping("/me")
    public List<TeamService.VenueScope> me(@RequestAttribute("auth.user") AuthUserDto user) { return team.myVenues(user); }
    @GetMapping("/venues/{id}/agenda")
    public List<Map<String,Object>> agenda(@PathVariable int id,@RequestAttribute("auth.user") AuthUserDto user) { return team.agenda(id,user); }
    @GetMapping("/venues/{id}/members")
    public List<Map<String,Object>> members(@PathVariable int id,@RequestAttribute("auth.user") AuthUserDto user) { return team.members(id,user); }
    @PostMapping("/venues/{id}/members")
    public Map<String,Long> assign(@PathVariable int id,@RequestBody TeamService.Assignment request,@RequestAttribute("auth.user") AuthUserDto user) {
        return Map.of("idAsignacion",team.assign(id,request,user));
    }
    @DeleteMapping("/assignments/{id}")
    @ResponseStatus(org.springframework.http.HttpStatus.NO_CONTENT)
    public void revoke(@PathVariable long id,@RequestAttribute("auth.user") AuthUserDto user) { team.revoke(id,user); }
}
