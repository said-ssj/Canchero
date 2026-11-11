package pe.canchero.backend.web.controller;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.*;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/payments/mercadopago")
public class MercadoPagoController {
    private final MercadoPagoService payments;
    private final MercadoPagoWebhooks webhooks;
    public MercadoPagoController(MercadoPagoService payments,MercadoPagoWebhooks webhooks){this.payments=payments;this.webhooks=webhooks;}
    @GetMapping("/capabilities")
    public Map<String,Object> capabilities(){return Map.of("available",payments.available(),"testMode",true,"provider","mercadopago");}
    @PostMapping("/checkout")
    public MercadoPagoService.StartResponse start(@RequestBody MercadoPagoService.StartRequest request,@RequestAttribute("auth.user") AuthUserDto user){return payments.start(request,user);}
    @GetMapping("/checkouts/{id}")
    public MercadoPagoService.State state(@PathVariable UUID id,@RequestAttribute("auth.user") AuthUserDto user){return payments.state(id,user);}
    @GetMapping("/bookings/{id}")
    public MercadoPagoService.State forBooking(@PathVariable int id,@RequestAttribute("auth.user") AuthUserDto user){return payments.forBooking(id,user);}
    public record Refresh(String paymentId) {}
    @PostMapping("/checkouts/{id}/refresh")
    public MercadoPagoService.State refresh(@PathVariable UUID id,@RequestBody Refresh request,@RequestAttribute("auth.user") AuthUserDto user){return payments.refresh(id,request.paymentId(),user);}
    @PostMapping("/webhook")
    public Map<String,Boolean> webhook(@RequestHeader(value="x-signature",required=false)String signature,
            @RequestHeader(value="x-request-id",required=false)String requestId,@RequestParam(name="data.id",required=false)String id,
            @RequestBody JsonNode body){
        if(!"payment".equals(body.path("type").asText()) || id==null || !id.equals(body.path("data").path("id").asText()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Notificacion no compatible");
        webhooks.accept(signature,requestId,id);return Map.of("received",true);
    }
    @ExceptionHandler(ResponseStatusException.class)
    public org.springframework.http.ResponseEntity<pe.canchero.backend.web.dto.ErrorResponse> handlePaymentError(ResponseStatusException ex) {
        String message=ex.getReason();
        if(message==null || message.isBlank())message="No se pudo completar la operación de pago. Intenta nuevamente.";
        return org.springframework.http.ResponseEntity.status(ex.getStatusCode())
                .body(new pe.canchero.backend.web.dto.ErrorResponse(message));
    }

}
