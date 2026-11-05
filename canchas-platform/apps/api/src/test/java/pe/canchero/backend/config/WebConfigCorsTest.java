package pe.canchero.backend.config;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.options;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class WebConfigCorsTest {
    static class Registry extends CorsRegistry {
        Map<String, CorsConfiguration> configurations() { return getCorsConfigurations(); }
    }

    @RestController
    static class Probe {
        @GetMapping("/api/cors-probe")
        String probe() { return "ok"; }
    }

    private MockMvc mvc(String origins) {
        var registry = new Registry();
        new WebConfig(mock(ApiAuthorizationInterceptor.class), origins).addCorsMappings(registry);
        var source = new org.springframework.web.cors.UrlBasedCorsConfigurationSource();
        registry.configurations().forEach(source::registerCorsConfiguration);
        return MockMvcBuilders.standaloneSetup(new Probe())
                .addFilters(new org.springframework.web.filter.CorsFilter(source)).build();
    }

    @Test
    void acceptsExactConfiguredOriginAndNormalizesTrailingSlash() throws Exception {
        mvc("http://localhost:4200,https://canchero.example.test/")
                .perform(options("/api/cors-probe").header("Origin", "https://canchero.example.test")
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "Authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "https://canchero.example.test"));
    }

    @Test
    void rejectsAnotherVercelProject() throws Exception {
        mvc("https://canchero.vercel.app")
                .perform(options("/api/cors-probe").header("Origin", "https://otro-equipo.vercel.app")
                        .header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isForbidden())
                .andExpect(header().doesNotExist("Access-Control-Allow-Origin"));
    }

    @Test
    void retainsLocalDevelopmentOrigin() throws Exception {
        mvc("http://localhost:4200").perform(options("/api/cors-probe")
                .header("Origin", "http://localhost:4200").header("Access-Control-Request-Method", "GET"))
                .andExpect(status().isOk());
    }

    @Test
    void refusesBroadOrMalformedConfiguration() {
        for (String origins : new String[] {"*", "https://*.vercel.app", "", "https://user:pass@example.test",
                "https://example.test/api", "example.test", "https://example.test?q=1"}) {
            assertThrows(IllegalArgumentException.class, () -> mvc(origins), origins);
        }
    }
}
