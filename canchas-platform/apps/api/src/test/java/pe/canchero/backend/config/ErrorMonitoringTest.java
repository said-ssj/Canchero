package pe.canchero.backend.config;
import io.sentry.SentryEvent;
import io.sentry.protocol.*;
import org.junit.jupiter.api.Test;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
class ErrorMonitoringTest {
    @Test void removesCredentialsUserAndPaymentContext() {
        var event=new SentryEvent();
        var user=new User(); user.setEmail("private@example.test"); event.setUser(user);
        var request=new Request(); request.setData("password=secret"); event.setRequest(request);
        event.setExtras(Map.of("cardNumber","123456"));
        event.getContexts().put("auth",Map.of("token","secret"));
        var exception=new SentryException(); exception.setType("IllegalStateException"); exception.setValue("secret");
        event.setExceptions(List.of(exception));
        var safe=ErrorMonitoring.sanitize(event);
        assertNull(safe.getUser()); assertNull(safe.getRequest()); assertNull(safe.getExtras());
        assertTrue(safe.getContexts().isEmpty());
        assertEquals("[Contenido omitido]",safe.getExceptions().getFirst().getValue());
    }
    @Test void placeholderOrInsecureDsnsDoNotActivateMonitoring() {
        assertFalse(ErrorMonitoring.validDsn(""));
        assertFalse(ErrorMonitoring.validDsn("https://xxx@sentry.io/xxx"));
        assertFalse(ErrorMonitoring.validDsn("http://public@example.test/1"));
        assertTrue(ErrorMonitoring.validDsn("https://public@ingest.example.test/123"));
    }
}
