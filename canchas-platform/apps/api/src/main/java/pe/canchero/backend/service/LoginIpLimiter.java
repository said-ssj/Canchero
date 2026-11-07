package pe.canchero.backend.service;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Límite de logins fallidos por IP: frena a quien prueba contraseñas contra muchas cuentas
 * y limita cuántas cuentas ajenas puede bloquear (cada bloqueo cuesta 10 fallos).
 */
// shortcut: memoria de una sola instancia; si la API corre en varias instancias, mover el conteo a la base o a Redis.
@Component
public class LoginIpLimiter {
    static final int MAX_FALLOS = 20;
    static final Duration VENTANA = Duration.ofMinutes(15);

    private record Ventana(Instant inicio, int fallos) {}

    private final ConcurrentHashMap<String, Ventana> porIp = new ConcurrentHashMap<>();
    private final Clock clock;

    public LoginIpLimiter() {
        this(Clock.systemUTC());
    }

    LoginIpLimiter(Clock clock) {
        this.clock = clock;
    }

    /**
     * En Render, Cloudflare va delante y pone True-Client-IP con la IP real (sobrescribe la que mande el cliente).
     * X-Forwarded-For no se usa: Render no limpia lo que envía el cliente y se podría falsificar.
     */
    public static String clientIp(HttpServletRequest request) {
        for (String header : new String[] {"True-Client-IP", "CF-Connecting-IP"}) {
            String value = request.getHeader(header);
            if (value != null && !value.isBlank()) return value.trim();
        }
        return request.getRemoteAddr();
    }

    public boolean bloqueada(String ip) {
        Ventana v = porIp.get(ip);
        return v != null && v.fallos() >= MAX_FALLOS && !vencida(v);
    }

    public void registrarFallo(String ip) {
        Instant ahora = clock.instant();
        if (porIp.size() > 10_000) porIp.values().removeIf(this::vencida);
        porIp.merge(ip, new Ventana(ahora, 1),
                (vieja, nueva) -> vencida(vieja) ? nueva : new Ventana(vieja.inicio(), vieja.fallos() + 1));
    }

    private boolean vencida(Ventana v) {
        return !clock.instant().isBefore(v.inicio().plus(VENTANA));
    }
}
