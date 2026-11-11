package pe.canchero.backend.service;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record MercadoPagoSettings(
 @Value("${MERCADOPAGO_ENABLED:false}") boolean enabled,
 @Value("${MERCADOPAGO_ACCESS_TOKEN:}") String accessToken,
 @Value("${MERCADOPAGO_WEBHOOK_SECRET:}") String webhookSecret,
 @Value("${MERCADOPAGO_COLLECTOR_ID:}") String collectorId,
 @Value("${MERCADOPAGO_PASS_SECRET:}") String passSecret,
 @Value("${MERCADOPAGO_PUBLIC_URL:${APP_PUBLIC_URL:http://localhost:4200}}") String publicUrl,
 @Value("${MERCADOPAGO_WEBHOOK_URL:}") String webhookUrl) {
    public boolean configured() {
        return enabled && !accessToken.isBlank() && webhookSecret.length()>=16
                && collectorId.matches("[0-9]{1,30}") && passSecret.length()>=32
                && https(publicUrl) && https(webhookUrl);
    }
    @Override public String toString(){ return "MercadoPagoSettings[redacted]"; }
    private static boolean https(String raw) {
        try { URI u=URI.create(raw);return "https".equals(u.getScheme()) && u.getHost()!=null && u.getUserInfo()==null; }
        catch(RuntimeException ex){return false;}
    }
}
