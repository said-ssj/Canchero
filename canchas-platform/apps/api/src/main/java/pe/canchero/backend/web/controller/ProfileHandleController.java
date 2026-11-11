package pe.canchero.backend.web.controller;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.ProfileHandleService;
import pe.canchero.backend.web.dto.AuthUserDto;
@RestController
@RequestMapping("/api/community/me/handle")
public class ProfileHandleController {
 public record Request(String handle){}
 private final ProfileHandleService data;
 public ProfileHandleController(ProfileHandleService data){this.data=data;}
 @GetMapping public ProfileHandleService.State get(@RequestAttribute("auth.user") AuthUserDto user){return data.state(user);}
 @PutMapping public ProfileHandleService.State put(@RequestAttribute("auth.user") AuthUserDto user,@RequestBody Request value){return data.change(user,value.handle());}
}
