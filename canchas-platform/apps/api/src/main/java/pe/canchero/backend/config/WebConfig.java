package pe.canchero.backend.config;

import java.util.Arrays;
import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final ApiAuthorizationInterceptor apiAuthorizationInterceptor;
    private final String[] allowedOrigins;

    public WebConfig(
            ApiAuthorizationInterceptor apiAuthorizationInterceptor,
            @Value("${cors.allowed-origins:http://localhost:4200}") String allowedOriginsConfig) {
        this.apiAuthorizationInterceptor = apiAuthorizationInterceptor;
        this.allowedOrigins = Arrays.stream(allowedOriginsConfig.split(","))
                .map(String::trim)
                .filter(origin -> !origin.isEmpty())
                .map(WebConfig::exactOrigin)
                .distinct()
                .toArray(String[]::new);
        if (this.allowedOrigins.length == 0) {
            throw new IllegalArgumentException("CORS_ALLOWED_ORIGINS requires at least one exact origin");
        }
    }

    private static String exactOrigin(String value) {
        String origin = value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
        try {
            URI uri = URI.create(origin);
            if (origin.contains("*") || uri.getHost() == null
                    || !("https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme()))
                    || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty())) {
                throw new IllegalArgumentException();
            }
            return origin;
        } catch (IllegalArgumentException ex) {
            throw new IllegalArgumentException("CORS_ALLOWED_ORIGINS accepts exact http/https origins only, without wildcard, credentials or path");
        }
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("*")
                .allowCredentials(true);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(apiAuthorizationInterceptor)
                .addPathPatterns("/api/**");
    }
}
