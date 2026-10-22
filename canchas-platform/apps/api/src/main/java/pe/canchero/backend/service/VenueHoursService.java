package pe.canchero.backend.service;

import java.sql.Time;
import java.time.LocalTime;
import java.util.HashSet;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class VenueHoursService {
    public record DayHours(Integer diaSemana, LocalTime apertura, LocalTime cierre, Boolean activo) {}

    private final JdbcTemplate jdbc;

    public VenueHoursService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<DayHours> list(int sedeId) {
        return jdbc.query("""
                select dia_semana, apertura, cierre, estado from tipo_horario
                where id_sede = ? order by dia_semana, id_tipo_horario
                """, (rs, row) -> new DayHours(rs.getInt("dia_semana"),
                rs.getTime("apertura").toLocalTime(), rs.getTime("cierre").toLocalTime(),
                "A".equals(rs.getString("estado"))), sedeId);
    }

    @Transactional
    public List<DayHours> save(int sedeId, AuthUserDto user, List<DayHours> days) {
        if (user == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);
        }
        validate(days);
        // Serialize saves for this venue and verify ownership using the authenticated user.
        var owners = jdbc.queryForList(
                "select id_dueno from sede where id_sede = ? for update", String.class, sedeId);
        if (owners.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Sede no encontrada");
        }
        if (!user.id().equals(owners.get(0))) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "La sede no pertenece a tu cuenta");
        }
        jdbc.update("delete from tipo_horario where id_sede = ?", sedeId);
        for (var day : days) {
            jdbc.update("""
                    insert into tipo_horario (id_sede, dia_semana, apertura, cierre, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, 'API', 'SPRING')
                    """, sedeId, day.diaSemana(), Time.valueOf(day.apertura()), Time.valueOf(day.cierre()),
                    day.activo() ? "A" : "I");
        }
        return list(sedeId);
    }

    static void validate(List<DayHours> days) {
        if (days == null || days.size() != 7) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Configura los siete dias");
        }
        var seen = new HashSet<Integer>();
        for (var day : days) {
            if (day == null || day.diaSemana() == null || day.diaSemana() < 0 || day.diaSemana() > 6
                    || !seen.add(day.diaSemana()) || day.apertura() == null || day.cierre() == null
                    || day.activo() == null
                    || (day.activo() && day.apertura().equals(day.cierre()))) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Horario semanal invalido");
            }
        }
    }
}
