package pe.canchero.backend.web.controller;

import java.util.UUID;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.ReservationAccessService;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/access")
public class ReservationAccessController {
    private final ReservationAccessService service;
    public ReservationAccessController(ReservationAccessService service){this.service=service;}
    @PostMapping("/scan")
    public ReservationAccessService.Result scan(@RequestBody ReservationAccessService.Scan request,@RequestAttribute("auth.user") AuthUserDto user){return service.scan(request,user);}
    public record Reason(String motivo){}
    @PostMapping("/movements/{id}/reverse")
    public void reverse(@PathVariable UUID id,@RequestBody Reason reason,@RequestAttribute("auth.user") AuthUserDto user){service.reverse(id,reason.motivo(),user);}
}
