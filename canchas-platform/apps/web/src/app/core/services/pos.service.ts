import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, of, throwError, timeout } from 'rxjs';
import { supabase } from '@core/supabase/client';
import { DatabaseService } from '@core/supabase/database.service';
import { environment } from '@env/environment';
import { CajaService } from './caja.service';
import { AuthService } from '@core/auth/auth.service';
import {
  CategoriaProducto,
  ItemCarritoPOS,
  MetodoPagoPOS,
  MovimientoKardex,
  Producto,
  TipoComprobante,
  VentaPOS,
  inferirIconoCategoria,
  parseCategoryIconAndDescription,
} from '@shared/models/pos.model';

const STORAGE_KEY_PRODUCTOS = 'canchero_pos_productos';
const STORAGE_KEY_VENTAS = 'canchero_pos_ventas';
const STORAGE_KEY_KARDEX = 'canchero_pos_kardex';
const STORAGE_KEY_CORRELATIVOS = 'canchero_pos_correlativos';
const STORAGE_KEY_FAVORITOS = 'canchero_pos_favoritos';

const CATEGORIAS_DEFAULT: CategoriaProducto[] = [{ id: 0, nombre: 'Todas', icono: 'apps' }];

@Injectable({ providedIn: 'root' })
export class PosService {
  private readonly auth = inject(AuthService);
  private readonly cajaService = inject(CajaService);
  private readonly db = inject(DatabaseService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/pos`;
  private realtimeReady = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  // ===== SIGNALS REACTIVOS =====
  readonly categorias = signal<CategoriaProducto[]>(CATEGORIAS_DEFAULT);
  readonly productos = signal<Producto[]>([]);
  readonly carrito = signal<ItemCarritoPOS[]>([]);
  readonly ventas = signal<VentaPOS[]>([]);
  readonly kardex = signal<MovimientoKardex[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly paymentsReady = signal(false);
  private loadRequest = 0;

  readonly correlativos = signal<{ boleta: number; factura: number; ticket: number }>(
    this.leerCorrelativosStorage(),
  );

  readonly categoriaSeleccionada = signal<number>(0); // 0 no colisiona con IDs reales
  readonly filtroBusqueda = signal<string>('');
  readonly soloFavoritos = signal<boolean>(false);
  readonly favoritosProductoIds = signal<Set<number>>(this.leerFavoritosStorage());

  // ===== COMPUTEDS OFICIALES 5.5 (DESGLOSE TRIBUTARIO PERÚ) =====

  /**
   * Productos filtrados por búsqueda y categoría
   */
  readonly productosFiltrados = computed<Producto[]>(() => {
    const catId = this.categoriaSeleccionada();
    const query = this.filtroBusqueda().trim().toLowerCase();
    const soloFavoritos = this.soloFavoritos();
    const favoritos = this.favoritosProductoIds();

    return this.productos().filter((p) => {
      const coincideCat = catId === 0 || p.categoriaId === catId;
      const coincideFavorito = !soloFavoritos || favoritos.has(p.id);
      const coincideQuery =
        !query ||
        p.nombre.toLowerCase().includes(query) ||
        p.codigoBarras.includes(query) ||
        p.categoriaNombre.toLowerCase().includes(query);
      return coincideCat && coincideFavorito && coincideQuery;
    });
  });

  /**
   * Alerta de stock mínimo
   */
  readonly productosStockCritico = computed<Producto[]>(() => {
    return this.productos().filter((p) => p.stock <= p.stockMinimo);
  });

  /**
   * Total = ∑ (Cantidad × Precio Venta)
   */
  readonly totalCarrito = computed<number>(() => {
    const sum = this.carrito().reduce((acc, item) => acc + item.subtotal, 0);
    return Number(sum.toFixed(2));
  });

  /**
   * Subtotal = Total / 1.18 (Base Imponible)
   */
  readonly subtotalCarrito = computed<number>(() => {
    const total = this.totalCarrito();
    return Number((total / 1.18).toFixed(2));
  });

  /**
   * IGV (18%) = Total - Subtotal
   */
  readonly igvCarrito = computed<number>(() => {
    const total = this.totalCarrito();
    const subtotal = this.subtotalCarrito();
    return Number((total - subtotal).toFixed(2));
  });

  readonly totalUnidadesCarrito = computed<number>(() => {
    return this.carrito().reduce((acc, item) => acc + item.cantidad, 0);
  });

  private lastLoadedSedeId: number | null = null;
  private lastLoadedUserId: string | null = null;

  constructor() {
    this.setupRealtimeSubscriptions();
    effect(() => {
      const user = this.auth.currentUser();
      const sede = typeof this.db?.sedeOperativaId === 'function' ? this.db.sedeOperativaId() : null;
      untracked(() => {
        if (!user?.id || !sede) {
          this.productos.set([]);
          this.categorias.set(CATEGORIAS_DEFAULT);
          this.categoriaSeleccionada.set(0);
          this.ventas.set([]);
          this.kardex.set([]);
          this.carrito.set([]);
          this.lastLoadedSedeId = null;
          this.lastLoadedUserId = null;
          return;
        }
        if (this.lastLoadedSedeId === sede && this.lastLoadedUserId === user.id) {
          return;
        }
        this.productos.set([]);
        this.categorias.set(CATEGORIAS_DEFAULT);
        this.categoriaSeleccionada.set(0);
        this.ventas.set([]);
        this.kardex.set([]);
        this.carrito.set([]);
        this.lastLoadedSedeId = sede;
        this.lastLoadedUserId = user.id;
        void this.cargarDesdeBackendSiExiste();
      });
    });
  }

  private currentSedeId(): number {
    return this.db.getSedeOperativaId();
  }

  recargar(): void {
    void this.cargarDesdeBackendSiExiste();
  }

  private storageKey(base: string): string {
    return `${base}_sede_${this.currentSedeId() || 'sin-sede'}`;
  }

  private belongsToCurrentSede(item: { sedeId?: number | null }): boolean {
    return item.sedeId != null && Number(item.sedeId) === this.currentSedeId();
  }

  // ===== ACCIONES DEL CARRITO POS =====

  agregarAlCarrito(producto: Producto, cantidad = 1): void {
    const scoped = this.productos().find(
      (p) => p.id === producto.id && this.belongsToCurrentSede(p),
    );
    if (!this.auth.currentUser() || !scoped || !this.belongsToCurrentSede(producto)) {
      throw new Error('El producto no pertenece al inventario cargado de esta sede.');
    }
    producto = scoped;
    if (producto.stock <= 0) {
      throw new Error(`El producto "${producto.nombre}" está agotado en almacén.`);
    }

    const items = [...this.carrito()];
    const index = items.findIndex((i) => i.producto.id === producto.id);

    if (index >= 0) {
      const nuevaCantidad = items[index].cantidad + cantidad;
      if (nuevaCantidad > producto.stock) {
        throw new Error(`Solo hay ${producto.stock} unidades disponibles de "${producto.nombre}".`);
      }
      items[index] = {
        ...items[index],
        cantidad: nuevaCantidad,
        subtotal: Number((nuevaCantidad * producto.precioVenta).toFixed(2)),
      };
    } else {
      items.push({
        producto,
        cantidad: Math.min(cantidad, producto.stock),
        subtotal: Number((cantidad * producto.precioVenta).toFixed(2)),
      });
    }

    this.carrito.set(items);
  }

  modificarCantidadCarrito(productoId: number, delta: number): void {
    const items = [...this.carrito()];
    const index = items.findIndex((i) => i.producto.id === productoId);
    if (index < 0) return;

    const nuevaCantidad = items[index].cantidad + delta;
    if (nuevaCantidad <= 0) {
      this.eliminarDelCarrito(productoId);
      return;
    }

    if (nuevaCantidad > items[index].producto.stock) {
      return; // No sobrepasar el stock físico
    }

    items[index] = {
      ...items[index],
      cantidad: nuevaCantidad,
      subtotal: Number((nuevaCantidad * items[index].producto.precioVenta).toFixed(2)),
    };
    this.carrito.set(items);
  }

  eliminarDelCarrito(productoId: number): void {
    this.carrito.set(this.carrito().filter((i) => i.producto.id !== productoId));
  }

  limpiarCarrito(): void {
    this.carrito.set([]);
  }

  esProductoFavorito(productoId: number): boolean {
    return this.favoritosProductoIds().has(productoId);
  }

  toggleFavoritoProducto(productoId: number): void {
    const favoritos = new Set(this.favoritosProductoIds());
    if (favoritos.has(productoId)) {
      favoritos.delete(productoId);
    } else {
      favoritos.add(productoId);
    }
    this.favoritosProductoIds.set(favoritos);
    this.guardarFavoritosStorage(favoritos);
  }

  // ===== CORRELATIVOS DE COMPROBANTES =====

  generarNumeroComprobante(tipo: TipoComprobante): string {
    const c = this.correlativos();
    if (tipo === 'boleta') {
      return `B001-${String(c.boleta).padStart(6, '0')}`;
    }
    if (tipo === 'factura') {
      return `F001-${String(c.factura).padStart(6, '0')}`;
    }
    return `NV01-${String(c.ticket).padStart(6, '0')}`;
  }

  // ===== PROCESAMIENTO DE VENTA POS & KARDEX CONTINUO =====

  private pendingOperation: { fingerprint: string; key: string } | null = null;
  readonly processing = signal(false);

  async procesarVenta(datos: {
    tipoComprobante: TipoComprobante;
    metodoPago: MetodoPagoPOS;
    cajeroNombre?: string;
    clienteNombre?: string;
    clienteDocumento?: string;
    montoPagado?: number;
    pagos?: { metodoPago: string; monto: number; montoRecibido?: number }[];
  }): Promise<VentaPOS> {
    if (this.processing()) throw new Error('Ya se esta procesando una venta.');
    if (!this.paymentsReady())
      throw new Error('El registro de pagos requiere completar la migracion de base de datos.');
    const userId = this.auth.currentUser()?.id;
    const sedeId = this.currentSedeId();
    const sessionId = this.cajaService.sesionActiva()?.id;
    if (!userId || !sedeId || !sessionId)
      throw new Error('Inicia sesion y abre un turno de esta sede.');
    const items = this.carrito().map((i) => ({
      productoId: i.producto.id,
      nombre: i.producto.nombre,
      cantidad: i.cantidad,
      precioUnitario: i.producto.precioVenta,
      subtotal: i.subtotal,
    }));
    if (!items.length) throw new Error('El carrito esta vacio.');
    const payload = { ...datos, sedeId, sesionCajaId: sessionId, items };
    const fingerprint = JSON.stringify({ userId, ...payload });
    if (this.pendingOperation?.fingerprint !== fingerprint) {
      this.pendingOperation = { fingerprint, key: crypto.randomUUID() };
    }
    this.processing.set(true);
    try {
      const saved = await firstValueFrom(
        this.http.post<VentaPOS>(`${this.apiUrl}/sales`, {
          ...payload,
          idempotencyKey: this.pendingOperation.key,
        }),
      );
      if (!saved?.id || Number(saved.sedeId) !== sedeId)
        throw new Error('El servidor no confirmo la venta.');
      if (
        this.auth.currentUser()?.id !== userId ||
        this.currentSedeId() !== sedeId ||
        this.cajaService.sesionActiva()?.id !== sessionId
      ) {
        throw new Error(
          'La venta se guardo en el contexto anterior. Consulta su historial antes de reintentar.',
        );
      }
      this.ventas.update((current) => [saved, ...current.filter((v) => v.id !== saved.id)]);
      this.limpiarCarrito();
      this.pendingOperation = null;
      await this.cargarDesdeBackendSiExiste();
      this.cajaService.recargar();
      return saved;
    } finally {
      this.processing.set(false);
    }
  }

  /**
   * Registro de reposición / ingreso de mercadería en almacén
   */
  registrarEntradaMercaderia(
    productoId: number,
    cantidad: number,
    precioCompra: number,
    motivo: string,
  ): void {
    if (cantidad <= 0) return;

    const productosActuales = [...this.productos()];
    const index = productosActuales.findIndex((p) => p.id === productoId);
    if (index < 0) return;

    const prod = productosActuales[index];
    const nuevoStock = prod.stock + cantidad;
    productosActuales[index] = {
      ...prod,
      stock: nuevoStock,
      precioCompra: precioCompra > 0 ? precioCompra : prod.precioCompra,
    };

    const ahora = new Date().toISOString();
    const movimiento: MovimientoKardex = {
      id: Date.now(),
      productoId: prod.id,
      productoNombre: prod.nombre,
      fecha: ahora,
      tipo: '+', // Entrada de mercadería
      cantidad,
      precioUnitario: precioCompra > 0 ? precioCompra : prod.precioCompra,
      saldoStock: nuevoStock,
      motivo: motivo.trim() || 'Ingreso de mercadería / Reposición proveedor',
    };

    this.productos.set(productosActuales);
    this.guardarProductosStorage(productosActuales);

    const nuevoKardex = [movimiento, ...this.kardex()];
    this.kardex.set(nuevoKardex);
    this.guardarKardexStorage(nuevoKardex);

    this.sincronizarEntradaMercaderiaBackend(movimiento);
  }

  // ===== PERSISTENCIA ASÍNCRONA BACKEND =====

  private async sincronizarEntradaMercaderiaBackend(movimiento: MovimientoKardex): Promise<void> {
    try {
      await firstValueFrom(
        this.http.post<MovimientoKardex>(`${this.apiUrl}/inventory/entries`, {
          productoId: movimiento.productoId,
          cantidad: movimiento.cantidad,
          precioCompra: movimiento.precioUnitario,
          motivo: movimiento.motivo,
          sedeId: this.db.getSedeOperativaId(),
        }),
      );
      await this.cargarDesdeBackendSiExiste();
    } catch (error) {
      console.warn('Advertencia sincronizando entrada de mercadería en backend:', error);
      this.loadError.set(
        'No se pudo guardar el ingreso en el servidor. No se reenviara por otra via.',
      );
    }
  }

  // ===== LOCAL STORAGE HELPERS =====

  private guardarProductosStorage(prods: Producto[]): void {
    try {
      localStorage.setItem(this.storageKey(STORAGE_KEY_PRODUCTOS), JSON.stringify(prods));
    } catch {
      // Fallback
    }
  }

  private leerVentasStorage(): VentaPOS[] {
    try {
      const data = localStorage.getItem(this.storageKey(STORAGE_KEY_VENTAS));
      return data
        ? (JSON.parse(data) as VentaPOS[]).filter((v) => this.belongsToCurrentSede(v))
        : [];
    } catch {
      return [];
    }
  }

  private guardarVentasStorage(ventas: VentaPOS[]): void {
    try {
      localStorage.setItem(
        this.storageKey(STORAGE_KEY_VENTAS),
        JSON.stringify(ventas.filter((v) => this.belongsToCurrentSede(v))),
      );
    } catch {
      // Fallback
    }
  }

  private leerKardexStorage(): MovimientoKardex[] {
    try {
      const data = localStorage.getItem(this.storageKey(STORAGE_KEY_KARDEX));
      if (!data) return [];
      const k = JSON.parse(data);
      if (
        Array.isArray(k) &&
        k.some(
          (item) =>
            item.motivo?.includes('Inventario Inicial') || item.motivo?.includes('pedido Backus'),
        )
      ) {
        localStorage.removeItem(this.storageKey(STORAGE_KEY_KARDEX));
        return [];
      }
      return Array.isArray(k) ? k.filter((item) => this.belongsToCurrentSede(item)) : [];
    } catch {
      return [];
    }
  }

  private guardarKardexStorage(kardex: MovimientoKardex[]): void {
    try {
      localStorage.setItem(
        this.storageKey(STORAGE_KEY_KARDEX),
        JSON.stringify(kardex.filter((item) => this.belongsToCurrentSede(item))),
      );
    } catch {
      // Fallback
    }
  }

  private leerCorrelativosStorage(): { boleta: number; factura: number; ticket: number } {
    try {
      const data = localStorage.getItem(this.storageKey(STORAGE_KEY_CORRELATIVOS));
      return data ? JSON.parse(data) : { boleta: 1, factura: 1, ticket: 1 };
    } catch {
      return { boleta: 1, factura: 1, ticket: 1 };
    }
  }

  private guardarCorrelativosStorage(c: { boleta: number; factura: number; ticket: number }): void {
    try {
      localStorage.setItem(this.storageKey(STORAGE_KEY_CORRELATIVOS), JSON.stringify(c));
    } catch {
      // Fallback
    }
  }

  private leerFavoritosStorage(): Set<number> {
    try {
      const data = localStorage.getItem(this.storageKey(STORAGE_KEY_FAVORITOS));
      const ids = data ? JSON.parse(data) : [];
      return new Set(Array.isArray(ids) ? ids.map((id) => Number(id)).filter(Number.isFinite) : []);
    } catch {
      return new Set();
    }
  }

  private guardarFavoritosStorage(favoritos: Set<number>): void {
    try {
      localStorage.setItem(this.storageKey(STORAGE_KEY_FAVORITOS), JSON.stringify([...favoritos]));
    } catch {
      // Fallback
    }
  }

  private setupRealtimeSubscriptions(): void {
    if (this.realtimeReady) return;
    this.realtimeReady = true;

    try {
      const channelName = 'canchero-pos-channel';
      const existing = supabase.getChannels().find((c) => c.topic === `realtime:${channelName}`);
      if (existing) {
        supabase.removeChannel(existing);
      }
      supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'producto' }, () =>
          this.scheduleBackendRefresh(),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'kardex' }, () =>
          this.scheduleBackendRefresh(),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'venta' }, () =>
          this.scheduleBackendRefresh(),
        )
        .on('postgres_changes', { event: '*', schema: 'public', table: 'venta_detalle' }, () =>
          this.scheduleBackendRefresh(),
        )
        .subscribe();
    } catch {
      // Entorno de test o offline sin realtime
    }
  }

  private scheduleBackendRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.cargarDesdeBackendSiExiste();
    }, 450);
  }

  private async cargarDesdeBackendSiExiste(): Promise<void> {
    const sedeId = this.currentSedeId();
    const ownerId = this.auth.currentUser()?.id;
    const request = ++this.loadRequest;
    this.paymentsReady.set(false);
    this.loadError.set('');
    if (!sedeId || !ownerId) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    try {
      const withTimeout = <T>(obs$: import('rxjs').Observable<T>) =>
        firstValueFrom(
          obs$.pipe(
            timeout({ each: 4000, with: () => throwError(() => new Error('Tiempo de espera agotado')) }),
          ),
        );
      const safeGet = <T>(url: string, fallback: T): Promise<T> =>
        firstValueFrom(
          this.http
            .get<T>(url)
            .pipe(
              timeout({ each: 4000, with: () => of(fallback) }),
              catchError(() => of(fallback)),
            ),
        );

      const [productos, kardex, ventas, capabilities, categorias] = await Promise.all([
        withTimeout(this.http.get<Producto[]>(`${this.apiUrl}/products?sedeId=${sedeId}`)),
        withTimeout(this.http.get<MovimientoKardex[]>(`${this.apiUrl}/inventory?sedeId=${sedeId}`)),
        withTimeout(this.http.get<VentaPOS[]>(`${this.apiUrl}/sales?sedeId=${sedeId}`)),
        safeGet<{ ready: boolean }>(`${this.apiUrl}/payment-capabilities?sedeId=${sedeId}`, {
          ready: true,
        }),
        safeGet<CategoriaProducto[]>(`${this.apiUrl}/catalog/categories?sedeId=${sedeId}`, []),
      ]);
      if (
        request !== this.loadRequest ||
        this.currentSedeId() !== sedeId ||
        this.auth.currentUser()?.id !== ownerId
      )
        return;
      const belongs = (item: { sedeId?: number | null }) => Number(item.sedeId) === sedeId;
      const categoriasProcesadas: CategoriaProducto[] = (categorias ?? []).map((cat) => {
        const parsed = parseCategoryIconAndDescription(cat.descripcion, cat.nombre);
        return {
          ...cat,
          icono: parsed.icono,
          descripcion: parsed.descripcion,
        };
      });

      const catMap = new Map<number, string>();
      const catNameMap = new Map<string, string>();
      categoriasProcesadas.forEach((c) => {
        const idNum = Number(c.id);
        if (!isNaN(idNum)) catMap.set(idNum, c.icono || 'category');
        if (c.nombre) catNameMap.set(c.nombre.toLowerCase().trim(), c.icono || 'category');
      });

      const productosProcesados: Producto[] = (productos ?? []).filter(belongs).map((p) => {
        const catIdNum = p.categoriaId != null ? Number(p.categoriaId) : NaN;
        const catIconById = !isNaN(catIdNum) ? catMap.get(catIdNum) : undefined;
        const catIconByName = p.categoriaNombre
          ? catNameMap.get(p.categoriaNombre.toLowerCase().trim())
          : undefined;
        const catIcon = catIconById || catIconByName;

        // Si el producto no tiene foto, debe adoptar el icono de su categoría
        const icono =
          (catIcon && catIcon !== 'category' ? catIcon : undefined) ||
          (p.icono &&
          p.icono !== 'inventory_2' &&
          p.icono !== 'assignment_turned_in' &&
          p.icono !== 'shopping_bag' &&
          p.icono !== 'category'
            ? p.icono
            : undefined) ||
          catIcon ||
          inferirIconoCategoria(p.categoriaNombre || p.nombre);

        return {
          ...p,
          icono,
        };
      });

      this.productos.set(productosProcesados);
      this.categorias.set([...CATEGORIAS_DEFAULT, ...categoriasProcesadas]);
      if (!this.categorias().some((c) => c.id === this.categoriaSeleccionada()))
        this.categoriaSeleccionada.set(0);
      this.kardex.set((kardex ?? []).filter(belongs));
      this.ventas.set((ventas ?? []).filter(belongs));
      this.paymentsReady.set(capabilities?.ready === true);
    } catch {
      if (request === this.loadRequest) {
        this.productos.set([]);
        this.kardex.set([]);
        this.ventas.set([]);
        this.carrito.set([]);
        this.loadError.set('No se pudo cargar el inventario de esta sede.');
      }
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }
}
