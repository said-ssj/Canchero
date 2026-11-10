package pe.canchero.backend.web.controller;

import java.util.Base64;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@RestController
@RequestMapping("/api/auth/profile")
public class PlayerProfileController {
    private final JdbcTemplate jdbc;

    public PlayerProfileController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public Profile profile(@RequestAttribute("auth.user") AuthUserDto user) {
        return jdbc.queryForObject("""
                select u.nombre, u.apellido, u.telefono, p.direccion, p.foto, p.id_usuario is not null, p.id_distrito
                from public.usuario u left join public.perfil_jugador p on p.id_usuario = u.id_usuario
                where u.id_usuario = ?
                """, (rs, row) -> new Profile(rs.getString(1), rs.getString(2), rs.getString(3),
                rs.getString(4), rs.getString(5), rs.getBoolean(6), rs.getObject(7, Integer.class)), UUID.fromString(user.id()));
    }

    @PutMapping
    @Transactional
    public Profile save(@RequestAttribute("auth.user") AuthUserDto user, @RequestBody Profile input) {
        String nombre = field(input.nombre(), 80, true);
        String apellido = field(input.apellido(), 80, true);
        String telefono = field(input.telefono(), 20, false);
        String direccion = field(input.direccion(), 180, false);
        Integer districtId = input.idDistrito();
        if (districtId != null && !Boolean.TRUE.equals(jdbc.queryForObject("""
                select exists (
                    select 1 from public.distrito d
                    join public.provincia p on p.id_provincia = d.id_provincia
                    join public.departamento dep on dep.id_departamento = p.id_departamento
                    where d.id_distrito = ? and d.estado = 'A' and p.estado = 'A' and dep.estado = 'A'
                )
                """, Boolean.class, districtId))) throw invalid();
        String foto = input.foto();
        if (foto != null && !foto.isEmpty()) {
            if (foto.startsWith("https://") || foto.startsWith("http://")) {
                if (foto.length() > 500) throw invalid();
            } else {
                String prefix = "data:image/jpeg;base64,";
                if (!foto.startsWith(prefix) || foto.length() > 150_000) throw invalid();
                try {
                    byte[] bytes = Base64.getDecoder().decode(foto.substring(prefix.length()));
                    if (bytes.length < 4 || bytes[0] != (byte) 0xff || bytes[1] != (byte) 0xd8
                            || bytes[2] != (byte) 0xff) throw invalid();
                } catch (IllegalArgumentException ex) {
                    throw invalid();
                }
            }
        }
        if (!telefono.isEmpty() && !telefono.matches("[+0-9 ()-]{7,20}")) throw invalid();
        int updated = jdbc.update("""
                update public.usuario
                set nombre = ?, apellido = ?, telefono = ?
                where id_usuario = ? and estado = 'A'
                """, nombre, apellido, telefono, UUID.fromString(user.id()));
        if (updated != 1) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        jdbc.update("""
                insert into public.perfil_jugador (id_usuario, direccion, foto, id_distrito) values (?, ?, ?, ?)
                on conflict (id_usuario) do update set direccion = excluded.direccion, foto = excluded.foto, id_distrito = excluded.id_distrito
                """, UUID.fromString(user.id()), direccion, foto, districtId);
        return new Profile(nombre, apellido, telefono, direccion, foto, true, districtId);
    }

    private static String field(String value, int limit, boolean required) {
        String normalized = value == null ? "" : value.strip();
        if ((required && normalized.isEmpty()) || normalized.length() > limit) throw invalid();
        return normalized;
    }

    private static ResponseStatusException invalid() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Revisa los datos del perfil");
    }

    public record Profile(String nombre, String apellido, String telefono, String direccion, String foto, boolean completo, Integer idDistrito) {}
}
