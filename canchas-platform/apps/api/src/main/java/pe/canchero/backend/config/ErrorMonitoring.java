package pe.canchero.backend.config;

import io.sentry.Sentry;
import io.sentry.SentryEvent;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.HandlerExceptionResolver;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import java.util.List;

@Configuration
public class ErrorMonitoring implements WebMvcConfigurer {
    private final boolean enabled;
    public ErrorMonitoring(@Value("${SENTRY_ENABLED:false}") boolean enabled,
            @Value("${SENTRY_BACKEND_DSN:}") String dsn,
            @Value("${APP_ENVIRONMENT:development}") String environment,
            @Value("${APP_RELEASE:}") String release) {
        this.enabled=enabled && validDsn(dsn);
        if (this.enabled) Sentry.init(options -> {
            options.setDsn(dsn);
            options.setEnvironment(environment);
            if (!release.isBlank()) options.setRelease(release);
            options.setServerName("canchero-api");
            options.setSendDefaultPii(false);
            options.setTracesSampleRate(0.0);
            options.setEnableAutoSessionTracking(false);
            options.setBeforeSend((event,hint) -> sanitize(event));
        });
    }
    static boolean validDsn(String value) {
        try {
            var uri=java.net.URI.create(value);
            return "https".equals(uri.getScheme()) && uri.getHost()!=null && uri.getUserInfo()!=null
                    && !uri.getUserInfo().contains(":") && uri.getPath().matches("/[0-9]+")
                    && uri.getQuery()==null && uri.getFragment()==null;
        } catch (RuntimeException e) { return false; }
    }
    public static SentryEvent sanitize(SentryEvent event) {
        event.setUser(null); event.setRequest(null); event.setExtras(null); event.setBreadcrumbs(null);
        event.getContexts().clear(); event.setTags(null); event.setThreads(null);
        if (event.getMessage()!=null) {
            var message=new io.sentry.protocol.Message(); message.setFormatted("Error de la API"); event.setMessage(message);
        }
        if (event.getExceptions()!=null) for (var ex:event.getExceptions()) ex.setValue("[Contenido omitido]");
        return event;
    }
    @Override
    public void extendHandlerExceptionResolvers(List<HandlerExceptionResolver> resolvers) {
        resolvers.add(0,(request,response,handler,ex) -> {
            if (enabled && !(ex instanceof NumberFormatException)
                    && !(ex instanceof org.springframework.web.ErrorResponse e && e.getStatusCode().is4xxClientError())) {
                Sentry.captureException(ex);
            }
            return null; // Conserva los manejadores y respuestas de negocio actuales.
        });
    }
    @jakarta.annotation.PreDestroy public void close() { if (enabled) Sentry.close(); }
}
