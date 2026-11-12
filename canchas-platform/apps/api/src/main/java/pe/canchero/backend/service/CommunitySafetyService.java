package pe.canchero.backend.service;

import java.util.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class CommunitySafetyService {
 private final JdbcTemplate jdbc;
 public CommunitySafetyService(JdbcTemplate jdbc){this.jdbc=jdbc;}
 public boolean blocked(UUID viewer,UUID target){
  if(viewer==null||viewer.equals(target))return false;
  if(!Boolean.TRUE.equals(jdbc.queryForObject("select to_regclass('public.chat_bloqueo') is not null",Boolean.class)))return false;
  return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from chat_bloqueo where (id_usuario=? and id_bloqueado=?) or (id_usuario=? and id_bloqueado=?))",Boolean.class,viewer,target,target,viewer));
 }
 public record Status(boolean restricted,boolean underReview,String until){}
 public Status status(UUID id){
  if(!Boolean.TRUE.equals(jdbc.queryForObject("select to_regclass('public.chat_revision') is not null",Boolean.class)))return new Status(false,false,null);
  var rows=jdbc.query("select coalesce(suspendida_hasta>now(),false),estado='pendiente',suspendida_hasta from chat_revision where id_usuario=?",
   (r,n)->new Status(r.getBoolean(1),r.getBoolean(2),r.getTimestamp(3)==null?null:r.getTimestamp(3).toInstant().toString()),id);
  return rows.isEmpty()?new Status(false,false,null):rows.getFirst();
 }
 public void requireWritable(UUID id){
  jdbc.query("select pg_advisory_xact_lock(hashtextextended(?,3))",(r,n)->true,id.toString());
  if(status(id).restricted())throw new ResponseStatusException(HttpStatus.LOCKED,"Tus mensajes y publicaciones están restringidos temporalmente mientras se revisan reportes. Tus reservas y pases siguen disponibles.");
 }
 public void evaluate(UUID target){
  var counts=jdbc.queryForMap("select count(distinct id_autor) total,count(distinct id_autor) filter(where calificado) calificados,count(distinct id_autor) filter(where creado_en>now()-interval '15 minutes') rapidos from chat_reporte where id_reportado=? and estado='pendiente' and creado_en>now()-interval '30 days'",target);
  int total=((Number)counts.get("total")).intValue(), qualified=((Number)counts.get("calificados")).intValue(), burst=((Number)counts.get("rapidos")).intValue();
  if(qualified<5&&burst<5)return;
  jdbc.update("""
   insert into chat_revision(id_usuario,reportes,calificados,suspendida_hasta) values(?,?,?,case when ?>=5 then now()+interval '24 hours' else null end)
   on conflict(id_usuario) do update set reportes=excluded.reportes,calificados=excluded.calificados,
    suspendida_hasta=case when chat_revision.estado='revisado' or chat_revision.suspendida_hasta is null then excluded.suspendida_hasta else chat_revision.suspendida_hasta end,
    estado='pendiente',actualizada_en=now()
   """,target,total,qualified,qualified);
 }
 private void reviewer(AuthUserDto user){if(user==null||!Roles.isSuperAdmin(user.rol()))throw new ResponseStatusException(HttpStatus.FORBIDDEN,"Solo moderación de plataforma puede revisar reportes");}
 public List<Map<String,Object>> cases(AuthUserDto user){reviewer(user);return jdbc.queryForList("select r.id_usuario::text as id,concat_ws(' ',u.nombre,u.apellido) as nombre,r.estado,r.reportes,r.calificados,r.suspendida_hasta,r.actualizada_en from chat_revision r join usuario u on u.id_usuario=r.id_usuario where r.estado='pendiente' order by r.actualizada_en limit 100");}
 public List<Map<String,Object>> evidence(AuthUserDto user,UUID target){reviewer(user);return jdbc.queryForList("select r.id_reporte::text as id,r.categoria,r.motivo,r.calificado,r.creado_en,(select m.contenido from chat_mensaje m where m.id_conversacion=r.id_conversacion and m.id_autor=r.id_reportado and m.creado_en<=r.creado_en order by m.id_mensaje desc limit 1) as mensaje from chat_reporte r where r.id_reportado=? and r.estado='pendiente' order by r.creado_en limit 100",target);}
 @Transactional public void resolve(AuthUserDto user,UUID target,String decision,String reason){
  reviewer(user);
  if(!Set.of("descartar","mantener").contains(Objects.toString(decision,""))||reason==null||reason.strip().length()<10||reason.length()>1000)throw new ResponseStatusException(HttpStatus.BAD_REQUEST,"Indica una decisión y su motivo (10 a 1000 caracteres)");
  jdbc.query("select pg_advisory_xact_lock(hashtextextended(?,3))",(r,n)->true,target.toString());
  int count=jdbc.update("update chat_revision set estado='revisado',suspendida_hasta=case when ?='descartar' then null else now()+interval '24 hours' end,actualizada_en=now() where id_usuario=? and estado='pendiente'",decision,target);
  if(count!=1)throw new ResponseStatusException(HttpStatus.CONFLICT,"La revisión ya fue resuelta o no existe");
  jdbc.update("update chat_reporte set estado='revisado' where id_reportado=? and estado='pendiente'",target);
  jdbc.update("insert into chat_revision_decision(id_usuario,id_revisor,decision,motivo) values(?,?,?,?)",target,UUID.fromString(user.id()),decision,reason.strip());
 }
}
