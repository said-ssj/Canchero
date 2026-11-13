package pe.canchero.backend.service;

import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LoginIpLimiterTest {
    private Instant ahora = Instant.parse("2026-11-07T12:00:00Z");
    private final Clock clock = new Clock() {
        @Override public ZoneOffset getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(java.time.ZoneId zone) { return this; }
        @Override public Instant instant() { return ahora; }
    };

    @Test
    void bloqueaCombinacionIpCuentaYLaLiberaAlVencerLaVentana() {
        var limiter = new LoginIpLimiter(clock);
        for (int i = 0; i < LoginIpLimiter.MAX_FALLOS - 1; i++) limiter.registrarFallo("1.1.1.1");
        assertFalse(limiter.bloqueada("1.1.1.1"));
        limiter.registrarFallo("1.1.1.1");
        assertTrue(limiter.bloqueada("1.1.1.1"));
        assertFalse(limiter.bloqueada("2.2.2.2"));      // otras conexiones no se ven afectadas

        ahora = ahora.plus(LoginIpLimiter.VENTANA).plus(Duration.ofSeconds(1));
        assertFalse(limiter.bloqueada("1.1.1.1"));
        limiter.registrarFallo("1.1.1.1");               // empieza una ventana nueva
        assertFalse(limiter.bloqueada("1.1.1.1"));
    }

    @Test
    void usaSoloLaIpQuePoneCloudflare() {
        var request = new MockHttpServletRequest();
        request.setRemoteAddr("10.0.0.1");
        request.addHeader("X-Forwarded-For", "6.6.6.6");
        request.addHeader("True-Client-IP", "7.7.7.7");
        assertEquals("10.0.0.1", LoginIpLimiter.clientIp(request));
        request.addHeader("CF-Connecting-IP", "8.8.8.8");
        assertEquals("8.8.8.8", LoginIpLimiter.clientIp(request));
    }

    @Test
    void unaRedCompartidaNoMezclaLosIntentosDeCuentasDistintas() {
        var limiter = new LoginIpLimiter(clock);
        for (int i = 0; i < LoginIpLimiter.MAX_FALLOS; i++) limiter.registrarFallo("10.0.0.1", "a@example.test");
        assertTrue(limiter.bloqueada("10.0.0.1", "a@example.test"));
        assertFalse(limiter.bloqueada("10.0.0.1", "b@example.test"));
    }
}
