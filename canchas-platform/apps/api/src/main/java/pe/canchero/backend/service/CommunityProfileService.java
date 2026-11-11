package pe.canchero.backend.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.*;
import java.io.ByteArrayInputStream;
import javax.imageio.ImageIO;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class CommunityProfileService {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    public CommunityProfileService(JdbcTemplate jdbc, ObjectMapper json) { this.jdbc=jdbc; this.json=json; }
    public record VenueItem(String id, String name, String address, String phone, String photo, String district, String city) {}
    public record ReviewItem(String venueId, String venueName, String author, int rating, String text, String date) {}
    public record Post(String id, String authorId, String text, List<String> photos, String createdAt) {}
    public record PostPage(List<Post> items, boolean hasMore) {}
    public record Settings(String biography,String whatsapp,String cover,String photo,boolean updatePhoto) {
        public Settings(String biography,String whatsapp,String cover){this(biography,whatsapp,cover,null,false);}
    }
    public record Owner(String id, String name, String photo) {}
    public record MutualFollower(String id, String name, String photo) {}
    public record ProfileSearchResult(String id,String name,String photo,String role,String handle) {}
    public Owner venueOwner(int venueId) {
        return jdbc.query("""
            select u.id_usuario, trim(concat_ws(' ',u.nombre,u.apellido)), p.foto
            from sede s join usuario u on u.id_usuario=s.id_dueno
            left join perfil_jugador p on p.id_usuario=u.id_usuario
            where s.id_sede=? and s.estado='A' and u.estado='A'
            """, (rs,row)->new Owner(rs.getString(1),rs.getString(2),rs.getString(3)),venueId).stream().findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Dueño no encontrado"));
    }
    public record Profile(String id, String name, String photo, String role, String biography, String whatsapp, String cover,
            long followers, long following, long postCount, List<VenueItem> venues, long reviewCount, Double rating, List<ReviewItem> reviews,String handle) {
        public Profile(String id,String name,String photo,String role,String biography,String whatsapp,String cover,long followers,long following,long postCount,List<VenueItem> venues,long reviewCount,Double rating,List<ReviewItem> reviews){this(id,name,photo,role,biography,whatsapp,cover,followers,following,postCount,venues,reviewCount,rating,reviews,null);}
    }
    private void requireSchema() {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select to_regclass('public.perfil_comunidad') is not null and to_regclass('public.publicacion_perfil') is not null and to_regclass('public.seguimiento_perfil') is not null",Boolean.class)))
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,"La comunidad aún no está habilitada");
    }
    private void requireUser(UUID id) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from usuario where id_usuario=? and estado='A')",Boolean.class,id)))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Perfil no encontrado");
    }
    public Profile profile(UUID id) {
        requireSchema(); requireUser(id);
        var base=jdbc.queryForMap("""
            select trim(concat_ws(' ',nullif(u.nombre,''),nullif(u.apellido,''))) as name,
                   p.foto, r.nombre as role, coalesce(pc.biografia,'') as bio,
                   coalesce(pc.whatsapp_publico,'') as whatsapp, pc.portada,pc.identificador
            from usuario u join rol r on r.id_rol=u.id_rol
            left join perfil_jugador p on p.id_usuario=u.id_usuario
            left join perfil_comunidad pc on pc.id_usuario=u.id_usuario
            where u.id_usuario=? and u.estado='A'
            """,id);
        // Strict ownership, including for platform administrators: never their global management scope.
        var venues=jdbc.query("""
            select s.id_sede,s.nombre,s.direccion,s.telefono,s.imagen_url,d.nombre as distrito,p.nombre as ciudad
            from sede s left join distrito d on d.id_distrito=s.id_distrito
            left join provincia p on p.id_provincia=d.id_provincia
            where s.id_dueno=? and s.estado='A' order by s.nombre,s.id_sede
            """,(rs,row)->new VenueItem(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5),rs.getString(6),rs.getString(7)),id);
        var stats=jdbc.queryForMap("""
            select count(*) as total,avg(r.puntuacion)::double precision as promedio
            from resena r join sede s on s.id_sede=r.id_sede
            where s.id_dueno=? and s.estado='A' and r.estado='A' and not r.es_sintetica
            """,id);
        var reviews=jdbc.query("""
            select s.id_sede,s.nombre,trim(concat_ws(' ',c.nombres,c.apellidos)),r.puntuacion,r.comentario,r.fecha_creacion
            from resena r join sede s on s.id_sede=r.id_sede join cliente c on c.id_cliente=r.id_cliente
            where s.id_dueno=? and s.estado='A' and r.estado='A' and not r.es_sintetica
            order by r.fecha_creacion desc,r.id_resena desc limit 20
            """,(rs,row)->new ReviewItem(rs.getString(1),rs.getString(2),rs.getString(3),rs.getInt(4),rs.getString(5),rs.getString(6)),id);
        return new Profile(id.toString(), Objects.toString(base.get("name"),"Usuario"), (String)base.get("foto"),
                !venues.isEmpty() || Roles.isOwner((String)base.get("role")) ? "Dueño" : "Jugador",
                (String)base.get("bio"),(String)base.get("whatsapp"),(String)base.get("portada"),
                count("select count(*) from seguimiento_perfil f join usuario u on u.id_usuario=f.id_seguidor where f.id_seguido=? and u.estado='A'",id),
                count("select count(*) from seguimiento_perfil f join usuario u on u.id_usuario=f.id_seguido where f.id_seguidor=? and u.estado='A'",id),
                count("select count(*) from publicacion_perfil where id_usuario=? and estado='A'",id),venues,
                ((Number)stats.get("total")).longValue(), stats.get("promedio")==null ? null : ((Number)stats.get("promedio")).doubleValue(),reviews,(String)base.get("identificador"));
    }
    private long count(String sql,UUID id) { return Objects.requireNonNull(jdbc.queryForObject(sql,Long.class,id)); }
    public PostPage posts(UUID id,int page) {
        requireSchema(); requireUser(id);
        if (page<0 || page>500) throw invalid("Página inválida");
        var items=jdbc.query("select id_publicacion,id_usuario,texto,fotos::text,creado_en from publicacion_perfil where id_usuario=? and estado='A' order by creado_en desc,id_publicacion desc limit 11 offset ?",
                (rs,row)->new Post(rs.getString(1),rs.getString(2),rs.getString(3),photos(rs.getString(4)),rs.getObject(5,java.time.OffsetDateTime.class).toString()),id,page*10);
        return new PostPage(items.stream().limit(10).toList(),items.size()>10);
    }
    private List<String> photos(String raw) { try {return json.readValue(raw,new TypeReference<List<String>>(){});} catch(Exception e){throw new IllegalStateException("No se pudieron leer las fotos");} }
    @Transactional
    public Post publish(AuthUserDto user,String text,List<String> photos) {
        requireSchema(); UUID author=UUID.fromString(user.id()); requireUser(author);
        String content=text==null?"":text.strip();
        if(photos!=null && photos.stream().anyMatch(Objects::isNull)) throw invalid("Fotos inválidas");
        var images=photos==null?List.<String>of():List.copyOf(photos);
        if(content.length()>2000 || images.size()>4 || (content.isBlank()&&images.isEmpty())) throw invalid("Agrega texto o fotos a tu publicación");
        for(String image:images) validateImage(image);
        String raw; try{raw=json.writeValueAsString(images);}catch(Exception e){throw invalid("Fotos inválidas");}
        UUID post=UUID.randomUUID();
        jdbc.update("insert into publicacion_perfil(id_publicacion,id_usuario,texto,fotos) values(?,?,?,?::jsonb)",post,author,content,raw);
        return jdbc.queryForObject("select creado_en from publicacion_perfil where id_publicacion=?",(rs,row)->new Post(post.toString(),author.toString(),content,images,rs.getObject(1,java.time.OffsetDateTime.class).toString()),post);
    }
    @Transactional
    public void deletePost(AuthUserDto user,UUID post) {
        requireSchema();
        if(jdbc.update("update publicacion_perfil set estado='I' where id_publicacion=? and id_usuario=? and estado='A'",post,UUID.fromString(user.id()))!=1)
            throw new ResponseStatusException(HttpStatus.NOT_FOUND,"Publicación no encontrada");
    }
    @Transactional
    public Settings saveSettings(AuthUserDto user,Settings settings) {
        requireSchema(); UUID id=UUID.fromString(user.id()); requireUser(id);
        String bio=Objects.toString(settings.biography(),"").strip();
        String whatsapp=Objects.toString(settings.whatsapp(),"").replaceAll("[ ()+\\-]","");
        if(bio.length()>500 || (!whatsapp.isEmpty()&&!whatsapp.matches("[1-9][0-9]{9,14}"))) throw invalid("Revisa tu presentación y WhatsApp con código de país");
        String cover=settings.cover(); if(cover!=null&&!cover.isBlank()) validateImage(cover); else cover=null;
        jdbc.update("""
            insert into perfil_comunidad(id_usuario,biografia,whatsapp_publico,portada) values(?,?,?,?)
            on conflict(id_usuario) do update set biografia=excluded.biografia,whatsapp_publico=excluded.whatsapp_publico,portada=excluded.portada,actualizado_en=now()
            """,id,bio,whatsapp,cover);
        if(settings.updatePhoto()) {
            String photo=settings.photo();
            if(photo!=null && !photo.isBlank())validateImage(photo); else photo=null;
            jdbc.update("insert into perfil_jugador(id_usuario,foto) values(?,?) on conflict(id_usuario) do update set foto=excluded.foto",id,photo);
        }
        return new Settings(bio,whatsapp,cover,settings.photo(),settings.updatePhoto());
    }
    public boolean following(AuthUserDto user,UUID target) {
        requireSchema(); requireUser(target);
        return Boolean.TRUE.equals(jdbc.queryForObject("select exists(select 1 from seguimiento_perfil where id_seguidor=? and id_seguido=?)",Boolean.class,UUID.fromString(user.id()),target));
    }
    public List<MutualFollower> mutualFollowers(AuthUserDto user, UUID target) {
        requireSchema(); requireUser(target);
        UUID viewer;
        try { viewer = UUID.fromString(user.id()); } catch (Exception e) { return List.of(); }
        if (viewer.equals(target)) return List.of();
        return jdbc.query("""
            select u.id_usuario,
                   trim(concat_ws(' ', nullif(u.nombre,''), nullif(u.apellido,''))) as nombre,
                   p.foto
            from seguimiento_perfil f_target
            join seguimiento_perfil f_viewer on f_viewer.id_seguido = f_target.id_seguidor
            join usuario u on u.id_usuario = f_target.id_seguidor
            left join perfil_jugador p on p.id_usuario = u.id_usuario
            where f_target.id_seguido = ? and f_viewer.id_seguidor = ? and u.estado = 'A'
            order by u.nombre limit 10
            """, (rs, row) -> new MutualFollower(rs.getString(1), Objects.toString(rs.getString(2), "Usuario"), rs.getString(3)), target, viewer);
    }
    public List<ProfileSearchResult> searchProfiles(String query) {
        if(query==null || query.strip().length()<2)return List.of();requireSchema();
        String term=java.text.Normalizer.normalize(query.strip(),java.text.Normalizer.Form.NFD).replaceAll("\\p{M}","").toLowerCase(Locale.ROOT).replaceFirst("^@","");
        String pattern="%"+term.replace("\\","\\\\").replace("%","\\%").replace("_","\\_")+"%";
        return jdbc.query("""
          select u.id_usuario,trim(concat_ws(' ',nullif(u.nombre,''),nullif(u.apellido,''))) as nombre,p.foto,
                 case when exists(select 1 from sede s where s.id_dueno=u.id_usuario and s.estado='A') or lower(r.nombre) in ('dueno','dueño','owner') then 'Dueño' else 'Jugador' end as rol,pc.identificador
          from usuario u left join rol r on r.id_rol=u.id_rol
          left join perfil_jugador p on p.id_usuario=u.id_usuario
          left join perfil_comunidad pc on pc.id_usuario=u.id_usuario
          where u.estado='A' and (p.id_usuario is not null or pc.id_usuario is not null)
            and (translate(lower(trim(concat_ws(' ',nullif(u.nombre,''),nullif(u.apellido,'')))), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun') like ? or pc.identificador like ?)
          order by nombre,u.id_usuario limit 50
          """,(rs,n)->new ProfileSearchResult(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5)),pattern,pattern);
    }

    public void follow(AuthUserDto user,UUID target,boolean follow) {
        requireSchema(); UUID source=UUID.fromString(user.id()); requireUser(source); requireUser(target);
        if(source.equals(target)) throw invalid("No puedes seguirte a ti mismo");
        if(follow) jdbc.update("insert into seguimiento_perfil(id_seguidor,id_seguido) values(?,?) on conflict do nothing",source,target);
        else jdbc.update("delete from seguimiento_perfil where id_seguidor=? and id_seguido=?",source,target);
    }
    private static ResponseStatusException invalid(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST,message); }
    private static void validateImage(String image) {
        if(image==null || !image.startsWith("data:image/jpeg;base64,") || image.length()>150000) throw invalid("Cada foto debe ser JPEG y pesar menos de 110 KB después de optimizarse");
        try {
            byte[] bytes=Base64.getDecoder().decode(image.substring(23));
            try(var stream=ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
                var readers=ImageIO.getImageReaders(stream);
                if(!readers.hasNext()) throw invalid("Imagen inválida");
                var reader=readers.next();
                try { reader.setInput(stream); if(!reader.getFormatName().equalsIgnoreCase("JPEG") || reader.getWidth(0)>1600 || reader.getHeight(0)>1600 || reader.getWidth(0)<1 || reader.getHeight(0)<1) throw invalid("Imagen inválida"); }
                finally {reader.dispose();}
            }
        } catch(ResponseStatusException e){throw e;} catch(Exception e){throw invalid("Imagen inválida");}
    }
}
