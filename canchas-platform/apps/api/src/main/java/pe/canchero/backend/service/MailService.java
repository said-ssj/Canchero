package pe.canchero.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Resend preferido; compatibilidad con Brevo para los correos de acceso existentes. */
@Service
public class MailService {
    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final String apiKey;
    private final String resendKey;
    private final String from;
    private final String appUrl;
    private final RestClient client;
    // Un solo hilo: el envío no frena la respuesta (ni revela por su demora si el correo existe) y no se acumulan hilos.
    private final ExecutorService sender = Executors.newSingleThreadExecutor(r -> {
        Thread t = new Thread(r, "mail-sender");
        t.setDaemon(true);
        return t;
    });

    @org.springframework.beans.factory.annotation.Autowired
    public MailService(@Value("${BREVO_API_KEY:}") String apiKey,
                       @Value("${MAIL_FROM_EMAIL:noreply@canchero.pe}") String from,
                       @Value("${APP_PUBLIC_URL:http://localhost:4200}") String appUrl,
                       @Value("${RESEND_API_KEY:}") String resendKey) {
        this.apiKey = apiKey;
        this.resendKey = resendKey;
        this.from = from;
        this.appUrl = appUrl.replaceAll("/+$", "");
        var timeouts = new SimpleClientHttpRequestFactory();
        timeouts.setConnectTimeout(Duration.ofSeconds(5));
        timeouts.setReadTimeout(Duration.ofSeconds(10));
        this.client = RestClient.builder().baseUrl(resendKey.isBlank() ? "https://api.brevo.com" : "https://api.resend.com").requestFactory(timeouts).build();
    }

    public MailService(String apiKey, String from, String appUrl) { this(apiKey,from,appUrl,""); }
    public boolean resendConfigured() { return !resendKey.isBlank() && !from.isBlank(); }
    public String itineraryUrl() { return appUrl + "/itinerario"; }

    public void sendResend(String to, String subject, String text, String idempotencyKey) {
        if (!resendConfigured()) throw new IllegalStateException("Resend no configurado");
        client.post().uri("/emails").header("Authorization","Bearer " + resendKey)
                .header("Idempotency-Key",idempotencyKey)
                .body(Map.of("from","Canchero <" + from + ">","to",List.of(to),"subject",subject,"text",text))
                .retrieve().toBodilessEntity();
    }

    public void send(String to, String subject, String text) {
        if (resendConfigured()) {
            sendResend(to,subject,text,"auth-" + java.util.UUID.randomUUID());
            return;
        }
        if (apiKey.isBlank()) {
            log.warn("Proveedor de correo no configurado; correo no enviado. No se registran destinatarios ni enlaces de acceso.");
            return;
        }
        client.post().uri("/v3/smtp/email")
                .header("api-key", apiKey)
                .body(Map.of(
                        "sender", Map.of("email", from, "name", "Canchero"),
                        "to", List.of(Map.of("email", to)),
                        "subject", subject,
                        "textContent", text))
                .retrieve().toBodilessEntity();
    }

    /** Envía en segundo plano; los fallos se registran y no cortan la petición. */
    public void sendLater(String to, String subject, String text) {
        sender.execute(() -> {
            try {
                send(to.trim(), subject, text);
            } catch (RuntimeException ex) {
                log.error("No se pudo enviar un correo de acceso ({})", ex.getClass().getSimpleName());
            }
        });
    }

    /** Correo con enlace de un solo uso a /recuperar. */
    public void sendResetLink(String to, String subject, String intro, String token) {
        sendLater(to, subject, intro + "\n\nAbre este enlace (vence en 30 minutos):\n" + appUrl + "/recuperar?token=" + token
                + "\n\nSi no fuiste tú, ignora este correo; tu contraseña no cambia.");
    }

    public String recoverUrl() {
        return appUrl + "/recuperar";
    }
    @jakarta.annotation.PreDestroy
    public void close() { sender.shutdown(); }
}
