package pe.canchero.backend.web.controller;
import java.util.*;
import org.springframework.web.bind.annotation.*;
import pe.canchero.backend.service.CommunitySafetyService;
import pe.canchero.backend.web.dto.AuthUserDto;
@RestController @RequestMapping("/api/community/moderation")
public class CommunityModerationController {
 private final CommunitySafetyService safety;
 public CommunityModerationController(CommunitySafetyService safety){this.safety=safety;}
 @ModelAttribute public void privateResponses(jakarta.servlet.http.HttpServletResponse r){r.setHeader("Cache-Control","no-store");}
 @GetMapping("/status") public CommunitySafetyService.Status status(@RequestAttribute("auth.user") AuthUserDto user){return safety.status(UUID.fromString(user.id()));}
 @GetMapping("/cases") public List<Map<String,Object>> cases(@RequestAttribute("auth.user") AuthUserDto user){return safety.cases(user);}
 @GetMapping("/cases/{id}") public List<Map<String,Object>> evidence(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id){return safety.evidence(user,id);}
 public record Decision(String decision,String reason){}
 @PostMapping("/cases/{id}") public void resolve(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable UUID id,@RequestBody Decision input){safety.resolve(user,id,input.decision(),input.reason());}
}
