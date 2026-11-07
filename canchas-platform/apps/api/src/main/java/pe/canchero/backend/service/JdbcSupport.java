package pe.canchero.backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.Time;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/** Acceso JDBC y utilidades comunes (fechas, formatos, catálogos) de los servicios de datos. */
public abstract class JdbcSupport {
    protected static final DateTimeFormatter TIME_FORMAT = DateTimeFormatter.ofPattern("HH:mm");
    protected static final ZoneId LIMA_ZONE = ZoneId.of("America/Lima");
    protected final JdbcTemplate jdbc;

    protected JdbcSupport(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    protected UUID resolveOperationalUserId(String userId) {
        if (userId != null && !userId.isBlank()) {
            try {
                return UUID.fromString(userId);
            } catch (IllegalArgumentException e) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Identificador de usuario inválido");
            }
        }
        throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sesión inválida o expirada");
    }

    protected int lookupCatalogId(String table, String idColumn, String requested, String fallbackName, String errorMessage) {
        String needle = normalize(requested);
        List<Integer> exact = jdbc.queryForList("""
                        select %s
                        from %s
                        where estado = 'A' and lower(nombre) = ?
                        limit 1
                        """.formatted(idColumn, table),
                Integer.class,
                needle);
        if (!exact.isEmpty()) {
            return exact.get(0);
        }

        if (!needle.isBlank()) {
            List<Integer> partial = jdbc.queryForList("""
                            select %s
                            from %s
                            where estado = 'A' and lower(nombre) like ?
                            order by %s
                            limit 1
                            """.formatted(idColumn, table, idColumn),
                    Integer.class,
                    "%" + needle + "%");
            if (!partial.isEmpty()) {
                return partial.get(0);
            }
        }

        List<Integer> fallback = jdbc.queryForList("""
                        select %s
                        from %s
                        where estado = 'A' and lower(nombre) = lower(?)
                        limit 1
                        """.formatted(idColumn, table),
                Integer.class,
                fallbackName);
        if (!fallback.isEmpty()) {
            return fallback.get(0);
        }

        List<Integer> firstActive = jdbc.queryForList("""
                        select %s
                        from %s
                        where estado = 'A'
                        order by %s
                        limit 1
                        """.formatted(idColumn, table, idColumn),
                Integer.class);
        if (!firstActive.isEmpty()) {
            return firstActive.get(0);
        }

        throw new ResponseStatusException(HttpStatus.CONFLICT, errorMessage);
    }

    protected String fallback(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    protected LocalDate parseDate(String value) {
        if (value == null || value.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fecha de reserva es obligatoria");
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (RuntimeException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La fecha debe tener formato YYYY-MM-DD");
        }
    }

    protected String normalize(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT);
    }

    protected String formatTime(Time time) {
        return time == null ? "" : time.toLocalTime().format(TIME_FORMAT);
    }

    protected String stringDateTime(ResultSet rs, String column) throws java.sql.SQLException {
        Object value = rs.getObject(column);
        return value == null ? null : value.toString();
    }

    protected LocalDateTime toLocalDateTime(ResultSet rs, String column) throws java.sql.SQLException {
        Object value = rs.getObject(column);
        if (value == null) return null;
        if (value instanceof LocalDateTime localDateTime) return localDateTime;
        return parseLocalDateTime(value.toString());
    }

    protected LocalDateTime parseLocalDateTime(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        if (normalized.endsWith("Z")) {
            normalized = normalized.substring(0, normalized.length() - 1);
        }
        int zoneIndex = Math.max(normalized.lastIndexOf('+'), normalized.lastIndexOf('-'));
        if (zoneIndex > 10) {
            normalized = normalized.substring(0, zoneIndex);
        }
        if (normalized.length() > 19) {
            normalized = normalized.substring(0, 19);
        }
        return LocalDateTime.parse(normalized.replace(' ', 'T'));
    }

    protected double round2(double value) {
        return BigDecimal.valueOf(value).setScale(2, java.math.RoundingMode.HALF_UP).doubleValue();
    }
}
