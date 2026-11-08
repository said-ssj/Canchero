package pe.canchero.backend.web.controller;

import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.service.BookingMailService;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/auth/notification-preferences")
public class NotificationPreferencesController {
    public record Preferences(boolean bookingEmails,boolean reminders,boolean emailAvailable) {}
    private final JdbcTemplate jdbc;
    private final BookingMailService mail;
    public NotificationPreferencesController(JdbcTemplate jdbc,BookingMailService mail) { this.jdbc=jdbc; this.mail=mail; }
    private void ready() {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select to_regclass('public.preferencias_notificacion') is not null",Boolean.class)))
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"Preferencias de notificaciones pendientes de configurar");
    }
    @GetMapping
    public Preferences get(@RequestAttribute("auth.user") AuthUserDto user) {
        ready();
        return jdbc.queryForObject("""
            select coalesce(p.correo_reservas,true),coalesce(p.recordatorios,true)
            from public.usuario u left join public.preferencias_notificacion p on p.id_usuario=u.id_usuario
            where u.id_usuario=? and u.estado='A'
            """,(rs,n) -> new Preferences(rs.getBoolean(1),rs.getBoolean(2),mail.available()),UUID.fromString(user.id()));
    }
    @PutMapping
    public Preferences save(@RequestAttribute("auth.user") AuthUserDto user,@RequestBody Preferences p) {
        ready();
        jdbc.update("""
            insert into public.preferencias_notificacion(id_usuario,correo_reservas,recordatorios)
            values (?,?,?) on conflict(id_usuario) do update set correo_reservas=excluded.correo_reservas,
                recordatorios=excluded.recordatorios,fecha_actualizacion=now()
            """,UUID.fromString(user.id()),p.bookingEmails(),p.reminders());
        return new Preferences(p.bookingEmails(),p.reminders(),mail.available());
    }
}
