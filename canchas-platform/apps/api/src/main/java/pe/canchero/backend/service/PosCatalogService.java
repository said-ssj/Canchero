package pe.canchero.backend.service;

import java.math.BigDecimal;
import java.net.URI;
import java.util.List;
import java.util.Set;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;

@Service
public class PosCatalogService {
    public record Category(int id, String nombre, String descripcion) {}
    public record CategoryRequest(Integer sedeId, String nombre, String descripcion) {}
    public record ProductRequest(Integer sedeId, Integer categoriaId, String nombre, String codigoBarras,
            String descripcion, BigDecimal contenido, String unidadMedida, BigDecimal precioCompra,
            BigDecimal precioVenta, Integer stockInicial, Integer stockMinimo, String fotoUrl) {}
    private final JdbcTemplate jdbc;
    private final VenueAccessService access;
    public PosCatalogService(JdbcTemplate jdbc, VenueAccessService access) { this.jdbc = jdbc; this.access = access; }

    public List<Category> categories(Integer venue, AuthUserDto user) {
        int sede = access.requireOwnedVenue(venue, user, VenueAccessService.PRODUCTO_VER);
        return jdbc.query("""
                select id_categoria, nombre, descripcion from categoria_producto
                where estado='A' and (id_sede is null or id_sede=?) order by nombre
                """, (r,n) -> new Category(r.getInt(1), r.getString(2), r.getString(3)), sede);
    }

    @Transactional
    public Category createCategory(CategoryRequest request, AuthUserDto user) {
        int sede = access.requireOwnedVenue(request.sedeId(), user, VenueAccessService.PRODUCTO_GESTIONAR);
        String nombre = required(request.nombre(), 100, "Nombre de categoría");
        String descripcion = optional(request.descripcion(), 1000, "Descripción");
        lockVenue(sede);
        if (jdbc.queryForObject("""
                select count(*) from categoria_producto where estado='A'
                and (id_sede is null or id_sede=?) and lower(btrim(nombre))=lower(?)
                """, Integer.class, sede, nombre) > 0) throw conflict("Ya existe esa categoría");
        int id = jdbc.queryForObject("""
                insert into categoria_producto(nombre,descripcion,id_sede,estado,usucre,pccre)
                values (?,?,?,'A',?,'SPRING') returning id_categoria
                """, Integer.class, nombre, descripcion, sede, "API");
        return new Category(id, nombre, descripcion);
    }

    @Transactional
    public int createProduct(ProductRequest r, AuthUserDto user) {
        int sede = access.requireOwnedVenue(r.sedeId(), user, VenueAccessService.PRODUCTO_GESTIONAR);
        String nombre = required(r.nombre(), 150, "Nombre");
        String codigo = optional(r.codigoBarras(), 50, "Código de barras");
        String descripcion = optional(r.descripcion(), 1000, "Descripción");
        if (r.categoriaId() == null) throw bad("Selecciona una categoría");
        if (r.contenido() == null || r.contenido().signum() <= 0 || r.contenido().compareTo(new BigDecimal("999999999")) > 0 || r.contenido().scale() > 3)
            throw bad("Indica un contenido mayor que cero, con hasta tres decimales");
        if (!Set.of("und","ml","l","g","kg","pack","caja").contains(r.unidadMedida() == null ? "" : r.unidadMedida()))
            throw bad("Unidad de medida inválida");
        money(r.precioCompra(), false); money(r.precioVenta(), true);
        if (r.stockInicial() == null || r.stockMinimo() == null || r.stockInicial() < 0 || r.stockMinimo() < 0
                || r.stockInicial() > 1000000 || r.stockMinimo() > 1000000) throw bad("Stock inválido");
        String foto = validatePhoto(r.fotoUrl());
        lockVenue(sede);
        if (jdbc.queryForObject("""
                select count(*) from categoria_producto where id_categoria=? and estado='A'
                and (id_sede is null or id_sede=?)
                """, Integer.class, r.categoriaId(), sede) != 1) throw bad("La categoría no está disponible en esta sede");
        if (codigo != null && jdbc.queryForObject("""
                select count(*) from producto p where p.estado='A' and lower(p.codigo_barras)=lower(?)
                and exists (select 1 from kardex k where k.id_producto=p.id_producto and k.id_sede=? and k.estado='A')
                """, Integer.class, codigo, sede) > 0) throw conflict("El código ya está registrado en esta sede");
        int id = jdbc.queryForObject("""
                insert into producto(id_categoria,nombre,codigo_barras,descripcion,contenido,unidad_medida,
                precio_compra,precio_venta,stock_minimo,foto_url,estado,usucre,pccre)
                values (?,?,?,?,?,?,?,?,?,?,'A',?,'SPRING') returning id_producto
                """, Integer.class, r.categoriaId(), nombre, codigo, descripcion, r.contenido(), r.unidadMedida(),
                r.precioCompra(), r.precioVenta(), r.stockMinimo(), foto, "API");
        jdbc.update("""
                insert into kardex(id_producto,id_sede,id_tipo_mov_inv,cantidad,precio_unitario,saldo_stock,motivo,estado,usucre,pccre)
                values (?,?,1,?,?,?,'Alta de producto / Stock inicial','A',?,'SPRING')
                """, id, sede, r.stockInicial(), r.precioCompra(), r.stockInicial(), "API");
        return id;
    }

    private void lockVenue(int sede) { jdbc.queryForList("select id_sede from sede where id_sede=? for update", sede); }
    private static void money(BigDecimal value, boolean positive) {
        if (value == null || value.signum() < 0 || (positive && value.signum() == 0) || value.scale() > 2
                || value.compareTo(new BigDecimal("9999999.99")) > 0) throw bad("Precio inválido: utiliza hasta dos decimales");
    }
    private static String required(String s, int max, String field) {
        String value = optional(s, max, field);
        if (value == null) throw bad(field + " es obligatorio");
        return value;
    }
    private static String optional(String s, int max, String field) {
        if (s == null || s.isBlank()) return null;
        if (s.trim().length() > max) throw bad(field + " demasiado largo");
        return s.trim();
    }
    static String validatePhoto(String s) {
        String foto = optional(s, 250000, "Foto");
        if (foto == null) return null;
        if (foto.startsWith("data:image/jpeg;base64,") || foto.startsWith("data:image/png;base64,")) {
            try {
                byte[] bytes = java.util.Base64.getDecoder().decode(foto.substring(foto.indexOf(',') + 1));
                try (var input = javax.imageio.ImageIO.createImageInputStream(new java.io.ByteArrayInputStream(bytes))) {
                    var readers = javax.imageio.ImageIO.getImageReaders(input);
                    if (!readers.hasNext()) throw bad("Imagen inválida");
                    var reader = readers.next();
                    try { reader.setInput(input); if (reader.getWidth(0) > 1200 || reader.getHeight(0) > 1200) throw bad("Imagen demasiado grande"); }
                    finally { reader.dispose(); }
                }
                return foto;
            } catch (Exception ex) { throw bad("Imagen inválida"); }
        }
        try {
            URI uri = URI.create(foto);
            if (foto.length() > 2048 || !"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null)
                throw bad("Utiliza un enlace HTTPS de imagen");
        } catch (IllegalArgumentException ex) { throw bad("Enlace de imagen inválido"); }
        return foto;
    }
    private static ResponseStatusException bad(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }
    private static ResponseStatusException conflict(String message) { return new ResponseStatusException(HttpStatus.CONFLICT, message); }
}
