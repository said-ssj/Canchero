package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import java.util.*;

@Service
public class ChatService {
    private final JdbcTemplate jdbc;
    public ChatService(JdbcTemplate jdbc) { this.jdbc=jdbc; }
    public record Conversation(String id,String peerId,String name,String photo,String lastMessage,String updatedAt,
                               int unread,boolean blockedByMe,boolean canSend,String handle,boolean following,
                               boolean incomingRequest,boolean outgoingRequest,boolean restrictedProfile) {
        public Conversation(String id,String peerId,String name,String photo,String lastMessage,String updatedAt,int unread,boolean blockedByMe,boolean canSend){this(id,peerId,name,photo,lastMessage,updatedAt,unread,blockedByMe,canSend,null,false,false,false,false);}
    }
    public record Contact(String id,String name,String photo,String handle){}
    private boolean follows(UUID one,UUID two){return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from seguimiento_perfil where id_seguidor=? and id_seguido=?)",Boolean.class,one,two));}
    public List<Contact> contacts(AuthUserDto user,String q){
        if(q!=null&&q.length()>80)throw error(HttpStatus.BAD_REQUEST,"Usa una búsqueda de hasta 80 caracteres");
        UUID me=actor(user); String pattern="%"+Objects.toString(q,"").strip().toLowerCase(Locale.ROOT).replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
        return jdbc.query("""
          select u.id_usuario,concat_ws(' ',u.nombre,u.apellido),p.foto,pc.identificador
          from seguimiento_perfil f join usuario u on u.id_usuario=f.id_seguido
          left join perfil_jugador p on p.id_usuario=u.id_usuario left join perfil_comunidad pc on pc.id_usuario=u.id_usuario
          where f.id_seguidor=? and u.estado='A'
            and not exists(select 1 from chat_bloqueo b where (b.id_usuario=? and b.id_bloqueado=u.id_usuario) or (b.id_usuario=u.id_usuario and b.id_bloqueado=?))
            and (lower(concat_ws(' ',u.nombre,u.apellido)) like ? or pc.identificador like ?)
          order by u.nombre,u.id_usuario limit 50
          """,(r,n)->new Contact(r.getString(1),r.getString(2),r.getString(3),r.getString(4)),me,me,me,pattern,pattern);
    }
    public record Message(String id,String conversationId,String authorId,String text,String createdAt,String requestId) {}
    public record MessagePage(List<Message> items,boolean hasMore) {}
    private UUID actor(AuthUserDto user) { return UUID.fromString(user.id()); }
    private void schema() {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select to_regclass('public.chat_conversacion') is not null",Boolean.class)))
            throw error(HttpStatus.SERVICE_UNAVAILABLE,"Los mensajes todavía no están habilitados");
    }
    private void active(UUID id) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from public.usuario where id_usuario=? and estado='A')",Boolean.class,id)))
            throw error(HttpStatus.NOT_FOUND,"Usuario no disponible");
    }
    private void lockPair(UUID first,UUID second) {
        // Mismo orden/lock para abrir, bloquear y enviar; evita carreras entre un bloqueo y un envío.
        String pair = first.toString().compareTo(second.toString())<0 ? first+":"+second : second+":"+first;
        jdbc.query("select pg_advisory_xact_lock(hashtextextended(?,0))",(rs,row)->true,pair);
    }
    private boolean blocked(UUID one,UUID two) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            select exists(select 1 from public.chat_bloqueo where
              (id_usuario=? and id_bloqueado=?) or (id_usuario=? and id_bloqueado=?))
            """,Boolean.class,one,two,two,one));
    }
    private UUID member(UUID conversation,UUID user) {
        return jdbc.query("""
            select case when c.usuario_a=? then c.usuario_b else c.usuario_a end
            from public.chat_conversacion c join public.chat_miembro m using(id_conversacion)
            where c.id_conversacion=? and m.id_usuario=?
            """,(rs,row)->rs.getObject(1,UUID.class),user,conversation,user).stream().findFirst()
                .orElseThrow(()->error(HttpStatus.NOT_FOUND,"Conversación no disponible"));
    }
    public List<Conversation> list(AuthUserDto user) {
        schema(); return conversations(actor(user),null);
    }
    private List<Conversation> conversations(UUID user,UUID only) {
        boolean suspended=new CommunitySafetyService(jdbc).status(user).restricted();
        return jdbc.query("""
            select c.id_conversacion,u.id_usuario,trim(concat_ws(' ',u.nombre,u.apellido)) nombre,p.foto,
                   last.contenido,c.actualizada_en,pc.identificador,c.iniciador,c.aceptada_en,
                   exists(select 1 from seguimiento_perfil f where f.id_seguidor=m.id_usuario and f.id_seguido=u.id_usuario) following,
                   exists(select 1 from chat_bloqueo b where (b.id_usuario=m.id_usuario and b.id_bloqueado=u.id_usuario) or (b.id_usuario=u.id_usuario and b.id_bloqueado=m.id_usuario)) hidden,
                   exists(select 1 from chat_mensaje sent where sent.id_conversacion=c.id_conversacion and sent.id_autor=m.id_usuario) sent,
                   (select count(*) from public.chat_mensaje x where x.id_conversacion=c.id_conversacion
                       and x.id_autor<>? and x.id_mensaje>m.ultimo_leido) unread,
                   exists(select 1 from public.chat_bloqueo b where b.id_usuario=? and b.id_bloqueado=u.id_usuario) mine,
                   u.estado='A' and not exists(select 1 from public.chat_bloqueo b where
                       (b.id_usuario=? and b.id_bloqueado=u.id_usuario) or (b.id_usuario=u.id_usuario and b.id_bloqueado=?)) can_send
            from public.chat_miembro m join public.chat_conversacion c using(id_conversacion)
            join public.usuario u on u.id_usuario=case when c.usuario_a=? then c.usuario_b else c.usuario_a end
            left join public.perfil_jugador p on p.id_usuario=u.id_usuario
            left join public.perfil_comunidad pc on pc.id_usuario=u.id_usuario
            left join lateral (select contenido from public.chat_mensaje where id_conversacion=c.id_conversacion
                               order by id_mensaje desc limit 1) last on true
            where m.id_usuario=? and (?::uuid is null or c.id_conversacion=?)
              and (c.aceptada_en is not null or c.iniciador=m.id_usuario or exists(select 1 from chat_mensaje visible where visible.id_conversacion=c.id_conversacion))
            order by c.actualizada_en desc,c.id_conversacion limit 100
            """,(rs,row)->{
                boolean hidden=rs.getBoolean("hidden"), accepted=rs.getTimestamp("aceptada_en")!=null;
                boolean initiator=user.toString().equals(rs.getString("iniciador"));
                return new Conversation(rs.getString(1),rs.getString(2),hidden?"Usuario Canchero":rs.getString(3),hidden?null:rs.getString(4),
                    rs.getString(5),rs.getString(6),rs.getInt("unread"),rs.getBoolean("mine"),!suspended&&rs.getBoolean("can_send")&&(accepted||initiator&&!rs.getBoolean("sent")),hidden?null:rs.getString("identificador"),!hidden&&rs.getBoolean("following"),!hidden&&!accepted&&!initiator,!hidden&&!accepted&&initiator,hidden);
            },
                user,user,user,user,user,user,only,only);
    }
    @Transactional
    public Conversation open(AuthUserDto user,UUID peer) {
        schema(); UUID me=actor(user); active(me); active(peer);
        if(me.equals(peer)) throw error(HttpStatus.BAD_REQUEST,"Elige a otra persona");
        lockPair(me,peer);
        if(blocked(me,peer)) throw error(HttpStatus.FORBIDDEN,"No puedes iniciar esta conversación");
        new CommunitySafetyService(jdbc).requireWritable(me);
        UUID a=me.toString().compareTo(peer.toString())<0?me:peer, b=a.equals(me)?peer:me;
        var existing=jdbc.query("select id_conversacion from chat_conversacion where usuario_a=? and usuario_b=?",(r,n)->r.getObject(1,UUID.class),a,b);
        if(!existing.isEmpty()){
            if(follows(me,peer))jdbc.update("update chat_conversacion set iniciador=?,aceptada_en=case when ? then now() else null end where id_conversacion=? and iniciador is null and aceptada_en is null",me,follows(peer,me),existing.getFirst());
            if(follows(me,peer)&&follows(peer,me))jdbc.update("update chat_conversacion set aceptada_en=coalesce(aceptada_en,now()) where id_conversacion=?",existing.getFirst());
            var visible=conversations(me,existing.getFirst());
            if(visible.isEmpty())throw error(HttpStatus.CONFLICT,"Todavía no hay mensajes en esta solicitud");
            return visible.getFirst();
        }
        if(!follows(me,peer))throw error(HttpStatus.FORBIDDEN,"Sigue a esta persona para enviarle una solicitud de mensaje");
        jdbc.query("select pg_advisory_xact_lock(hashtextextended(?,4))",(r,n)->true,me.toString());
        if(jdbc.queryForObject("select count(*) from chat_conversacion where iniciador=? and creada_en>now()-interval '1 day'",Integer.class,me)>=10)throw error(HttpStatus.TOO_MANY_REQUESTS,"Alcanzaste el límite de nuevas solicitudes de hoy");
        UUID id=jdbc.queryForObject("""
            insert into public.chat_conversacion(usuario_a,usuario_b,iniciador,aceptada_en) values (?,?,?,case when ? then now() else null end)
            on conflict(usuario_a,usuario_b) do update set usuario_a=excluded.usuario_a returning id_conversacion
            """,UUID.class,a,b,me,follows(peer,me));
        jdbc.update("insert into public.chat_miembro(id_conversacion,id_usuario) values (?,?),(?,?) on conflict do nothing",id,a,id,b);
        return conversations(me,id).getFirst();
    }
    @Transactional public Conversation accept(AuthUserDto user,UUID id){
        UUID me=actor(user),peer=member(id,me);lockPair(me,peer);active(me);active(peer);
        new CommunitySafetyService(jdbc).requireWritable(me);
        if(blocked(me,peer))throw error(HttpStatus.FORBIDDEN,"Esta conversación no está disponible");
        UUID initiator=jdbc.queryForObject("select iniciador from chat_conversacion where id_conversacion=?",UUID.class,id);
        if(me.equals(initiator))throw error(HttpStatus.BAD_REQUEST,"Solo quien recibe la solicitud puede aceptarla");
        if(!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from chat_mensaje where id_conversacion=? and id_autor=?)",Boolean.class,id,peer)))throw error(HttpStatus.CONFLICT,"La solicitud todavía no tiene un mensaje");
        jdbc.update("insert into seguimiento_perfil(id_seguidor,id_seguido) values(?,?) on conflict do nothing",me,peer);
        jdbc.update("update chat_conversacion set aceptada_en=coalesce(aceptada_en,now()) where id_conversacion=?",id);
        notifyPair(me,peer,id);return conversations(me,id).getFirst();
    }
    private void notifyPair(UUID me,UUID peer,UUID id){for(UUID user:List.of(me,peer))jdbc.query("select realtime.send(jsonb_build_object('conversationId',?::text),'changed',?::text,true)",(r,n)->true,id.toString(),"chat-user:"+user);}
    public MessagePage messages(AuthUserDto user,UUID id,Long before,Long after) {
        schema(); member(id,actor(user));
        if((before!=null&&before<=0)||(after!=null&&after<=0)||(before!=null&&after!=null)) throw error(HttpStatus.BAD_REQUEST,"Cursor inválido");
        var rows=jdbc.query("""
            select id_mensaje,id_conversacion,id_autor,contenido,creado_en,id_solicitud from public.chat_mensaje
            where id_conversacion=? and (?::bigint is null or id_mensaje<?)
              and (?::bigint is null or id_mensaje>?) order by id_mensaje
            """+(after==null?" desc":" asc")+" limit 41",(rs,row)->new Message(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),
                    rs.getTimestamp(5).toInstant().toString(),rs.getString(6)),id,before,before,after,after);
        boolean more=rows.size()>40;
        var page=new ArrayList<>(rows.subList(0,Math.min(40,rows.size()))); if(after==null) Collections.reverse(page);
        return new MessagePage(page,more);
    }
    @Transactional
    public Message send(AuthUserDto user,UUID id,String text,UUID requestId) {
        schema(); UUID me=actor(user), peer=member(id,me);
        if(text==null||text.strip().isEmpty()||text.codePointCount(0,text.length())>4000||requestId==null)
            throw error(HttpStatus.BAD_REQUEST,"Escribe un mensaje de 1 a 4000 caracteres");
        String content=text.strip(); lockPair(me,peer); active(me); active(peer);
        if(blocked(me,peer)) throw error(HttpStatus.FORBIDDEN,"Esta conversación no permite nuevos mensajes");
        new CommunitySafetyService(jdbc).requireWritable(me);
        jdbc.query("select pg_advisory_xact_lock(hashtextextended(?,1))",(rs,row)->true,me.toString());
        var previous=jdbc.query("""
            select id_mensaje,id_conversacion,id_autor,contenido,creado_en,id_solicitud
            from public.chat_mensaje where id_autor=? and id_solicitud=?
            """,(rs,row)->new Message(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getTimestamp(5).toInstant().toString(),rs.getString(6)),me,requestId);
        if(!previous.isEmpty()) {
            Message old=previous.getFirst();
            if(!old.conversationId().equals(id.toString())||!old.text().equals(content))
                throw error(HttpStatus.CONFLICT,"Ese envío ya corresponde a otro mensaje");
            return old;
        }
        var state=conversations(me,id).getFirst();
        if(!state.canSend())throw error(HttpStatus.CONFLICT,"Ya enviaste tu solicitud. Espera a que la otra persona te siga para continuar.");
        if(state.outgoingRequest()&&!follows(me,peer))throw error(HttpStatus.FORBIDDEN,"Debes seguir a esta persona para enviar la solicitud");
        // Serializa la cuota por autor, incluso cuando escribe a varias personas simultáneamente.
        if(jdbc.queryForObject("select count(*) from public.chat_mensaje where id_autor=? and creado_en>now()-interval '1 minute'",Integer.class,me)>=30)
            throw error(HttpStatus.TOO_MANY_REQUESTS,"Espera un momento antes de enviar más mensajes");
        return jdbc.queryForObject("""
            insert into public.chat_mensaje(id_conversacion,id_autor,id_solicitud,contenido) values (?,?,?,?)
            returning id_mensaje,id_conversacion,id_autor,contenido,creado_en,id_solicitud
            """,(rs,row)->new Message(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getTimestamp(5).toInstant().toString(),rs.getString(6)),id,me,requestId,content);
    }
    @Transactional
    public void read(AuthUserDto user,UUID id,long through) {
        schema(); member(id,actor(user));
        if(through<=0||!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from public.chat_mensaje where id_conversacion=? and id_mensaje=?)",Boolean.class,id,through)))
            throw error(HttpStatus.BAD_REQUEST,"Mensaje no disponible");
        jdbc.update("update public.chat_miembro set ultimo_leido=greatest(ultimo_leido,?) where id_conversacion=? and id_usuario=?",through,id,actor(user));
    }
    @Transactional
    public void block(AuthUserDto user,UUID peer,boolean enabled) {
        schema(); UUID me=actor(user); active(peer);
        if(me.equals(peer)) throw error(HttpStatus.BAD_REQUEST,"No puedes bloquearte a ti mismo");
        lockPair(me,peer);
        if(enabled) {
            jdbc.update("insert into public.chat_bloqueo(id_usuario,id_bloqueado) values (?,?) on conflict do nothing",me,peer);
            jdbc.update("delete from seguimiento_perfil where (id_seguidor=? and id_seguido=?) or (id_seguidor=? and id_seguido=?)",me,peer,peer,me);
        }
        else jdbc.update("delete from public.chat_bloqueo where id_usuario=? and id_bloqueado=?",me,peer);
        var ids=jdbc.query("select id_conversacion from chat_conversacion where (usuario_a=? and usuario_b=?) or (usuario_a=? and usuario_b=?)",(r,n)->r.getObject(1,UUID.class),me,peer,peer,me);
        if(!ids.isEmpty())notifyPair(me,peer,ids.getFirst());
    }
    public Map<String,Boolean> relationship(AuthUserDto user,UUID peer) {
        schema(); return Map.of("blockedByMe",Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from public.chat_bloqueo where id_usuario=? and id_bloqueado=?)",Boolean.class,actor(user),peer)));
    }
    @Transactional
    public void report(AuthUserDto user,UUID id,String reason) {
        report(user,id,"otros",reason,false);
    }
    @Transactional public void report(AuthUserDto user,UUID id,String category,String reason,boolean block){
        schema(); UUID me=actor(user),peer=member(id,me); active(me);
        if(!Set.of("acoso","spam","estafa","odio","violencia","sexual","suplantacion","otros").contains(Objects.toString(category,"")))throw error(HttpStatus.BAD_REQUEST,"Selecciona un motivo del reporte");
        if(!"otros".equals(category)&& (reason==null||reason.isBlank()))reason=category+" en la conversación";
        if("otros".equals(category)&&(reason==null||reason.strip().length()<10))throw error(HttpStatus.BAD_REQUEST,"Describe el problema (al menos 10 caracteres)");
        if(!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from chat_mensaje where id_conversacion=? and id_autor=?)",Boolean.class,id,peer)))throw error(HttpStatus.BAD_REQUEST,"Solo puedes reportar una conversación en la que recibiste mensajes");
        lockPair(me,peer);
        jdbc.query("select pg_advisory_xact_lock(hashtextextended(?,3))",(r,n)->true,peer.toString());
        if(reason==null||reason.strip().length()<5||reason.length()>1000) throw error(HttpStatus.BAD_REQUEST,"Describe el motivo del reporte (5 a 1000 caracteres)");
        jdbc.query("select pg_advisory_xact_lock(hashtextextended(?,2))",(rs,row)->true,me.toString());
        if(jdbc.queryForObject("select count(*) from public.chat_reporte where id_autor=? and creado_en>now()-interval '1 day'",Integer.class,me)>=5)
            throw error(HttpStatus.TOO_MANY_REQUESTS,"Alcanzaste el límite de reportes de hoy");
        if(Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from chat_reporte where id_autor=? and id_reportado=? and (estado='pendiente' or creado_en>now()-interval '30 days'))",Boolean.class,me,peer))){if(block)block(user,peer,true);return;}
        boolean qualified=Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from usuario u join perfil_jugador p on p.id_usuario=u.id_usuario where u.id_usuario=? and u.estado='A' and u.feccre<now()-interval '7 days' and length(btrim(coalesce(u.nombre,'')))>0 and length(btrim(coalesce(u.apellido,'')))>0)",Boolean.class,me));
        jdbc.update("insert into public.chat_reporte(id_conversacion,id_autor,motivo,id_reportado,categoria,calificado) values (?,?,?,?,?,?)",id,me,reason.strip(),peer,category,qualified);
        if(block)block(user,peer,true);
        new CommunitySafetyService(jdbc).evaluate(peer);
    }
    private ResponseStatusException error(HttpStatus status,String text) {return new ResponseStatusException(status,text);}
}
