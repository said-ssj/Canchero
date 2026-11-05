package pe.canchero.backend.web.controller;

import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/health")
    public ResponseEntity<Map<String, String>> health() {
        try {
            Boolean available = jdbc.execute((ConnectionCallback<Boolean>) connection -> {
                try (var statement = connection.createStatement()) {
                    statement.setQueryTimeout(2);
                    try (var result = statement.executeQuery("SELECT 1")) {
                        return result.next() && result.getInt(1) == 1;
                    }
                }
            });
            if (Boolean.TRUE.equals(available)) {
                return ResponseEntity.ok(Map.of("status", "UP"));
            }
        } catch (DataAccessException ex) {
            // Readiness never exposes database addresses, credentials or driver errors.
        }
        return ResponseEntity.status(503).body(Map.of("status", "DOWN"));
    }
}
