package pe.canchero.backend.service;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.config.PasswordUtil;
import pe.canchero.backend.web.dto.AuthUserDto;
@Service
public class AccountPasswordService {
 private final JdbcTemplate jdbc;
 public AccountPasswordService(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public void change(AuthUserDto user,String current,String next){
  if(user==null)throw new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Inicia sesion");
  if(next==null || next.length()<8 || next.getBytes(StandardCharsets.UTF_8).length>72 || next.equals(current))
   throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Usa una nueva clave de al menos 8 caracteres y hasta 72 bytes");
  UUID id=UUID.fromString(user.id());
  var hashes=jdbc.queryForList("select password_hash from usuario where id_usuario=? and estado='A'",String.class,id);
  if(hashes.isEmpty() || current==null || !PasswordUtil.matches(current,hashes.getFirst()))
   throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"La contrasena actual no es correcta. Si accedes solo con Google, utiliza recuperar contrasena para crearla.");
  String old=hashes.getFirst(),encoded=PasswordUtil.hash(next);
  int changed=jdbc.update("update usuario set password_hash=? where id_usuario=? and password_hash=? and estado='A'",encoded,id,old);
  if(changed!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"La cuenta cambio durante la operacion. Intenta de nuevo.");
 }
}
