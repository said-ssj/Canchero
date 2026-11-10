package pe.canchero.backend.service;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class TeamService {
    private final JdbcTemplate jdbc;
    public TeamService(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Assignment(String email, String rol) {}
    public record VenueScope(int sedeId, List<String> permisos) {}

    public List<VenueScope> myVenues(AuthUserDto user) {
        TenantPermissions access=new TenantPermissions(jdbc);
        return access.venues(user,"sede.ver").stream().map(id -> new VenueScope(id,
                jdbc.queryForList("select codigo from permiso_sede where public.tiene_permiso_sede(?,?,codigo) order by codigo",
                        String.class,UUID.fromString(user.id()),id))).toList();
    }

    public List<Map<String,Object>> members(int venueId,AuthUserDto user) {
        new TenantPermissions(jdbc).require(user,venueId,"personal.gestionar");
        return jdbc.queryForList("""
                select a.id_asignacion,a.id_sede,a.rol_codigo,a.estado,u.id_usuario,u.nombre,u.apellido,u.correo
                from asignacion_sede a join miembro_negocio m on m.id_miembro=a.id_miembro and m.id_negocio=a.id_negocio
                join usuario u on u.id_usuario=m.id_usuario where a.id_sede=? order by u.nombre,a.rol_codigo
                """,venueId);
    }

    public List<Map<String,Object>> agenda(int venueId,AuthUserDto user) {
        new TenantPermissions(jdbc).require(user,venueId,"reserva.agenda");
        return jdbc.queryForList("""
                select r.id_reserva,c.id_cancha,c.nombre_numero as cancha,r.fecha_reserva,r.hora_inicio,r.hora_fin,er.nombre as estado_reserva
                from reserva r join cancha c on c.id_cancha=r.id_cancha
                join estado_reserva er on er.id_estado_reserva=r.id_estado_reserva
                where c.id_sede=? and r.estado='A' order by r.fecha_reserva desc,r.hora_inicio desc limit 200
                """,venueId);
    }

    @Transactional
    public long assign(int venueId,Assignment request,AuthUserDto user) {
        new TenantPermissions(jdbc).require(user,venueId,"personal.gestionar");
        if(request==null || request.email()==null || request.rol()==null)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Indica correo y rol operativo");
        String role=request.rol().trim().toLowerCase(java.util.Locale.ROOT);
        if(!java.util.Set.of("admin","cajero","ayudante","almacen").contains(role))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Rol operativo no permitido");
        var users=jdbc.queryForList("select id_usuario from usuario where lower(correo)=lower(?) and estado='A'",UUID.class,request.email().trim());
        if(users.size()!=1) throw new ResponseStatusException(HttpStatus.NOT_FOUND,"La cuenta debe existir y estar activa");
        Long business=jdbc.queryForObject("select id_negocio from sede where id_sede=? for share",Long.class,venueId);
        jdbc.update("""
                insert into miembro_negocio(id_negocio,id_usuario) values(?,?)
                on conflict(id_negocio,id_usuario) do nothing
                """,business,users.get(0));
        var members=jdbc.queryForList("select id_miembro from miembro_negocio where id_negocio=? and id_usuario=? and estado='A' for share",Long.class,business,users.get(0));
        if(members.isEmpty())throw new ResponseStatusException(HttpStatus.CONFLICT,"La membresia esta inactiva; requiere revision del propietario");
        Long member=members.get(0);
        return jdbc.queryForObject("""
                insert into asignacion_sede(id_negocio,id_miembro,id_sede,rol_codigo) values(?,?,?,?)
                on conflict(id_miembro,id_sede,rol_codigo) do update set estado='A' returning id_asignacion
                """,Long.class,business,member,venueId,role);
    }

    @Transactional
    public void revoke(long assignmentId,AuthUserDto user) {
        var ids=jdbc.queryForList("select id_sede from asignacion_sede where id_asignacion=? for update",Integer.class,assignmentId);
        if(ids.isEmpty())throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Asignacion no encontrada");
        new TenantPermissions(jdbc).require(user,ids.get(0),"personal.gestionar");
        jdbc.update("update asignacion_sede set estado='I' where id_asignacion=?",assignmentId);
    }
}
