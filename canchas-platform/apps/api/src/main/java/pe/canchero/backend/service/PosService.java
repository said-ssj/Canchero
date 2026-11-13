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
import pe.canchero.backend.web.dto.InventoryAdjustmentRequest;
import pe.canchero.backend.web.dto.InventoryEntryRequest;
import pe.canchero.backend.web.dto.InventoryMovementDto;
import pe.canchero.backend.web.dto.InventorySummaryDto;
import pe.canchero.backend.web.dto.InventoryTransferRequest;
import pe.canchero.backend.web.dto.InventoryTransferResultDto;
import pe.canchero.backend.web.dto.ProcessSaleRequest;
import pe.canchero.backend.web.dto.ProductDto;
import pe.canchero.backend.web.dto.ProductVelocityDto;
import pe.canchero.backend.web.dto.ProductoResponse;
import pe.canchero.backend.web.dto.SaleDto;
import pe.canchero.backend.web.dto.SaleItemDto;
import pe.canchero.backend.web.dto.TransformationRequest;
import pe.canchero.backend.web.dto.TransformationResultDto;
import pe.canchero.backend.web.dto.VentaDetalleResponse;
import pe.canchero.backend.web.dto.VentaRequest;
import pe.canchero.backend.web.dto.VentaResponse;
import java.util.HashMap;
import java.util.Map;
import pe.canchero.backend.web.dto.SalePaymentDto;
import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
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
        return querySales("""
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
                """, targetSedeId);
    }


    @Transactional
    public SaleDto processSale(ProcessSaleRequest request) {
        int sedeId = requireExplicitVenue(request.sedeId());
        salePayments.requireSchema();
        UUID author = resolveOperationalUserId(request.usuarioId());
        var actor = jdbc.query("select u.id_usuario,u.nombre,u.correo,u.telefono,r.nombre as rol from usuario u join rol r on r.id_rol=u.id_rol where u.id_usuario=? and u.estado='A'", (rs,n) -> new pe.canchero.backend.web.dto.AuthUserDto(rs.getString(1),rs.getString(2),rs.getString(3),rs.getString(4),rs.getString(5)), author);
        if (actor.isEmpty()) throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        new TenantPermissions(jdbc).require(actor.get(0), sedeId, "venta.crear");
        var saleSession = new VenueAccessService(jdbc).requireOwnedSession(request.sesionCajaId(),actor.get(0));
        if (saleSession.sedeId() != sedeId) throw new ResponseStatusException(HttpStatus.FORBIDDEN,"El turno no corresponde a la sede de la venta");
        String operationKey = salePayments.key(request);
        String operationHash = salePayments.fingerprint(request);
        Integer previous = salePayments.replay(request, operationKey, operationHash);
        if (previous != null) return getSale(previous, sedeId).orElseThrow();
        salePayments.lockSession(request.sesionCajaId());
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

    @Transactional
    public InventoryMovementDto registerInventoryAdjustment(InventoryAdjustmentRequest request) {
        if (request.cantidad() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La cantidad debe ser mayor que cero");
        }
        int sedeId = requireExplicitVenue(request.sedeId());
        jdbc.queryForList("select id_producto from producto where id_producto=? for update", request.productoId());
        ProductDto product = getProduct(request.productoId(), sedeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Producto no disponible en esta sede"));

        String tipoAjuste = (request.tipoAjuste() == null ? "AJUSTE" : request.tipoAjuste().trim().toUpperCase(Locale.ROOT));
        boolean esSalida = switch (tipoAjuste) {
            case "MERMA", "ROTURA", "VENCIMIENTO", "CONTEO_FALTANTE", "FALTANTE", "PERDIDA" -> true;
            case "CONTEO_SOBRANTE", "SOBRANTE", "INGRESO_AJUSTE" -> false;
            default -> true;
        };

        int currentStock = stockForProduct(request.productoId(), sedeId);
        int newStock;
        int movementType;
        if (esSalida) {
            if (request.cantidad() > currentStock) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Stock insuficiente para realizar el ajuste negativo");
            }
            newStock = currentStock - request.cantidad();
            movementType = 2; // Salida
        } else {
            newStock = currentStock + request.cantidad();
            movementType = 1; // Entrada
        }

        String motivoDetalle = "Ajuste [" + tipoAjuste + "]: " + fallback(request.motivo(), "Ajuste de existencias");
        if (motivoDetalle.length() > 200) {
            motivoDetalle = motivoDetalle.substring(0, 200);
        }

        int movementId = insertKardex(
                request.productoId(),
                sedeId,
                movementType,
                request.cantidad(),
                product.precioCompra(),
                newStock,
                motivoDetalle
        );

        return listInventoryMovements(sedeId).stream()
                .filter(k -> k.id() == movementId)
                .findFirst()
                .orElseThrow();
    }

    @Transactional
    public TransformationResultDto executeTransformation(TransformationRequest request) {
        int sedeId = requireExplicitVenue(request.sedeId());
        if (request.productoOrigenId() == request.productoDestinoId()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El producto origen y destino no pueden ser el mismo");
        }
        if (request.cantidadOrigen() <= 0 || request.cantidadDestino() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Las cantidades de origen y destino deben ser mayores que cero");
        }
        int first = Math.min(request.productoOrigenId(), request.productoDestinoId());
        int second = Math.max(request.productoOrigenId(), request.productoDestinoId());
        jdbc.queryForList("select id_producto from producto where id_producto in (?, ?) for update", first, second);

        ProductDto prodOrigen = getProduct(request.productoOrigenId(), sedeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Producto origen no encontrado en esta sede"));
        ProductDto prodDestino = getProduct(request.productoDestinoId(), sedeId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Producto destino no encontrado en esta sede"));

        int currentStockOrigen = stockForProduct(request.productoOrigenId(), sedeId);
        if (request.cantidadOrigen() > currentStockOrigen) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Stock insuficiente del producto origen (" + prodOrigen.nombre() + ")");
        }

        int currentStockDestino = stockForProduct(request.productoDestinoId(), sedeId);

        BigDecimal totalCostOrigen = BigDecimal.valueOf(prodOrigen.precioCompra()).multiply(BigDecimal.valueOf(request.cantidadOrigen()));
        double unitCostDestino = totalCostOrigen.divide(BigDecimal.valueOf(request.cantidadDestino()), 4, java.math.RoundingMode.HALF_UP).doubleValue();

        int newStockOrigen = currentStockOrigen - request.cantidadOrigen();
        int newStockDestino = currentStockDestino + request.cantidadDestino();

        String userMotivo = fallback(request.motivo(), "Fraccionamiento de stock");
        String motivoSalida = "Transformación: salida hacia " + prodDestino.nombre() + " (+" + request.cantidadDestino() + ") - " + userMotivo;
        if (motivoSalida.length() > 200) motivoSalida = motivoSalida.substring(0, 200);

        String motivoEntrada = "Transformación: entrada desde " + prodOrigen.nombre() + " (-" + request.cantidadOrigen() + ") - " + userMotivo;
        if (motivoEntrada.length() > 200) motivoEntrada = motivoEntrada.substring(0, 200);

        insertKardex(
                request.productoOrigenId(),
                sedeId,
                2,
                request.cantidadOrigen(),
                prodOrigen.precioCompra(),
                newStockOrigen,
                motivoSalida
        );

        insertKardex(
                request.productoDestinoId(),
                sedeId,
                1,
                request.cantidadDestino(),
                unitCostDestino,
                newStockDestino,
                motivoEntrada
        );

        return new TransformationResultDto(
                prodOrigen.id(),
                prodOrigen.nombre(),
                request.cantidadOrigen(),
                newStockOrigen,
                prodDestino.id(),
                prodDestino.nombre(),
                request.cantidadDestino(),
                newStockDestino,
                unitCostDestino,
                LocalDateTime.now().toString(),
                userMotivo
        );
    }

    @Transactional
    public InventoryTransferResultDto transferInventory(InventoryTransferRequest request, AuthUserDto user) {
        if (request == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Datos de traslado requeridos");
        }
        int sourceSede = requireExplicitVenue(request.sourceSedeId());
        int targetSede = requireExplicitVenue(request.targetSedeId());
        if (sourceSede == targetSede) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La sede de origen y la sede de destino deben ser distintas");
        }
        if (request.productoId() == null || request.productoId() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Producto inválido");
        }
        if (request.cantidad() == null || request.cantidad() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La cantidad a trasladar debe ser mayor que cero");
        }

        // Lock venues and product in DB
        int firstVenue = Math.min(sourceSede, targetSede);
        int secondVenue = Math.max(sourceSede, targetSede);
        jdbc.queryForList("select id_sede from sede where id_sede in (?, ?) for update", firstVenue, secondVenue);
        jdbc.queryForList("select id_producto from producto where id_producto = ? for update", request.productoId());

        // Check if product exists in catalog
        var prods = jdbc.query("""
                select p.id_producto, p.nombre, p.precio_compra, p.precio_venta
                from producto p
                where p.id_producto = ? and p.estado = 'A'
                """, (rs, rowNum) -> new Object[] {
                    rs.getInt("id_producto"),
                    rs.getString("nombre"),
                    rs.getDouble("precio_compra"),
                    rs.getDouble("precio_venta")
                }, request.productoId());
        if (prods.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Producto no disponible");
        }
        String prodNombre = (String) prods.get(0)[1];
        double precioCompra = (Double) prods.get(0)[2];

        // Stock in source venue
        int currentStockSource = stockForProduct(request.productoId(), sourceSede);
        if (request.cantidad() > currentStockSource) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Stock insuficiente en la sede de origen. Stock actual: " + currentStockSource + ", solicitado: " + request.cantidad());
        }

        int currentStockTarget = stockForProduct(request.productoId(), targetSede);

        // Fetch venue names for readable kardex description
        String sourceName = venueName(sourceSede);
        String targetName = venueName(targetSede);

        String userMotivo = (request.motivo() != null && !request.motivo().isBlank()) ? request.motivo().trim() : "";
        String motivoSalida = "Traslado hacia " + targetName + " (#" + targetSede + ")" + (userMotivo.isEmpty() ? "" : ": " + userMotivo);
        String motivoEntrada = "Traslado desde " + sourceName + " (#" + sourceSede + ")" + (userMotivo.isEmpty() ? "" : ": " + userMotivo);
        if (motivoSalida.length() > 200) motivoSalida = motivoSalida.substring(0, 200);
        if (motivoEntrada.length() > 200) motivoEntrada = motivoEntrada.substring(0, 200);

        int newStockSource = currentStockSource - request.cantidad();
        int newStockTarget = currentStockTarget + request.cantidad();

        int sourceKardexId = insertKardex(
                request.productoId(),
                sourceSede,
                2, // Salida
                request.cantidad(),
                precioCompra,
                newStockSource,
                motivoSalida
        );

        int targetKardexId = insertKardex(
                request.productoId(),
                targetSede,
                1, // Entrada
                request.cantidad(),
                precioCompra,
                newStockTarget,
                motivoEntrada
        );

        return new InventoryTransferResultDto(
                sourceSede,
                targetSede,
                request.productoId(),
                request.cantidad(),
                newStockSource,
                newStockTarget,
                sourceKardexId,
                targetKardexId,
                "Se trasladaron " + request.cantidad() + " unidades de " + prodNombre + " de " + sourceName + " hacia " + targetName
        );
    }

    private String venueName(int venueId) {
        List<String> names = jdbc.query("select nombre from sede where id_sede = ?", (rs, rowNum) -> rs.getString(1), venueId);
        return names.isEmpty() ? "Sede #" + venueId : names.get(0);
    }

    public InventorySummaryDto getInventorySummary(Integer sedeId) {
        int targetSedeId = requireExplicitVenue(sedeId);
        List<ProductDto> products = listProducts(targetSedeId);

        BigDecimal totalValorizado = BigDecimal.ZERO;
        int totalUnidades = 0;
        int bajoStock = 0;
        int agotados = 0;

        for (ProductDto p : products) {
            int st = p.stock();
            totalUnidades += Math.max(0, st);
            if (st > 0) {
                totalValorizado = totalValorizado.add(BigDecimal.valueOf(p.precioCompra()).multiply(BigDecimal.valueOf(st)));
            }
            if (st == 0) {
                agotados++;
            } else if (st <= p.stockMinimo()) {
                bajoStock++;
            }
        }

        Timestamp startOfMonth = Timestamp.valueOf(LocalDate.now().withDayOfMonth(1).atStartOfDay());
        Integer movMes = jdbc.queryForObject("""
                select count(*)
                from kardex
                where id_sede = ? and estado = 'A'
                  and coalesce(fecha, feccre) >= ?
                """, Integer.class, targetSedeId, startOfMonth);
        int totalMovMes = movMes == null ? 0 : movMes;

        Timestamp thirtyDaysAgo = Timestamp.valueOf(LocalDateTime.now().minusDays(30));
        List<ProductVelocityDto> velocityList = new ArrayList<>();
        for (ProductDto p : products) {
            Integer soldLast30 = jdbc.queryForObject("""
                    select coalesce(sum(cantidad), 0)
                    from kardex
                    where id_producto = ? and id_sede = ? and id_tipo_mov_inv = 2 and estado = 'A'
                      and motivo like 'Venta POS%'
                      and coalesce(fecha, feccre) >= ?
                    """, Integer.class, p.id(), targetSedeId, thirtyDaysAgo);
            int sold = soldLast30 == null ? 0 : soldLast30;
            double dailyRate = round2(sold / 30.0);
            Double daysRemaining = null;
            String nivelAlerta = "OPTIMO";

            if (p.stock() <= 0) {
                nivelAlerta = "AGOTADO";
                daysRemaining = 0.0;
            } else if (dailyRate > 0) {
                daysRemaining = round2(p.stock() / dailyRate);
                if (daysRemaining <= 3.0) {
                    nivelAlerta = "CRITICO";
                } else if (daysRemaining <= 7.0 || p.stock() <= p.stockMinimo()) {
                    nivelAlerta = "ADVERTENCIA";
                }
            } else if (p.stock() <= p.stockMinimo()) {
                nivelAlerta = "ADVERTENCIA";
            }

            velocityList.add(new ProductVelocityDto(
                    p.id(),
                    p.nombre(),
                    p.stock(),
                    p.stockMinimo(),
                    dailyRate,
                    daysRemaining,
                    nivelAlerta
            ));
        }

        velocityList.sort((a, b) -> {
            int scoreA = "AGOTADO".equals(a.nivelAlerta()) ? 0 : "CRITICO".equals(a.nivelAlerta()) ? 1 : "ADVERTENCIA".equals(a.nivelAlerta()) ? 2 : 3;
            int scoreB = "AGOTADO".equals(b.nivelAlerta()) ? 0 : "CRITICO".equals(b.nivelAlerta()) ? 1 : "ADVERTENCIA".equals(b.nivelAlerta()) ? 2 : 3;
            if (scoreA != scoreB) return Integer.compare(scoreA, scoreB);
            if (a.diasRestantesEstimados() != null && b.diasRestantesEstimados() != null) {
                return Double.compare(a.diasRestantesEstimados(), b.diasRestantesEstimados());
            }
            return a.nombre().compareToIgnoreCase(b.nombre());
        });

        return new InventorySummaryDto(
                targetSedeId,
                totalValorizado.setScale(2, java.math.RoundingMode.HALF_UP),
                totalUnidades,
                products.size(),
                bajoStock,
                agotados,
                totalMovMes,
                velocityList
        );
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
        return querySales("""
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
                """, saleId, sedeId).stream().findFirst();
    }

    /**
     * Lee las ventas y luego trae detalle y pagos de todas en dos consultas.
     * Antes eran ~4 consultas por venta: con cientos de ventas y la base remota el POS no cargaba.
     */
    private List<SaleDto> querySales(String sql, Object... args) {
        List<SaleDto> base = jdbc.query(sql, (rs, rowNum) -> mapSale(rs), args);
        if (base.isEmpty()) return base;
        List<Integer> ids = base.stream().map(PosService::saleId).toList();
        Map<Integer, List<SaleItemDto>> items = saleItems(ids);
        Map<Integer, List<SalePaymentDto>> payments = salePayments.payments(ids);
        return base.stream().map(sale -> withDetails(sale,
                items.getOrDefault(saleId(sale), List.of()),
                payments.getOrDefault(saleId(sale), List.of()))).toList();
    }

    private static int saleId(SaleDto sale) {
        return Integer.parseInt(sale.id().substring("VNT-".length()));
    }

    private Map<Integer, List<SaleItemDto>> saleItems(List<Integer> saleIds) {
        Map<Integer, List<SaleItemDto>> bySale = new HashMap<>();
        jdbc.query("""
                select vd.id_venta, vd.id_producto, coalesce(p.nombre, 'Producto #' || vd.id_producto) as nombre,
                       vd.cantidad, vd.precio_unitario, vd.subtotal
                from venta_detalle vd
                left join producto p on p.id_producto = vd.id_producto
                where vd.estado = 'A' and vd.id_venta in (%s)
                order by vd.id_venta, vd.id_venta_detalle
                """.formatted(placeholders(saleIds.size())),
                rs -> {
                    bySale.computeIfAbsent(rs.getInt("id_venta"), k -> new ArrayList<>()).add(new SaleItemDto(
                            rs.getInt("id_producto"),
                            rs.getString("nombre"),
                            rs.getInt("cantidad"),
                            rs.getBigDecimal("precio_unitario") == null ? 0 : rs.getBigDecimal("precio_unitario").doubleValue(),
                            rs.getBigDecimal("subtotal") == null ? 0 : rs.getBigDecimal("subtotal").doubleValue()));
                }, saleIds.toArray());
        return bySale;
    }

    private SaleDto mapSale(ResultSet rs) throws java.sql.SQLException {
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
                List.of(),
                rs.getBigDecimal("subtotal") == null ? 0 : rs.getBigDecimal("subtotal").doubleValue(),
                rs.getBigDecimal("igv") == null ? 0 : rs.getBigDecimal("igv").doubleValue(),
                rs.getBigDecimal("total") == null ? 0 : rs.getBigDecimal("total").doubleValue(),
                "sin_desglose", null, null, "completada", List.of());
    }

    private static SaleDto withDetails(SaleDto s, List<SaleItemDto> items, List<SalePaymentDto> payments) {
        String method = payments.isEmpty() ? "sin_desglose" : payments.size() == 1 ? payments.get(0).metodoPago() : "mixto";
        BigDecimal received = payments.stream().map(p -> p.montoRecibido()).reduce(BigDecimal.ZERO, BigDecimal::add);
        BigDecimal change = payments.stream().map(p -> p.montoRecibido().subtract(p.monto())).reduce(BigDecimal.ZERO, BigDecimal::add);
        return new SaleDto(s.id(), s.sedeId(), s.fecha(), s.cajaId(), s.cajeroNombre(), s.clienteNombre(),
                s.clienteDocumento(), s.tipoComprobante(), s.numeroComprobante(), items, s.subtotal(), s.igv(), s.total(),
                method, payments.isEmpty() ? null : received.doubleValue(), payments.isEmpty() ? null : change.doubleValue(),
                s.estado(), payments);
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
        return querySales("""
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
                where v.estado = 'A' and __SCOPE__
                order by v.fecha_venta desc, v.id_venta desc
                """.replace("__SCOPE__",new TenantPermissions(jdbc).scope("s.id_sede", user, "venta.ver"))).stream()
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

    public static String placeholders(int count) {
        if (count <= 0) return "";
        return String.join(",", java.util.Collections.nCopies(count, "?"));
    }
}
