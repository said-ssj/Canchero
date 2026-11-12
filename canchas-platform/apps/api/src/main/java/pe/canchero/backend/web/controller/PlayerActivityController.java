package pe.canchero.backend.web.controller;

import java.util.List;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.ResponseEntity;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.PlayerActivityService;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.ErrorResponse;

@RestController
@RequestMapping("/api/me")
public class PlayerActivityController {
    private final PlayerActivityService data;
    public PlayerActivityController(PlayerActivityService data) { this.data=data; }
    @ModelAttribute public void noCache(jakarta.servlet.http.HttpServletResponse response) {response.setHeader("Cache-Control","private, no-store");}
    @GetMapping("/favorite-venues") public List<String> favorites(@RequestAttribute("auth.user") AuthUserDto user) {return data.favorites(user);}
    @PutMapping("/favorite-venues/{id}") public void save(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable int id) {data.favorite(user,id,true);}
    @DeleteMapping("/favorite-venues/{id}") public void remove(@RequestAttribute("auth.user") AuthUserDto user,@PathVariable int id) {data.favorite(user,id,false);}
    @GetMapping("/payments") public PlayerActivityService.PaymentPage payments(@RequestAttribute("auth.user") AuthUserDto user,@RequestParam(defaultValue="0") int page) {return data.payments(user,page);}
    @ExceptionHandler(ResponseStatusException.class) public ResponseEntity<ErrorResponse> error(ResponseStatusException e) {return ResponseEntity.status(e.getStatusCode()).body(new ErrorResponse(e.getReason()));}
}
