package pe.canchero.backend.web.controller;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestAttribute;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/privacy/requests")
public class PrivacyRequestController {
    public record Request(String type, String details) {}
    public record Receipt(UUID id, String status) {}

    private final JdbcTemplate jdbc;

    public PrivacyRequestController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @PostMapping
    public Receipt create(
            @RequestAttribute("auth.user") AuthUserDto user,
            @RequestBody(required = false) Request request) {
        if (request == null || request.type() == null
                || !request.type().matches("acceso|rectificacion|oposicion|supresion")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Tipo de solicitud no válido");
        }

        String details = request.details() == null ? "" : request.details().trim();
        if (details.length() > 1000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El detalle no puede superar 1000 caracteres");
        }

        Boolean ready = jdbc.queryForObject(
                "select to_regclass('public.solicitud_derechos_datos') is not null",
                Boolean.class);
        if (!Boolean.TRUE.equals(ready)) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "El canal de solicitudes de privacidad aún no está configurado");
        }

        UUID userId = UUID.fromString(user.id());
        Integer recentRequests = jdbc.queryForObject("""
                select count(*) from public.solicitud_derechos_datos
                where id_usuario = ? and creado_en > now() - interval '24 hours'
                """, Integer.class, userId);
        if (recentRequests != null && recentRequests >= 5) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS,
                    "Alcanzaste el límite diario de solicitudes. Comunícate con soporte.");
        }

        UUID id = UUID.randomUUID();
        jdbc.update("""
                insert into public.solicitud_derechos_datos (id, id_usuario, tipo, detalle)
                values (?, ?, ?, ?)
                """, id, userId, request.type(), details);
        return new Receipt(id, "pendiente");
    }
}
