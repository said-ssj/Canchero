package pe.canchero.backend.service;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.net.InetAddress;
import java.security.MessageDigest;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/** Rate limit compartido entre instancias por IP y cuenta. */
@Component
public class LoginIpLimiter {
    static final int MAX_FALLOS = 20;
    static final Duration VENTANA = Duration.ofMinutes(15);
    private final JdbcTemplate jdbc;
    private final List<String> trustedProxyCidrs;
    // Usado solo por pruebas unitarias sin contexto Spring.
    private final ConcurrentHashMap<String, int[]> testCounts = new ConcurrentHashMap<>();
    private final Clock clock;

    @Autowired
    public LoginIpLimiter(JdbcTemplate jdbc, @Value("${auth.trusted-proxy-cidrs:}") String cidrs) {
        this(jdbc, cidrs, Clock.systemUTC());
    }

    /** Constructor para pruebas unitarias sin Spring/JDBC. */
    public LoginIpLimiter() { this(null, "", Clock.systemUTC()); }

    LoginIpLimiter(Clock clock) { this(null, "", clock); }

    private LoginIpLimiter(JdbcTemplate jdbc, String cidrs, Clock clock) {
        this.jdbc = jdbc;
        this.trustedProxyCidrs = cidrs == null ? List.of() : List.of(cidrs.split(",")).stream().map(String::trim).filter(s -> !s.isEmpty()).toList();
        this.clock = clock;
    }

    public String resolveClientIp(HttpServletRequest request) {
        String remote = request.getRemoteAddr();
        String forwarded = request.getHeader("CF-Connecting-IP");
        if (forwarded != null && !forwarded.isBlank() && trustedProxyCidrs.stream().anyMatch(c -> contains(c, remote))) {
            try { return InetAddress.getByName(forwarded.trim()).getHostAddress(); }
            catch (Exception ignored) { /* use direct peer */ }
        }
        return remote == null ? "unknown" : remote;
    }

    /** Compatibilidad para clientes de prueba: producción usa resolveClientIp con CIDR confiable. */
    public static String clientIp(HttpServletRequest request) {
        String value = request.getHeader("CF-Connecting-IP");
        return value != null && !value.isBlank() ? value.trim() : request.getRemoteAddr();
    }

    private static boolean contains(String cidr, String address) {
        try {
            String[] p = cidr.split("/", 2);
            byte[] network = InetAddress.getByName(p[0]).getAddress();
            byte[] candidate = InetAddress.getByName(address).getAddress();
            if (network.length != candidate.length) return false;
            int bits = p.length == 1 ? network.length * 8 : Integer.parseInt(p[1]);
            if (bits < 0 || bits > network.length * 8) return false;
            int whole = bits / 8, rem = bits % 8;
            for (int i = 0; i < whole; i++) if (network[i] != candidate[i]) return false;
            int mask = 0xff << (8 - rem);
            return rem == 0 || ((network[whole] & mask) == (candidate[whole] & mask));
        } catch (Exception ignored) { return false; }
    }

    public void registrarFallo(String ip, String email) {
        String fingerprint = fingerprint(ip, email);
        if (jdbc == null) {
            int[] value = testCounts.computeIfAbsent(fingerprint, k -> new int[]{0, (int)(clock.instant().getEpochSecond())});
            synchronized (value) { if (clock.instant().getEpochSecond() - value[1] >= VENTANA.toSeconds()) { value[0] = 0; value[1] = (int)clock.instant().getEpochSecond(); } value[0]++; }
            return;
        }
        jdbc.update("""
            insert into public.login_intento_ip (huella, fallos, inicio_ventana) values (?,1,now())
            on conflict (huella) do update set
              fallos=case when login_intento_ip.inicio_ventana <= now()-interval '15 minutes' then 1 else login_intento_ip.fallos+1 end,
              inicio_ventana=case when login_intento_ip.inicio_ventana <= now()-interval '15 minutes' then now() else login_intento_ip.inicio_ventana end
            """, fingerprint);
        jdbc.update("delete from public.login_intento_ip where inicio_ventana < now()-interval '1 day' and random()<0.01");
    }

    public void registrarFallo(String ip) { registrarFallo(ip, ""); }

    public boolean bloqueada(String ip, String email) {
        String fingerprint = fingerprint(ip, email);
        if (jdbc == null) { int[] v = testCounts.get(fingerprint); return v != null && v[0] >= MAX_FALLOS && clock.instant().getEpochSecond() - v[1] < VENTANA.toSeconds(); }
        Integer count = jdbc.queryForObject("select fallos from public.login_intento_ip where huella=? and inicio_ventana > now()-interval '15 minutes'", Integer.class, fingerprint);
        return count != null && count >= MAX_FALLOS;
    }

    public boolean bloqueada(String ip) { return bloqueada(ip, ""); }

    private static String fingerprint(String ip, String email) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256").digest(((ip == null ? "" : ip.trim()) + "|" + (email == null ? "" : email.trim().toLowerCase(java.util.Locale.ROOT))).getBytes(java.nio.charset.StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) { throw new IllegalStateException(e); }
    }
}
