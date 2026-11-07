package pe.canchero.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;

/** Correos transaccionales vía SendGrid. Sin SENDGRID_API_KEY (desarrollo) el mensaje se escribe en el log. */
@Service
public class MailService {
    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final String apiKey;
    private final String from;
    private final String appUrl;
    private final RestClient client = RestClient.create("https://api.sendgrid.com");

    public MailService(@Value("${SENDGRID_API_KEY:}") String apiKey,
                       @Value("${SENDGRID_FROM_EMAIL:noreply@canchero.pe}") String from,
                       @Value("${APP_PUBLIC_URL:http://localhost:4200}") String appUrl) {
        this.apiKey = apiKey;
        this.from = from;
        this.appUrl = appUrl.replaceAll("/+$", "");
    }

    /** Correo con enlace de un solo uso a /recuperar; los fallos se registran y no cortan la petición. */
    public void sendResetLink(String to, String subject, String intro, String token) {
        try {
            send(to.trim(), subject, intro + "\n\nAbre este enlace (vence en 30 minutos):\n" + appUrl + "/recuperar?token=" + token
                    + "\n\nSi no fuiste tú, ignora este correo; tu contraseña no cambia.");
        } catch (RuntimeException ex) {
            log.error("No se pudo enviar el correo de recuperación: {}", ex.getMessage());
        }
    }

    public void send(String to, String subject, String text) {
        if (apiKey.isBlank()) {
            // shortcut: solo para desarrollo local; en producción configura SENDGRID_API_KEY o el enlace queda en los logs.
            log.warn("SENDGRID_API_KEY no configurada; correo para {} no enviado:\n{}\n{}", to, subject, text);
            return;
        }
        client.post().uri("/v3/mail/send")
                .header("Authorization", "Bearer " + apiKey)
                .body(Map.of(
                        "personalizations", List.of(Map.of("to", List.of(Map.of("email", to)))),
                        "from", Map.of("email", from, "name", "Canchero"),
                        "subject", subject,
                        "content", List.of(Map.of("type", "text/plain", "value", text))))
                .retrieve().toBodilessEntity();
    }
}
