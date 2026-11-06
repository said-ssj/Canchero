package pe.canchero.backend.web.controller;

import java.util.Map;
import java.sql.SQLException;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private static final Logger log = LoggerFactory.getLogger(HealthController.class);
    private final AtomicReference<String> lastFailure = new AtomicReference<>();
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
                lastFailure.set(null);
                return ResponseEntity.ok(Map.of("status", "UP"));
            }
            reportFailure("INVALID_PROBE_RESULT", "unknown");
        } catch (DataAccessException ex) {
            String category = "CONNECTION_OR_QUERY_FAILURE";
            String sqlState = "unknown";
            for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
                if (cause instanceof SQLException sql) {
                    if (sql.getSQLState() != null && sql.getSQLState().matches("[A-Z0-9]{5}")) {
                        sqlState = sql.getSQLState();
                    }
                    String message = String.valueOf(sql.getMessage()).toLowerCase(Locale.ROOT);
                    if (message.contains("tenant") && message.contains("not found")) {
                        category = "POOLER_TENANT_NOT_FOUND";
                    } else if ("28P01".equals(sqlState)) {
                        category = "AUTHENTICATION_FAILED";
                    }
                }
            }
            // Log only bounded diagnostic codes, never raw exceptions or connection details.
            reportFailure(category, sqlState);
        }
        return ResponseEntity.status(503).body(Map.of("status", "DOWN"));
    }

    private void reportFailure(String category, String sqlState) {
        String failure = category + ":" + sqlState;
        if (!failure.equals(lastFailure.getAndSet(failure))) {
            log.warn("Database readiness failed: category={} SQLState={}", category, sqlState);
        }
    }
}
