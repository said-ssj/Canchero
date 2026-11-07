package pe.canchero.backend.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.AuthUserDto;
import pe.canchero.backend.web.dto.InventoryEntryRequest;
import pe.canchero.backend.web.dto.InventoryMovementDto;
import pe.canchero.backend.web.dto.ProcessSaleRequest;
import pe.canchero.backend.web.dto.ProductDto;
import pe.canchero.backend.web.dto.ProductoResponse;
import pe.canchero.backend.web.dto.SaleDto;
import pe.canchero.backend.web.dto.SaleItemDto;
import pe.canchero.backend.web.dto.VentaDetalleResponse;
import pe.canchero.backend.web.dto.VentaRequest;
import pe.canchero.backend.web.dto.VentaResponse;
import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/** Punto de venta: productos y stock por sede, ventas con pagos y kardex. */
@Service
public class PosService extends JdbcSupport {
    private final SalePaymentLedger salePayments;

    public PosService(JdbcTemplate jdbc) {
        super(jdbc);
        this.salePayments = new SalePaymentLedger(jdbc);
    }

    public boolean salePaymentsReady() { return salePayments.available(); }

    public List<ProductDto> listProducts(Integer sedeId) {
        int targetSedeId = requireExplicitVenue(sedeId);
        return jdbc.query("""
                select p.id_producto, k.id_sede, p.id_categoria, coalesce(cp.nombre, 'General') as categoria_nombre,
                       p.codigo_barras, p.nombre, p.precio_compra, p.precio_venta, p.stock_minimo,
                       k.saldo_stock as stock, p.contenido, p.unidad_medida, p.descripcion, p.foto_url
                from producto p
                left join categoria_producto cp on cp.id_categoria = p.id_categoria
                join kardex k on k.id_kardex = (
                    select latest.id_kardex
                    from kardex latest
                    where latest.id_producto = p.id_producto and latest.id_sede = ? and latest.estado = 'A'
                    order by coalesce(latest.fecha, latest.feccre) desc, latest.id_kardex desc
                    limit 1
                )
                where p.estado = 'A'
                order by p.nombre
                """, productRowMapper(), targetSedeId);
    }

    private int requireExplicitVenue(Integer sedeId) {
        if (sedeId == null || sedeId <= 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Selecciona una sede");
        return sedeId;
    }

    public List<InventoryMovementDto> listInventoryMovements() {
        return listInventoryMovements(null);
    }

    public List<InventoryMovementDto> listInventoryMovements(Integer sedeId) {
        int targetSedeId = requireExplicitVenue(sedeId);
        return jdbc.query("""
                select k.id_kardex, k.id_sede, k.id_producto, coalesce(p.nombre, 'Producto #' || k.id_producto) as producto_nombre,
                       coalesce(k.fecha, k.feccre) as fecha, k.id_tipo_mov_inv, k.cantidad,
                       k.precio_unitario, k.saldo_stock, k.motivo
                from kardex k
                left join producto p on p.id_producto = k.id_producto
                where k.estado = 'A' and k.id_sede = ?
                order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                """, inventoryRowMapper(), targetSedeId);
    }

    public List<SaleDto> listSales() {
        return listSales(null);
    }

    public List<SaleDto> listSales(Integer sedeId) {
        int targetSedeId = requireExplicitVenue(sedeId);
        return jdbc.query("""
                select v.id_venta, v.id_sede, v.fecha_venta, v.id_sesion_caja,
                       v.cajero_nombre, v.tipo_comprobante, v.numero_comprobante,
                       v.subtotal, v.igv, v.total, v.estado
                from (
                    select v.id_venta,
                           coalesce(c.id_sede, (
                               select k.id_sede
                               from venta_detalle vd
                               join kardex k on k.id_producto = vd.id_producto
                               where vd.id_venta = v.id_venta
                                 and k.estado = 'A'
                                 and k.motivo like ('Venta POS #' || v.id_venta || '%')
                               order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                               limit 1
                           )) as id_sede,
                           coalesce(v.fecha_venta, v.feccre) as fecha_venta,
                           v.id_sesion_caja,
                           coalesce(u.nombre, 'Cajero') as cajero_nombre,
                           v.tipo_comprobante,
                           v.numero_comprobante,
                           v.subtotal,
                           v.igv,
                           v.total,
                           v.estado
                    from venta v
                    left join usuario u on u.id_usuario = v.id_usuario
                    left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                    left join caja c on c.id_caja = sc.id_caja
                ) v
                where v.estado = 'A'
                  and v.id_sede = ?
                order by v.fecha_venta desc, v.id_venta desc
                """, (rs, rowNum) -> mapSale(rs, saleItems(rs.getInt("id_venta"))), targetSedeId);
    }

    @Transactional
    public SaleDto processSale(ProcessSaleRequest request) {
        int sedeId = requireExplicitVenue(request.sedeId());
        salePayments.requireSchema();
        UUID author = resolveOperationalUserId(request.usuarioId());
        String operationKey = salePayments.key(request);
        String operationHash = salePayments.fingerprint(request);
        Integer previous = salePayments.replay(request, operationKey, operationHash);
        if (previous != null) return getSale(previous, sedeId).orElseThrow();
        salePayments.lockSession(request.sesionCajaId());
        Integer ownerMatches = jdbc.queryForObject("""
                select count(*) from sesion_caja sc join caja c on c.id_caja=sc.id_caja
                join sede s on s.id_sede=c.id_sede where sc.id_sesion_caja=? and c.id_sede=?
                and c.estado='A' and s.estado='A'
                and (s.id_dueno=? or exists (select 1 from usuario u join rol r on r.id_rol=u.id_rol
                     where u.id_usuario=? and lower(trim(r.nombre)) in ('admin','administrador')))
                """, Integer.class, request.sesionCajaId(), sedeId, author, author);
        if (ownerMatches == null || ownerMatches != 1) throw new ResponseStatusException(HttpStatus.FORBIDDEN, "El turno no pertenece a tu sede");
        previous = salePayments.replay(request, operationKey, operationHash);
        if (previous != null) return getSale(previous, sedeId).orElseThrow();
        if (request.items() == null || request.items().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El carrito de venta está vacío");
        }
        UUID userId = resolveOperationalUserId(request.usuarioId());
        BigDecimal exactTotal = BigDecimal.ZERO;
        List<SaleItemDto> normalizedItems = new ArrayList<>();
        if (request.items().stream().anyMatch(java.util.Objects::isNull)) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Partida invalida");
        if (request.items().stream().map(SaleItemDto::productoId).distinct().count() != request.items().size())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Agrupa las cantidades de cada producto en una sola partida");
        request.items().stream().map(SaleItemDto::productoId).sorted().forEach(id ->
                jdbc.queryForList("select id_producto from producto where id_producto=? for update", id));
        for (SaleItemDto item : request.items()) {
            ProductDto product = getProduct(item.productoId(), sedeId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Producto no disponible"));
            if (item.cantidad() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La cantidad debe ser mayor que cero");
            }
            int currentStock = stockForProduct(item.productoId(), sedeId);
            if (item.cantidad() > currentStock) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Stock insuficiente para " + product.nombre());
            }
            double lineTotal = BigDecimal.valueOf(product.precioVenta()).multiply(BigDecimal.valueOf(item.cantidad())).setScale(2, java.math.RoundingMode.HALF_UP).doubleValue();
            exactTotal = exactTotal.add(BigDecimal.valueOf(lineTotal));
            normalizedItems.add(new SaleItemDto(product.id(), product.nombre(), item.cantidad(), product.precioVenta(), lineTotal));
        }
        double total = exactTotal.doubleValue();
        var payments = salePayments.normalize(request, SalePaymentLedger.money(exactTotal));
        double subtotal = round2(total / 1.18);
        double igv = round2(total - subtotal);
        String tipo = fallback(request.tipoComprobante(), "boleta").toLowerCase(Locale.ROOT);
        String numero = nextSaleNumber(tipo);

        KeyHolder keyHolder = new GeneratedKeyHolder();
        double finalSubtotal = subtotal;
        double finalIgv = igv;
        double finalTotal = total;
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into venta (id_usuario, id_sesion_caja, fecha_venta, subtotal, igv, total,
                                       tipo_comprobante, numero_comprobante, estado, usucre, pccre)
                    values (?, ?, now(), ?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setObject(1, userId);
            if (request.sesionCajaId() == null) {
                ps.setObject(2, null);
            } else {
                ps.setInt(2, request.sesionCajaId());
            }
            ps.setBigDecimal(3, BigDecimal.valueOf(finalSubtotal));
            ps.setBigDecimal(4, BigDecimal.valueOf(finalIgv));
            ps.setBigDecimal(5, BigDecimal.valueOf(finalTotal));
            ps.setString(6, tipo);
            ps.setString(7, numero);
            return ps;
        }, keyHolder);
        int saleId = ((Number) keyHolder.getKeys().get("id_venta")).intValue();
        for (SaleItemDto item : normalizedItems) {
            jdbc.update("""
                    insert into venta_detalle (id_venta, id_producto, cantidad, precio_unitario,
                                               subtotal, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, 'A', 'API', 'SPRING')
                    """,
                    saleId,
                    item.productoId(),
                    item.cantidad(),
                    BigDecimal.valueOf(item.precioUnitario()),
                    BigDecimal.valueOf(item.subtotal()));
            int newStock = stockForProduct(item.productoId(), sedeId) - item.cantidad();
            insertKardex(item.productoId(), sedeId, 2, item.cantidad(), item.precioUnitario(), newStock,
                    "Venta POS #" + saleId + " (" + numero + ")");
        }
        salePayments.record(saleId, request, operationKey, operationHash, payments);
        return getSale(saleId, sedeId).orElseThrow();
    }

    @Transactional
    public InventoryMovementDto registerInventoryEntry(InventoryEntryRequest request) {
        jdbc.queryForList("select id_producto from producto where id_producto=? for update", request.productoId());
        if (request.cantidad() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La cantidad debe ser mayor que cero");
        }
        int sedeId = requireExplicitVenue(request.sedeId());
        ProductDto product = getProduct(request.productoId(), sedeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Producto no disponible"));
        int newStock = stockForProduct(request.productoId(), sedeId) + request.cantidad();
        int movementId = insertKardex(
                request.productoId(),
                sedeId,
                1,
                request.cantidad(),
                request.precioCompra() > 0 ? request.precioCompra() : product.precioCompra(),
                newStock,
                fallback(request.motivo(), "Ingreso de mercadería / Reposición proveedor"));
        return listInventoryMovements(sedeId).stream()
                .filter(k -> k.id() == movementId)
                .findFirst()
                .orElseThrow();
    }

    private RowMapper<ProductDto> productRowMapper() {
        return (rs, rowNum) -> new ProductDto(
                rs.getInt("id_producto"),
                rs.getObject("id_sede") == null ? null : rs.getInt("id_sede"),
                rs.getInt("id_categoria"),
                rs.getString("categoria_nombre"),
                rs.getString("codigo_barras") == null ? "775" + rs.getInt("id_producto") : rs.getString("codigo_barras"),
                rs.getString("nombre"),
                rs.getBigDecimal("precio_compra") == null ? 0 : rs.getBigDecimal("precio_compra").doubleValue(),
                rs.getBigDecimal("precio_venta") == null ? 0 : rs.getBigDecimal("precio_venta").doubleValue(),
                rs.getInt("stock"),
                rs.getObject("stock_minimo") == null ? 5 : rs.getInt("stock_minimo"),
                "inventory", rs.getBigDecimal("contenido"), rs.getString("unidad_medida"),
                rs.getString("descripcion"), rs.getString("foto_url"));
    }

    private RowMapper<InventoryMovementDto> inventoryRowMapper() {
        return (rs, rowNum) -> new InventoryMovementDto(
                rs.getInt("id_kardex"),
                rs.getObject("id_sede") == null ? null : rs.getInt("id_sede"),
                rs.getInt("id_producto"),
                rs.getString("producto_nombre"),
                stringDateTime(rs, "fecha"),
                rs.getInt("id_tipo_mov_inv") == 1 ? "+" : "-",
                rs.getInt("cantidad"),
                rs.getBigDecimal("precio_unitario") == null ? 0 : rs.getBigDecimal("precio_unitario").doubleValue(),
                rs.getInt("saldo_stock"),
                rs.getString("motivo"),
                null);
    }

    private Optional<ProductDto> getProduct(int productId) {
        return getProduct(productId, null);
    }

    private Optional<ProductDto> getProduct(int productId, Integer sedeId) {
        return listProducts(sedeId).stream().filter(p -> p.id() == productId).findFirst();
    }

    private Optional<SaleDto> getSale(int saleId, int sedeId) {
        return jdbc.query("""
                select v.id_venta, v.id_sede, v.fecha_venta, v.id_sesion_caja,
                       v.cajero_nombre, v.tipo_comprobante, v.numero_comprobante,
                       v.subtotal, v.igv, v.total, v.estado
                from (
                    select v.id_venta,
                           coalesce(c.id_sede, (
                               select k.id_sede
                               from venta_detalle vd
                               join kardex k on k.id_producto = vd.id_producto
                               where vd.id_venta = v.id_venta
                                 and k.estado = 'A'
                                 and k.motivo like ('Venta POS #' || v.id_venta || '%')
                               order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                               limit 1
                           )) as id_sede,
                           coalesce(v.fecha_venta, v.feccre) as fecha_venta,
                           v.id_sesion_caja,
                           coalesce(u.nombre, 'Cajero') as cajero_nombre,
                           v.tipo_comprobante,
                           v.numero_comprobante,
                           v.subtotal,
                           v.igv,
                           v.total,
                           v.estado
                    from venta v
                    left join usuario u on u.id_usuario = v.id_usuario
                    left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                    left join caja c on c.id_caja = sc.id_caja
                ) v
                where v.id_venta = ? and v.id_sede = ?
                """, (rs, rowNum) -> mapSale(rs, saleItems(saleId)), saleId, sedeId).stream().findFirst();
    }

    private List<SaleItemDto> saleItems(int saleId) {
        return jdbc.query("""
                select vd.id_producto, coalesce(p.nombre, 'Producto #' || vd.id_producto) as nombre,
                       vd.cantidad, vd.precio_unitario, vd.subtotal
                from venta_detalle vd
                left join producto p on p.id_producto = vd.id_producto
                where vd.id_venta = ? and vd.estado = 'A'
                order by vd.id_venta_detalle
                """,
                (rs, rowNum) -> new SaleItemDto(
                        rs.getInt("id_producto"),
                        rs.getString("nombre"),
                        rs.getInt("cantidad"),
                        rs.getBigDecimal("precio_unitario") == null ? 0 : rs.getBigDecimal("precio_unitario").doubleValue(),
                        rs.getBigDecimal("subtotal") == null ? 0 : rs.getBigDecimal("subtotal").doubleValue()),
                saleId);
    }

    private SaleDto mapSale(ResultSet rs, List<SaleItemDto> items) throws java.sql.SQLException {
        var payments = salePayments.payments(rs.getInt("id_venta"));
        String method = payments.isEmpty() ? "sin_desglose" : payments.size() == 1 ? payments.get(0).metodoPago() : "mixto";
        BigDecimal received = payments.stream().map(p -> p.montoRecibido()).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal change = payments.stream().map(p -> p.montoRecibido().subtract(p.monto())).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new SaleDto(
                "VNT-" + rs.getInt("id_venta"),
                rs.getObject("id_sede") == null ? null : rs.getInt("id_sede"),
                stringDateTime(rs, "fecha_venta"),
                rs.getObject("id_sesion_caja") == null ? null : rs.getInt("id_sesion_caja"),
                rs.getString("cajero_nombre"),
                "Cliente Mostrador",
                "",
                rs.getString("tipo_comprobante"),
                rs.getString("numero_comprobante"),
                items,
                rs.getBigDecimal("subtotal") == null ? 0 : rs.getBigDecimal("subtotal").doubleValue(),
                rs.getBigDecimal("igv") == null ? 0 : rs.getBigDecimal("igv").doubleValue(),
                rs.getBigDecimal("total") == null ? 0 : rs.getBigDecimal("total").doubleValue(),
                method,
                payments.isEmpty() ? null : received.doubleValue(),
                payments.isEmpty() ? null : change.doubleValue(),
                "completada", payments);
    }

    private int stockForProduct(int productId) {
        return stockForProduct(productId, null);
    }

    private int stockForProduct(int productId, Integer sedeId) {
        int targetSedeId = requireExplicitVenue(sedeId);
        List<Integer> stock = jdbc.queryForList("""
                select saldo_stock
                from kardex
                where id_producto = ? and id_sede = ? and estado = 'A'
                order by coalesce(fecha, feccre) desc, id_kardex desc
                limit 1
                """, Integer.class, productId, targetSedeId);
        return stock.isEmpty() ? 0 : stock.get(0);
    }

    private int insertKardex(int productId, int sedeId, int movementType, int quantity, double price, int stock, String reason) {
        KeyHolder keyHolder = new GeneratedKeyHolder();
        jdbc.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    insert into kardex (id_producto, id_sede, id_tipo_mov_inv, cantidad, precio_unitario,
                                        saldo_stock, motivo, fecha, estado, usucre, pccre)
                    values (?, ?, ?, ?, ?, ?, ?, now(), 'A', 'API', 'SPRING')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setInt(1, productId);
            ps.setInt(2, sedeId);
            ps.setInt(3, movementType);
            ps.setInt(4, quantity);
            ps.setBigDecimal(5, BigDecimal.valueOf(price));
            ps.setInt(6, Math.max(0, stock));
            ps.setString(7, reason);
            return ps;
        }, keyHolder);
        return ((Number) keyHolder.getKeys().get("id_kardex")).intValue();
    }

    private String nextSaleNumber(String type) {
        String prefix = switch (type) {
            case "factura" -> "F001";
            case "ticket" -> "NV01";
            default -> "B001";
        };
        Integer next = jdbc.queryForObject("""
                select coalesce(max(cast(substring(numero_comprobante from position('-' in numero_comprobante) + 1) as integer)), 0) + 1
                from venta
                where numero_comprobante like ?
                """, Integer.class, prefix + "-%");
        return prefix + "-" + String.format("%06d", next == null ? 1 : next);
    }

    public List<VentaResponse> listVentasBySession(int sesionId) {
        List<Integer> venueIds = jdbc.queryForList("""
                select c.id_sede
                from sesion_caja sc
                join caja c on c.id_caja = sc.id_caja
                where sc.id_sesion_caja = ?
                """, Integer.class, sesionId);
        if (venueIds.isEmpty()) return List.of();
        return listSales(venueIds.get(0)).stream()
                .filter(v -> v.cajaId() != null && v.cajaId() == sesionId)
                .map(this::toVentaResponse)
                .toList();
    }

    public List<VentaResponse> listVentasForVenue(int sedeId) {
        return listSales(sedeId).stream()
                .map(this::toVentaResponse)
                .toList();
    }

    public List<VentaResponse> listVentasForOwner(AuthUserDto user) {
        UUID ownerUuid = resolveOperationalUserId(user.id());
        boolean admin = Roles.isAdmin(user.rol()); // el admin de la plataforma ve todas las sedes
        return jdbc.query("""
                select v.id_venta, v.id_sede, v.fecha_venta, v.id_sesion_caja,
                       v.cajero_nombre, v.tipo_comprobante, v.numero_comprobante,
                       v.subtotal, v.igv, v.total, v.estado
                from (
                    select v.id_venta,
                           coalesce(c.id_sede, (
                               select k.id_sede
                               from venta_detalle vd
                               join kardex k on k.id_producto = vd.id_producto
                               where vd.id_venta = v.id_venta
                                 and k.estado = 'A'
                                 and k.motivo like ('Venta POS #' || v.id_venta || '%')
                               order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                               limit 1
                           )) as id_sede,
                           coalesce(v.fecha_venta, v.feccre) as fecha_venta,
                           v.id_sesion_caja,
                           coalesce(u.nombre, 'Cajero') as cajero_nombre,
                           v.tipo_comprobante,
                           v.numero_comprobante,
                           v.subtotal,
                           v.igv,
                           v.total,
                           v.estado
                    from venta v
                    left join usuario u on u.id_usuario = v.id_usuario
                    left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                    left join caja c on c.id_caja = sc.id_caja
                ) v
                join sede s on s.id_sede = v.id_sede
                where v.estado = 'A' and (? or s.id_dueno = ?)
                order by v.fecha_venta desc, v.id_venta desc
                """, (rs, rowNum) -> mapSale(rs, saleItems(rs.getInt("id_venta"))), admin, ownerUuid).stream()
                .map(this::toVentaResponse)
                .toList();
    }

    public Optional<VentaResponse> getVenta(int id) {
        List<Integer> venueIds = jdbc.queryForList("""
                select coalesce(c.id_sede, (
                    select k.id_sede
                    from venta_detalle vd
                    join kardex k on k.id_producto = vd.id_producto
                    where vd.id_venta = v.id_venta
                      and k.estado = 'A'
                      and k.motivo like ('Venta POS #' || v.id_venta || '%')
                    order by coalesce(k.fecha, k.feccre) desc, k.id_kardex desc
                    limit 1
                )) as id_sede
                from venta v
                left join sesion_caja sc on sc.id_sesion_caja = v.id_sesion_caja
                left join caja c on c.id_caja = sc.id_caja
                where v.id_venta = ?
                """, Integer.class, id);
        if (venueIds.isEmpty() || venueIds.get(0) == null) return Optional.empty();
        return getSale(id, venueIds.get(0)).map(this::toVentaResponse);
    }

    public VentaResponse createVenta(VentaRequest request) {
        throw new ResponseStatusException(HttpStatus.CONFLICT, "Se requiere un turno de caja abierto para registrar ventas");
    }

    @Transactional
    public VentaResponse createVenta(VentaRequest request, int sedeId, AuthUserDto user) {
        List<SaleItemDto> items = request.detalles() == null ? List.of() : request.detalles().stream()
                .map(d -> new SaleItemDto(
                        Integer.parseInt(d.productoId()),
                        "",
                        d.cantidad(),
                        d.precioUnitario() == null ? 0 : d.precioUnitario().doubleValue(),
                        d.precioUnitario() == null ? 0 : d.precioUnitario().multiply(BigDecimal.valueOf(d.cantidad())).doubleValue()))
                .toList();
        SaleDto sale = processSale(new ProcessSaleRequest(
                "boleta",
                fallback(request.metodoPago(), "efectivo"),
                user != null ? user.nombre() : "Cajero",
                null,
                null,
                null,
                request.sesionCajaId() == null || request.sesionCajaId().isBlank() ? null : Integer.parseInt(request.sesionCajaId()),
                sedeId,
                user != null ? user.id() : null,
                items));
        return toVentaResponse(sale);
    }

    public List<ProductoResponse> listProductos(String estado) {
        return listProductos(estado, null);
    }

    public List<ProductoResponse> listProductos(String estado, Integer sedeId) {
        return listProducts(sedeId).stream()
                .map(p -> new ProductoResponse(
                        String.valueOf(p.id()),
                        p.nombre(),
                        null,
                        p.categoriaNombre(),
                        BigDecimal.valueOf(p.precioVenta()),
                        BigDecimal.valueOf(p.precioCompra()),
                        p.stock(),
                        p.stockMinimo(),
                        "unidad",
                        "A"))
                .filter(p -> estado == null || estado.isBlank() || p.estado().equalsIgnoreCase(estado))
                .toList();
    }

    private VentaResponse toVentaResponse(SaleDto sale) {
        int ventaId = Integer.parseInt(sale.id().replace("VNT-", ""));
        List<VentaDetalleResponse> detalles = sale.items().stream()
                .map(i -> new VentaDetalleResponse(
                        "",
                        String.valueOf(ventaId),
                        String.valueOf(i.productoId()),
                        i.nombre(),
                        i.cantidad(),
                        BigDecimal.valueOf(i.precioUnitario()),
                        BigDecimal.valueOf(i.subtotal())))
                .toList();
        return new VentaResponse(
                String.valueOf(ventaId),
                sale.cajaId() == null ? null : String.valueOf(sale.cajaId()),
                null,
                sale.metodoPago(),
                BigDecimal.valueOf(sale.subtotal()),
                BigDecimal.valueOf(sale.igv()),
                BigDecimal.valueOf(sale.total()),
                sale.estado(),
                parseLocalDateTime(sale.fecha()),
                detalles);
    }
}
