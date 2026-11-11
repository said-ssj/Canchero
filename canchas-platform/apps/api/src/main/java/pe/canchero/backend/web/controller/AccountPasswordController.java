package pe.canchero.backend.web.controller;
import java.util.Map;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.AccountPasswordService;
import pe.canchero.backend.web.dto.AuthUserDto;
@RestController
@RequestMapping("/api/account/password")
public class AccountPasswordController {
 public record Request(String currentPassword,String newPassword){}
 private final AccountPasswordService data;
 public AccountPasswordController(AccountPasswordService data){this.data=data;}
 @PutMapping public Map<String,String> change(@RequestBody Request value,@RequestAttribute("auth.user") AuthUserDto user){data.change(user,value.currentPassword(),value.newPassword());return Map.of("message","Contrasena actualizada");}
}
