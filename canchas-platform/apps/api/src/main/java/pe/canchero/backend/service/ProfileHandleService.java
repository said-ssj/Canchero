package pe.canchero.backend.service;

import java.util.Locale;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class ProfileHandleService {
 public record State(String handle,String nextChangeAt,boolean canChange){}
 private final JdbcTemplate jdbc;
 public ProfileHandleService(JdbcTemplate jdbc){this.jdbc=jdbc;}
 private UUID id(AuthUserDto user){if(user==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED);return UUID.fromString(user.id());}
 public State state(AuthUserDto user){
  var rows=jdbc.query("""
    select identificador,
      ((identificador_cambiado_en AT TIME ZONE 'America/Lima') + interval '3 months') AT TIME ZONE 'America/Lima' as proximo,
      identificador_cambiado_en is null or now() >= ((identificador_cambiado_en AT TIME ZONE 'America/Lima') + interval '3 months') AT TIME ZONE 'America/Lima' as permitido
    from perfil_comunidad where id_usuario=?
    """,(r,n)->new State(r.getString(1),r.getObject(2)==null?null:r.getObject(2,java.time.OffsetDateTime.class).toString(),r.getBoolean(3)),id(user));
  return rows.isEmpty()?new State(null,null,true):rows.getFirst();
 }
 @Transactional
 public State change(AuthUserDto user,String raw){
  UUID id=id(user);String value=raw==null?"":raw.strip().toLowerCase(Locale.ROOT).replaceFirst("^@","");
  if(!value.matches("[a-z0-9_.-]{3,30}"))throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Usa de 3 a 30 letras, numeros, puntos o guiones");
  jdbc.update("insert into perfil_comunidad(id_usuario) values(?) on conflict(id_usuario) do nothing",id);
  jdbc.queryForList("select id_usuario from perfil_comunidad where id_usuario=? for update",id);
  State current=state(user);
  if(value.equals(current.handle()))return current;
  if(!current.canChange())throw new ResponseStatusException(HttpStatus.CONFLICT,"Podras cambiar tu identificador desde "+current.nextChangeAt());
  try {jdbc.update("update perfil_comunidad set identificador=?,actualizado_en=now() where id_usuario=?",value,id);}
  catch(DataIntegrityViolationException ex){throw new ResponseStatusException(HttpStatus.CONFLICT,"Ese identificador ya esta ocupado o todavia no puedes cambiarlo");}
  return state(user);
 }
}
