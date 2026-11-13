package pe.canchero.backend.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import pe.canchero.backend.web.dto.*;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

@Service
public class PurchaseService extends JdbcSupport {
    private final JdbcTemplate jdbc;
    private final VenueAccessService access;
    private final PosService posService;

    // Fallback store when table hasn't been migrated to PostgreSQL yet
    private final Map<Integer, List<SupplierDto>> memorySuppliers = new ConcurrentHashMap<>();
    private final Map<Integer, List<PurchaseDto>> memoryPurchases = new ConcurrentHashMap<>();
    private final AtomicInteger nextSupplierId = new AtomicInteger(100);
    private final AtomicInteger nextPurchaseId = new AtomicInteger(100);

    public PurchaseService(JdbcTemplate jdbc, VenueAccessService access, PosService posService) {
        super(jdbc);
        this.jdbc = jdbc;
        this.access = access;
        this.posService = posService;
        initSeedSuppliers();
    }

    private void initSeedSuppliers() {
        // Default seed suppliers available for any venue
        List<SupplierDto> seeds = List.of(
                new SupplierDto(1, null, "20100113610", "Unión de Cervecerías Peruanas Backus y Johnston S.A.A.", "Ventas Distribución", "013113000", "pedidos@backus.com.pe", "Av. Nicolás Ayllón 3986, Ate, Lima", "A"),
                new SupplierDto(2, null, "20415868019", "Arca Continental Lindley S.A. (Coca-Cola / Powerade)", "Atención Comercial", "013116000", "ventas@arcacontal.com", "Av. Javier Prado Este 6210, La Molina", "A"),
                new SupplierDto(3, null, "20331061655", "Ajeper S.A. (Sporade / Cielo / Big Cola)", "Canal Tradicional", "015135800", "distribucion@ajegroup.com", "Av. La Paz 131, San Miguel", "A"),
                new SupplierDto(4, null, "20100055237", "Distribuidora San Jorge S.A. (Snacks y Galletas)", "Despacho Express", "014521400", "contacto@sanjorge.com.pe", "Av. Argentina 2400, Callao", "A")
        );
        memorySuppliers.put(0, new ArrayList<>(seeds));
    }

    public boolean tablesExist() {
        try {
            Integer count = jdbc.queryForObject("""
                    select count(*) from information_schema.tables
                    where lower(table_schema) = 'public' and lower(table_name) in ('proveedor', 'compra', 'compra_detalle')
                    """, Integer.class);
            return count != null && count >= 3;
        } catch (Exception e) {
            return false;
        }
    }

    // =========================================================================
    // PROVEEDORES
    // =========================================================================

    public List<SupplierDto> listSuppliers(Integer sedeId, AuthUserDto user, boolean includeInactive) {
        int venue = access.requirePermission(sedeId, user, "inventario.ver");
        if (tablesExist()) {
            String estadoSql = includeInactive ? "" : "and p.estado = 'A'";
            return jdbc.query("""
                    select p.id_proveedor, p.id_sede, p.ruc, p.razon_social, p.contacto,
                           p.telefono, p.correo, p.direccion, p.estado
                    from proveedor p
                    where (p.id_sede is null or p.id_sede = ?) """ + estadoSql + """
                    order by p.razon_social
                    """, (rs, rowNum) -> new SupplierDto(
                    rs.getInt("id_proveedor"),
                    rs.getObject("id_sede") == null ? null : rs.getInt("id_sede"),
                    rs.getString("ruc"),
                    rs.getString("razon_social"),
                    rs.getString("contacto"),
                    rs.getString("telefono"),
                    rs.getString("correo"),
                    rs.getString("direccion"),
                    rs.getString("estado")
            ), venue);
        }

        // Memory fallback
        List<SupplierDto> result = new ArrayList<>();
        result.addAll(memorySuppliers.getOrDefault(0, List.of()));
        result.addAll(memorySuppliers.getOrDefault(venue, List.of()));
        return result.stream()
                .filter(s -> includeInactive || "A".equalsIgnoreCase(s.estado()))
                .sorted(Comparator.comparing(SupplierDto::razonSocial))
                .toList();
    }

    @Transactional
    public SupplierDto createSupplier(SupplierRequest request, AuthUserDto user) {
        int venue = access.requirePermission(request.sedeId(), user, "inventario.ingresar");
        String ruc = validateRuc(request.ruc());
        String razonSocial = validateRequired(request.razonSocial(), 150, "Razón social");

        if (tablesExist()) {
            Integer exists = jdbc.queryForObject("""
                    select count(*) from proveedor
                    where ruc = ? and estado = 'A' and (id_sede is null or id_sede = ?)
                    """, Integer.class, ruc, venue);
            if (exists != null && exists > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un proveedor activo con ese RUC");
            }

            KeyHolder key = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement statement = connection.prepareStatement("""
                        insert into proveedor (id_sede, ruc, razon_social, contacto, telefono, correo, direccion, estado, feccre)
                        values (?, ?, ?, ?, ?, ?, ?, 'A', now())
                        """, new String[]{"id_proveedor"});
                statement.setInt(1, venue);
                statement.setString(2, ruc);
                statement.setString(3, razonSocial);
                statement.setString(4, request.contacto());
                statement.setString(5, request.telefono());
                statement.setString(6, request.correo());
                statement.setString(7, request.direccion());
                return statement;
            }, key);
            Number generatedId = key.getKey();
            if (generatedId == null) throw new IllegalStateException("No se pudo recuperar el ID del proveedor");
            int id = generatedId.intValue();

            return new SupplierDto(id, venue, ruc, razonSocial, request.contacto(), request.telefono(), request.correo(), request.direccion(), "A");
        }

        // Memory fallback
        List<SupplierDto> current = memorySuppliers.computeIfAbsent(venue, k -> new ArrayList<>());
        if (current.stream().anyMatch(s -> "A".equalsIgnoreCase(s.estado()) && s.ruc().equals(ruc))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ya existe un proveedor activo con ese RUC");
        }
        SupplierDto created = new SupplierDto(nextSupplierId.getAndIncrement(), venue, ruc, razonSocial, request.contacto(), request.telefono(), request.correo(), request.direccion(), "A");
        current.add(created);
        return created;
    }

    @Transactional
    public SupplierDto updateSupplier(int id, SupplierRequest request, AuthUserDto user) {
        int venue = access.requirePermission(request.sedeId(), user, "inventario.ingresar");
        String ruc = validateRuc(request.ruc());
        String razonSocial = validateRequired(request.razonSocial(), 150, "Razón social");

        if (tablesExist()) {
            Integer exists = jdbc.queryForObject("""
                    select count(*) from proveedor
                    where id_proveedor != ? and ruc = ? and estado = 'A' and (id_sede is null or id_sede = ?)
                    """, Integer.class, id, ruc, venue);
            if (exists != null && exists > 0) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Otro proveedor ya tiene asignado ese RUC");
            }

            int updated = jdbc.update("""
                    update proveedor
                    set ruc = ?, razon_social = ?, contacto = ?, telefono = ?, correo = ?, direccion = ?, fecmod = now()
                    where id_proveedor = ? and (id_sede is null or id_sede = ?)
                    """, ruc, razonSocial, request.contacto(), request.telefono(), request.correo(), request.direccion(), id, venue);
            if (updated == 0) {
                throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Proveedor no encontrado");
            }
            return new SupplierDto(id, venue, ruc, razonSocial, request.contacto(), request.telefono(), request.correo(), request.direccion(), "A");
        }

        // Memory fallback
        List<SupplierDto> current = memorySuppliers.computeIfAbsent(venue, k -> new ArrayList<>());
        int index = -1;
        for (int i = 0; i < current.size(); i++) {
            if (current.get(i).id() == id) {
                index = i;
                break;
            }
        }
        if (index == -1) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Proveedor no encontrado");
        }
        SupplierDto updated = new SupplierDto(id, venue, ruc, razonSocial, request.contacto(), request.telefono(), request.correo(), request.direccion(), current.get(index).estado());
        current.set(index, updated);
        return updated;
    }

    @Transactional
    public String toggleSupplierStatus(int id, Integer sedeId, AuthUserDto user) {
        int venue = access.requirePermission(sedeId, user, "inventario.ingresar");
        if (tablesExist()) {
            String current = jdbc.queryForObject("select estado from proveedor where id_proveedor=? and (id_sede is null or id_sede=?)", String.class, id, venue);
            if (current == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
            String next = "A".equalsIgnoreCase(current) ? "I" : "A";
            jdbc.update("update proveedor set estado=?, fecmod=now() where id_proveedor=?", next, id);
            return next;
        }

        List<SupplierDto> list = memorySuppliers.getOrDefault(venue, new ArrayList<>());
        for (int i = 0; i < list.size(); i++) {
            if (list.get(i).id() == id) {
                SupplierDto old = list.get(i);
                String next = "A".equalsIgnoreCase(old.estado()) ? "I" : "A";
                list.set(i, new SupplierDto(old.id(), old.sedeId(), old.ruc(), old.razonSocial(), old.contacto(), old.telefono(), old.correo(), old.direccion(), next));
                return next;
            }
        }
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Proveedor no encontrado");
    }

    // =========================================================================
    // COMPRAS & RECEPCIÓN DE MERCADERÍA
    // =========================================================================

    public List<PurchaseDto> listPurchases(Integer sedeId, AuthUserDto user) {
        int venue = access.requirePermission(sedeId, user, "inventario.ver");
        if (tablesExist()) {
            return jdbc.query("""
                    select c.id_compra, c.id_sede, c.id_proveedor, p.razon_social as proveedor_nombre,
                           p.ruc as proveedor_ruc, c.numero_comprobante, c.tipo_comprobante,
                           coalesce(c.fecha_emision, c.feccre) as fecha_emision,
                           c.fecha_entrega_estimada, c.fecha_recepcion,
                           c.subtotal, c.igv, c.total, c.estado, c.observacion
                    from compra c
                    join proveedor p on p.id_proveedor = c.id_proveedor
                    where c.id_sede = ?
                    order by coalesce(c.fecha_emision, c.feccre) desc, c.id_compra desc
                    """, (rs, rowNum) -> new PurchaseDto(
                    rs.getInt("id_compra"),
                    rs.getInt("id_sede"),
                    rs.getInt("id_proveedor"),
                    rs.getString("proveedor_nombre"),
                    rs.getString("proveedor_ruc"),
                    rs.getString("numero_comprobante"),
                    rs.getString("tipo_comprobante"),
                    stringDateTime(rs, "fecha_emision"),
                    stringDateTime(rs, "fecha_entrega_estimada"),
                    stringDateTime(rs, "fecha_recepcion"),
                    rs.getDouble("subtotal"),
                    rs.getDouble("igv"),
                    rs.getDouble("total"),
                    rs.getString("estado"),
                    rs.getString("observacion"),
                    loadPurchaseItems(rs.getInt("id_compra"))
            ), venue);
        }

        return memoryPurchases.getOrDefault(venue, List.of()).stream()
                .sorted(Comparator.comparing(PurchaseDto::id).reversed())
                .toList();
    }

    private List<PurchaseItemDto> loadPurchaseItems(int purchaseId) {
        return jdbc.query("""
                select cd.id_producto, coalesce(p.nombre, 'Producto #' || cd.id_producto) as producto_nombre,
                       cd.cantidad, cd.costo_unitario, cd.subtotal
                from compra_detalle cd
                left join producto p on p.id_producto = cd.id_producto
                where cd.id_compra = ? and cd.estado = 'A'
                order by cd.id_compra_detalle
                """, (rs, rowNum) -> new PurchaseItemDto(
                rs.getInt("id_producto"),
                rs.getString("producto_nombre"),
                rs.getInt("cantidad"),
                rs.getDouble("costo_unitario"),
                rs.getDouble("subtotal")
        ), purchaseId);
    }

    @Transactional
    public PurchaseDto createPurchase(PurchaseRequest request, AuthUserDto user) {
        int venue = access.requirePermission(request.sedeId(), user, "inventario.ingresar");
        if (request.items() == null || request.items().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Debes agregar al menos una partida a la compra");
        }

        SupplierDto supplier = findSupplier(request.proveedorId(), venue, user)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST, "Proveedor no válido"));

        double subtotal = 0;
        List<PurchaseItemDto> resolvedItems = new ArrayList<>();
        for (PurchaseItemRequest item : request.items()) {
            if (item.cantidad() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "La cantidad debe ser mayor a 0");
            }
            if (item.costoUnitario() <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El costo unitario debe ser mayor a 0");
            }
            double lineSubtotal = BigDecimal.valueOf(item.cantidad())
                    .multiply(BigDecimal.valueOf(item.costoUnitario()))
                    .setScale(2, java.math.RoundingMode.HALF_UP).doubleValue();
            subtotal += lineSubtotal;

            String prodName = jdbc.queryForList("select nombre from producto where id_producto=?", String.class, item.productoId())
                    .stream().findFirst().orElse("Producto #" + item.productoId());

            resolvedItems.add(new PurchaseItemDto(item.productoId(), prodName, item.cantidad(), item.costoUnitario(), lineSubtotal));
        }

        double igv = round2(subtotal * 0.18);
        double total = round2(subtotal + igv);
        String tipo = fallback(request.tipoComprobante(), "factura").toLowerCase(Locale.ROOT);
        String numero = fallback(request.numeroComprobante(), "OC-" + System.currentTimeMillis() % 1000000);
        String estadoInicial = request.recibirInmediatamente() ? "RECIBIDA" : "EMITIDA";
        String nowStr = LocalDateTime.now().toString();

        PurchaseDto savedPurchase;
        if (tablesExist()) {
            BigDecimal subtotalAmount = BigDecimal.valueOf(subtotal);
            BigDecimal taxAmount = BigDecimal.valueOf(igv);
            BigDecimal totalAmount = BigDecimal.valueOf(total);
            KeyHolder key = new GeneratedKeyHolder();
            jdbc.update(connection -> {
                PreparedStatement statement = connection.prepareStatement("""
                    insert into compra (id_sede, id_proveedor, numero_comprobante, tipo_comprobante,
                                        fecha_emision, fecha_entrega_estimada, fecha_recepcion,
                                        subtotal, igv, total, estado, observacion, usucre)
                    values (?, ?, ?, ?, now(), ?, ?, ?, ?, ?, ?, ?, ?)
                    """, new String[]{"id_compra"});
                statement.setInt(1, venue);
                statement.setInt(2, request.proveedorId());
                statement.setString(3, numero);
                statement.setString(4, tipo);
                if (request.fechaEntregaEstimada() == null) statement.setTimestamp(5, null);
                else statement.setTimestamp(5, Timestamp.valueOf(LocalDateTime.parse(request.fechaEntregaEstimada())));
                if (request.recibirInmediatamente()) statement.setTimestamp(6, Timestamp.valueOf(LocalDateTime.now()));
                else statement.setTimestamp(6, null);
                statement.setBigDecimal(7, subtotalAmount);
                statement.setBigDecimal(8, taxAmount);
                statement.setBigDecimal(9, totalAmount);
                statement.setString(10, estadoInicial);
                statement.setString(11, request.observacion());
                statement.setString(12, user.nombre());
                return statement;
            }, key);

            Number generatedId = key.getKey();
            if (generatedId == null) throw new IllegalStateException("No se pudo recuperar el ID de la compra");
            int purchaseId = generatedId.intValue();
            for (PurchaseItemDto item : resolvedItems) {
                jdbc.update("""
                        insert into compra_detalle (id_compra, id_producto, cantidad, costo_unitario, subtotal, estado)
                        values (?, ?, ?, ?, ?, 'A')
                        """, purchaseId, item.productoId(), item.cantidad(),
                        BigDecimal.valueOf(item.costoUnitario()), BigDecimal.valueOf(item.subtotal()));
            }

            savedPurchase = new PurchaseDto(purchaseId, venue, supplier.id(), supplier.razonSocial(), supplier.ruc(),
                    numero, tipo, nowStr, request.fechaEntregaEstimada(), request.recibirInmediatamente() ? nowStr : null,
                    subtotal, igv, total, estadoInicial, request.observacion(), resolvedItems);
        } else {
            int purchaseId = nextPurchaseId.getAndIncrement();
            savedPurchase = new PurchaseDto(purchaseId, venue, supplier.id(), supplier.razonSocial(), supplier.ruc(),
                    numero, tipo, nowStr, request.fechaEntregaEstimada(), request.recibirInmediatamente() ? nowStr : null,
                    subtotal, igv, total, estadoInicial, request.observacion(), resolvedItems);
            memoryPurchases.computeIfAbsent(venue, k -> new ArrayList<>()).add(savedPurchase);
        }

        // Si se seleccionó recibir inmediatamente, actualiza el inventario físico en kardex y producto
        if (request.recibirInmediatamente()) {
            for (PurchaseItemDto item : resolvedItems) {
                String motivo = "Compra " + tipo.toUpperCase(Locale.ROOT) + " " + numero + " - " + supplier.razonSocial();
                posService.registerInventoryEntry(new InventoryEntryRequest(
                        item.productoId(), item.cantidad(), item.costoUnitario(), motivo, venue
                ));
            }
        }

        return savedPurchase;
    }

    @Transactional
    public PurchaseDto receivePurchase(int id, Integer sedeId, AuthUserDto user) {
        int venue = access.requirePermission(sedeId, user, "inventario.ingresar");
        if (!tablesExist()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "La recepción requiere persistencia de compras e inventario");
        }
        // Serialize concurrent clicks/retries on the durable purchase row. This lock
        // is held through the inventory movements and the purchase status update.
        Integer lockedId = jdbc.queryForList("""
                select id_compra from compra where id_compra = ? and id_sede = ? for update
                """, Integer.class, id, venue).stream().findFirst().orElse(null);
        if (lockedId == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Compra no encontrada");
        PurchaseDto purchase = getPurchase(id, venue, user);

        if ("RECIBIDA".equalsIgnoreCase(purchase.estado())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "La compra ya fue recepcionada previamente");
        }
        if ("ANULADA".equalsIgnoreCase(purchase.estado())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No se puede recepcionar una compra anulada");
        }

        String nowStr = LocalDateTime.now().toString();
        // Ingresar mercadería a Kardex
        for (PurchaseItemDto item : purchase.items()) {
            String motivo = "Recepción compra " + purchase.tipoComprobante().toUpperCase(Locale.ROOT) + " " + purchase.numeroComprobante() + " - " + purchase.proveedorNombre();
            posService.registerInventoryEntry(new InventoryEntryRequest(
                    item.productoId(), item.cantidad(), item.costoUnitario(), motivo, venue
            ));
        }

        if (tablesExist()) {
            int changed = jdbc.update("""
                    update compra set estado='RECIBIDA', fecha_recepcion=now(), fecmod=now()
                    where id_compra=? and id_sede=? and estado <> 'RECIBIDA'
                    """, id, venue);
            if (changed != 1) throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "La compra ya fue recepcionada previamente");
        } else {
            List<PurchaseDto> list = memoryPurchases.getOrDefault(venue, new ArrayList<>());
            for (int i = 0; i < list.size(); i++) {
                if (list.get(i).id() == id) {
                    PurchaseDto old = list.get(i);
                    list.set(i, new PurchaseDto(old.id(), old.sedeId(), old.proveedorId(), old.proveedorNombre(),
                            old.proveedorRuc(), old.numeroComprobante(), old.tipoComprobante(), old.fechaEmision(),
                            old.fechaEntregaEstimada(), nowStr, old.subtotal(), old.igv(), old.total(),
                            "RECIBIDA", old.observacion(), old.items()));
                    break;
                }
            }
        }

        return getPurchase(id, venue, user);
    }

    @Transactional
    public PurchaseDto cancelPurchase(int id, Integer sedeId, String motivo, AuthUserDto user) {
        int venue = access.requirePermission(sedeId, user, "inventario.ingresar");
        PurchaseDto purchase = getPurchase(id, venue, user);

        if ("RECIBIDA".equalsIgnoreCase(purchase.estado())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "No se puede anular directamente una compra recepcionada. Registra un ajuste de merma o devolución.");
        }
        if ("ANULADA".equalsIgnoreCase(purchase.estado())) {
            return purchase;
        }

        if (tablesExist()) {
            jdbc.update("update compra set estado='ANULADA', observacion = coalesce(observacion, '') || ' [Anulada: ' || ? || ']', fecmod=now() where id_compra=?",
                    fallback(motivo, "Cancelada por usuario"), id);
        } else {
            List<PurchaseDto> list = memoryPurchases.getOrDefault(venue, new ArrayList<>());
            for (int i = 0; i < list.size(); i++) {
                if (list.get(i).id() == id) {
                    PurchaseDto old = list.get(i);
                    list.set(i, new PurchaseDto(old.id(), old.sedeId(), old.proveedorId(), old.proveedorNombre(),
                            old.proveedorRuc(), old.numeroComprobante(), old.tipoComprobante(), old.fechaEmision(),
                            old.fechaEntregaEstimada(), old.fechaRecepcion(), old.subtotal(), old.igv(), old.total(),
                            "ANULADA", old.observacion() + " [Anulada: " + fallback(motivo, "Cancelada") + "]", old.items()));
                    break;
                }
            }
        }

        return getPurchase(id, venue, user);
    }

    public PurchaseDto getPurchase(int id, Integer sedeId, AuthUserDto user) {
        int venue = access.requirePermission(sedeId, user, "inventario.ver");
        if (tablesExist()) {
            return jdbc.query("""
                    select c.id_compra, c.id_sede, c.id_proveedor, p.razon_social as proveedor_nombre,
                           p.ruc as proveedor_ruc, c.numero_comprobante, c.tipo_comprobante,
                           coalesce(c.fecha_emision, c.feccre) as fecha_emision,
                           c.fecha_entrega_estimada, c.fecha_recepcion,
                           c.subtotal, c.igv, c.total, c.estado, c.observacion
                    from compra c
                    join proveedor p on p.id_proveedor = c.id_proveedor
                    where c.id_compra = ? and c.id_sede = ?
                    """, (rs, rowNum) -> new PurchaseDto(
                    rs.getInt("id_compra"),
                    rs.getInt("id_sede"),
                    rs.getInt("id_proveedor"),
                    rs.getString("proveedor_nombre"),
                    rs.getString("proveedor_ruc"),
                    rs.getString("numero_comprobante"),
                    rs.getString("tipo_comprobante"),
                    stringDateTime(rs, "fecha_emision"),
                    stringDateTime(rs, "fecha_entrega_estimada"),
                    stringDateTime(rs, "fecha_recepcion"),
                    rs.getDouble("subtotal"),
                    rs.getDouble("igv"),
                    rs.getDouble("total"),
                    rs.getString("estado"),
                    rs.getString("observacion"),
                    loadPurchaseItems(rs.getInt("id_compra"))
            ), id, venue).stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Compra no encontrada"));
        }

        return memoryPurchases.getOrDefault(venue, List.of()).stream()
                .filter(p -> p.id() == id)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Compra no encontrada"));
    }

    private Optional<SupplierDto> findSupplier(int id, int venue, AuthUserDto user) {
        return listSuppliers(venue, user, true).stream()
                .filter(s -> s.id() == id)
                .findFirst();
    }

    private String validateRuc(String ruc) {
        if (ruc == null || !ruc.trim().matches("^(10|20)[0-9]{9}$")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "El RUC debe tener 11 dígitos numéricos válidos (iniciando con 10 o 20)");
        }
        return ruc.trim();
    }

    private String validateRequired(String val, int max, String fieldName) {
        if (val == null || val.trim().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, fieldName + " es requerido");
        }
        String clean = val.trim();
        if (clean.length() > max) {
            clean = clean.substring(0, max);
        }
        return clean;
    }
}
