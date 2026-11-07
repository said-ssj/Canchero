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
    static final int MAX_IPS = 10_000;
    private static final String DESBORDE = "desborde";

    private record Ventana(Instant inicio, int fallos) {}

    private final ConcurrentHashMap<String, Ventana> porIp = new ConcurrentHashMap<>();
    private final Clock clock;
    private volatile Instant ultimaLimpieza = Instant.EPOCH;

    public LoginIpLimiter() {
        this(Clock.systemUTC());
    }

    LoginIpLimiter(Clock clock) {
        this.clock = clock;
    }

    /**
     * Render pone Cloudflare delante de sus servicios, y Cloudflare SOBRESCRIBE CF-Connecting-IP con la IP real aunque
     * el cliente mande otra. True-Client-IP y X-Forwarded-For no se usan: se pueden falsificar.
     * Si alguna vez la IP vista fuera siempre la misma (sin Cloudflare), el mapa con tope igual evita el abuso de memoria.
     */
    public static String clientIp(HttpServletRequest request) {
        String value = request.getHeader("CF-Connecting-IP");
        return value != null && !value.isBlank() ? value.trim() : request.getRemoteAddr();
    }

    public void registrarFallo(String ip) {
        Instant ahora = clock.instant();
        if (porIp.size() >= MAX_IPS && !porIp.containsKey(ip)) {
            // Limpieza como mucho una vez por minuto, para no recorrer el mapa en cada fallo.
            if (ahora.isAfter(ultimaLimpieza.plusSeconds(60))) {
                ultimaLimpieza = ahora;
                porIp.values().removeIf(this::vencida);
            }
            // Mapa lleno de IPs vigentes (posible ataque con muchas IPs): las nuevas comparten un solo contador.
            if (porIp.size() >= MAX_IPS) ip = DESBORDE;
        }
        porIp.merge(ip, new Ventana(ahora, 1),
                (vieja, nueva) -> vencida(vieja) ? nueva : new Ventana(vieja.inicio(), vieja.fallos() + 1));
    }

    public boolean bloqueada(String ip) {
        Ventana v = porIp.get(porIp.containsKey(ip) || porIp.size() < MAX_IPS ? ip : DESBORDE);
        return v != null && v.fallos() >= MAX_FALLOS && !vencida(v);
    }

    private boolean vencida(Ventana v) {
        return !clock.instant().isBefore(v.inicio().plus(VENTANA));
    }
}
