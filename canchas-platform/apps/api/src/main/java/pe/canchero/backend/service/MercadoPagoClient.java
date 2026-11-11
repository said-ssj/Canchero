package pe.canchero.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/** Checkout Pro Preferences API: ninguna tarjeta, CVV o token de acceso pasa por Angular. */
@Component
public class MercadoPagoClient {
    private final MercadoPagoSettings settings;
    private final ObjectMapper json;
    private final HttpClient http;
    public MercadoPagoClient(MercadoPagoSettings settings,ObjectMapper json) {
        this.settings=settings;this.json=json;
        this.http=HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).followRedirects(HttpClient.Redirect.NEVER).build();
    }
    public JsonNode preference(Map<String,Object> payload) { return request("/checkout/preferences",payload); }
    public JsonNode payment(String id) {
        if(!id.matches("[0-9]{1,30}")) throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Identificador de pago invalido");
        return request("/v1/payments/"+id,null);
    }
    private JsonNode request(String path,Map<String,Object> payload) {
        if(!settings.configured())throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Mercado Pago de prueba aun no esta configurado");
        try {
            var builder=HttpRequest.newBuilder(URI.create("https://api.mercadopago.com"+path)).timeout(Duration.ofSeconds(12))
                    .header("Authorization","Bearer "+settings.accessToken()).header("Content-Type","application/json");
            if(payload==null)builder.GET();else builder.POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(payload)));
            var response=http.send(builder.build(),HttpResponse.BodyHandlers.ofString());
            if(response.statusCode()<200 || response.statusCode()>=300)
                throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"Mercado Pago no pudo completar la consulta. Reintenta con la misma operacion.");
            return json.readTree(response.body());
        } catch(InterruptedException ex) {
            Thread.currentThread().interrupt();throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Consulta interrumpida");
        } catch(java.io.IOException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,"No se pudo consultar Mercado Pago. No se ha confirmado el pago.");
        }
    }
}
