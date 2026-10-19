import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';
import { AdminPos } from './admin-pos';
import { PosService } from '@core/services/pos.service';
import { CajaService } from '@core/services/caja.service';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import type { Producto } from '@shared/models/pos.model';

describe('AdminPos Component - Etapa 6 (Punto de Venta POS & Kardex)', () => {
  let fixture: ComponentFixture<AdminPos>;
  let component: AdminPos;
  let posService: PosService;
  let cajaService: CajaService;

  const mockCurrentUser = signal<{ id: string; email: string; nombre: string; rol: string } | null>({
    id: 'owner-test-uuid',
    email: 'admin@canchero.pe',
    nombre: 'Roberto Mendoza',
    rol: 'dueno',
  });

  const mockDbService = {
    sedeOperativaId: signal<number | null>(1),
    getSedesPorDueno: vi.fn(() => [{ id: 1, nombre: 'Sede de prueba' }]),
    getSedeOperativaId: vi.fn(() => 1),
    getUsuarioOperativoUuid: vi.fn(() => 'user-uuid-123'),
    getCanchasPorSede: vi.fn(() => [{ id: 10, id_sede: 1, nombre: 'Cancha 1' }]),
    reservas: signal<any[]>([]),
    pagos: signal<any[]>([]),
    usuarios: signal<any[]>([
      { id: 1, email: 'admin@canchero.pe', nombre: 'Roberto Mendoza', rol: 'dueno' },
    ]),
  };

  const testProductos: Producto[] = [
    {
      id: 1,
      sedeId: 1,
      categoriaId: 2,
      categoriaNombre: 'Rehidratantes & Bebidas',
      codigoBarras: '775018200101',
      nombre: 'Gatorade Cool Blue 750ml',
      precioCompra: 4.2,
      precioVenta: 6.5,
      stock: 20,
      stockMinimo: 5,
      icono: 'sports_bar',
    },
    {
      id: 2,
      sedeId: 1,
      categoriaId: 4,
      categoriaNombre: 'Snacks & Golosinas',
      codigoBarras: '775018200401',
      nombre: 'Papas Lays Clásicas 85g',
      precioCompra: 2.5,
      precioVenta: 4.0,
      stock: 3,
      stockMinimo: 5, // Stock bajo
      icono: 'fastfood',
    },
    {
      id: 3,
      sedeId: 1,
      categoriaId: 3,
      categoriaNombre: 'Aguas & Energizantes',
      codigoBarras: '775018200201',
      nombre: 'Agua San Mateo sin gas 600ml',
      precioCompra: 1.5,
      precioVenta: 2.5,
      stock: 0, // Agotado
      stockMinimo: 5,
      icono: 'local_drink',
    },
  ];

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    vi.spyOn(CajaService.prototype as any, 'setupRealtimeSubscriptions').mockImplementation(async () => {});
    vi.spyOn(CajaService.prototype as any, 'sincronizarAperturaBackend').mockImplementation(async (s: any) => ({ ...s, id: 10 }));
    vi.spyOn(CajaService.prototype as any, 'sincronizarMovimientoBackend').mockImplementation(async (m: any) => ({ ...m, id: crypto.randomUUID() }));
    vi.spyOn(CajaService.prototype as any, 'sincronizarCierreBackend').mockImplementation(async (s: any, count: any) => {
      const expected = s.montoApertura + cajaService.balanceMovimientosManuales();
      const difference = count.totalEfectivoFisico - expected;
      return { id: 'server-audit', sesionId: s.id, cajaNombre: s.cajaNombre, cajeroNombre: s.cajeroNombre, fechaArqueo: new Date().toISOString(),
        ...count, montoApertura: s.montoApertura, totalPagosEfectivo: 0, totalIngresos: cajaService.totalIngresosManuales(),
        totalEgresos: cajaService.totalEgresosManuales(), balanceEstado: difference < 0 ? 'faltante' : difference > 0 ? 'sobrante' : 'cuadrada',
        montoSistema: expected, diferencia: difference };
    });
    vi.spyOn(PosService.prototype as any, 'setupRealtimeSubscriptions').mockImplementation(async () => {});

    vi.spyOn(PosService.prototype as any, 'sincronizarEntradaMercaderiaBackend').mockResolvedValue(undefined);

    await TestBed.configureTestingModule({
      imports: [AdminPos],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: mockCurrentUser } },
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compileComponents();

    posService = TestBed.inject(PosService);
    cajaService = TestBed.inject(CajaService);

    // Resetear signals con datos controlados de prueba
    posService.productos.set([...testProductos]);
    posService.carrito.set([]);
    posService.ventas.set([]);
    posService.kardex.set([]);
    posService.categoriaSeleccionada.set(1);
    posService.filtroBusqueda.set('');
    posService.soloFavoritos.set(false);
    posService.favoritosProductoIds.set(new Set());

    // Caja inicialmente cerrada
    cajaService.sesionActiva.set(null);
    cajaService.movimientos.set([]);

    fixture = TestBed.createComponent(AdminPos);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('venueId', 1);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(request => request.flush([]));
    await fixture.whenStable();
    await vi.waitFor(() => expect(cajaService.loading()).toBe(false));
    await vi.waitFor(() => expect(posService.loading()).toBe(false));
    cajaService.cajasRegistradas.set([{ id: 1, nombre: 'Caja de prueba', sedeId: 1 }]);
    fixture.detectChanges();
    posService.productos.set([...testProductos]);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    fixture.destroy();
  });

  it('debe crearse correctamente e iniciar en la subpestaña de Caja POS & Mostrador', async () => {
    expect(component).toBeTruthy();
    expect(component.posSubTab()).toBe('caja_pos');
    expect(component.posTabIndex()).toBe(0);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Punto de Venta (POS) & Kardex');
    expect(el.textContent).toContain('Caja POS & Mostrador');
  });

  it('muestra inventario sin vincular en vez de productos globales agotados', async () => {
    posService.productos.set([]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Esta sede no tiene productos vinculados');
    const entry = Array.from(el.querySelectorAll('button')).find(button => button.textContent?.includes('Ingreso de mercadería'));
    expect(entry?.disabled).toBe(true);
  });

  it('debe mostrar el banner de alerta de reposición si hay productos en stock bajo o agotados', async () => {
    const criticos = posService.productosStockCritico();
    expect(criticos.length).toBe(2); // Papas (3 <= 5) y Agua (0 <= 5)

    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('¡Alerta de Reposición en Almacén!');
    expect(el.textContent).toContain('Papas Lays Clásicas 85g');
  });

  it('debe alternar entre las tres subpestañas correctamente', async () => {
    component.setPosTabByIndex(1);
    expect(component.posSubTab()).toBe('kardex');
    expect(component.posTabIndex()).toBe(1);

    component.setPosTabByIndex(2);
    expect(component.posSubTab()).toBe('historial_ventas');
    expect(component.posTabIndex()).toBe(2);

    component.switchPosSubTab('caja_pos');
    expect(component.posSubTab()).toBe('caja_pos');
  });

  it('navega con toggles Material conservando los paneles reactivos', async () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const tabs = el.querySelectorAll<HTMLButtonElement>('.pos-tabs-nav button');
    tabs[1].click();
    fixture.detectChanges();
    expect(component.posSubTab()).toBe('kardex');
    expect(tabs[1].getAttribute('aria-checked')).toBe('true');
    tabs[2].click();
    fixture.detectChanges();
    expect(component.posSubTab()).toBe('historial_ventas');
    tabs[0].click();
    fixture.detectChanges();
    expect(component.posSubTab()).toBe('caja_pos');
    expect(el.querySelector('.pos-products-grid')).not.toBeNull();
  });

  it('mantiene agregar y favoritos operativos y bloquea productos agotados', async () => {
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const cards = el.querySelectorAll<HTMLElement>('.pos-product-card');
    const add = vi.spyOn(component, 'agregarAlCarritoPOS');
    const available = cards[0].querySelector<HTMLButtonElement>('.pos-add-btn')!;
    expect(available.disabled).toBe(false);
    available.click();
    expect(add).toHaveBeenCalledTimes(1);
    expect(posService.carrito().length).toBe(1);
    cards[0].querySelector<HTMLButtonElement>('.pos-product-favorite-btn')!.click();
    expect(posService.esProductoFavorito(1)).toBe(true);
    expect(add).toHaveBeenCalledTimes(1);
    const exhausted = el.querySelector<HTMLElement>('.is-out-of-stock')!;
    const blocked = exhausted.querySelector<HTMLButtonElement>('.pos-add-btn')!;
    expect(blocked.disabled).toBe(true);
    blocked.click();
    exhausted.click();
    expect(add).toHaveBeenCalledTimes(1);
  });

  it('deshabilita el ingreso desde Kardex cuando no hay productos', async () => {
    posService.productos.set([]);
    component.switchPosSubTab('kardex');
    fixture.detectChanges();
    const entry = fixture.nativeElement.querySelector('.kardex-header-content button') as HTMLButtonElement;
    expect(entry.disabled).toBe(true);
    entry.click();
    expect(component.modalIngresoMercaderiaOpen()).toBe(false);
  });

  it('debe filtrar productos por categoría, búsqueda de texto y favoritos', async () => {
    // 1. Filtrar por búsqueda
    posService.filtroBusqueda.set('Gatorade');
    expect(posService.productosFiltrados().length).toBe(1);
    expect(posService.productosFiltrados()[0].nombre).toContain('Gatorade');

    // 2. Limpiar búsqueda
    posService.filtroBusqueda.set('');
    expect(posService.productosFiltrados().length).toBe(3);

    // 3. Filtrar por categoría (4 = Snacks)
    component.setCategoriaPOS(4);
    expect(posService.productosFiltrados().length).toBe(1);
    expect(posService.productosFiltrados()[0].nombre).toContain('Papas Lays');

    // 4. Filtrar por favoritos
    component.setCategoriaPOS(1); // Todas
    expect(component.esProductoFavoritoPOS(1)).toBe(false);
    component.toggleFavoritoProductoPOS(1, { stopPropagation: async () => {} } as any);
    expect(component.esProductoFavoritoPOS(1)).toBe(true);

    posService.soloFavoritos.set(true);
    expect(posService.productosFiltrados().length).toBe(1);
    expect(posService.productosFiltrados()[0].id).toBe(1);
  });

  it('debe agregar productos al carrito respetando el stock disponible', async () => {
    const prod1 = testProductos[0]; // Stock: 20
    component.agregarAlCarritoPOS(prod1);

    expect(posService.carrito().length).toBe(1);
    expect(posService.carrito()[0].cantidad).toBe(1);
    expect(posService.carrito()[0].subtotal).toBe(6.5);
    expect(posService.totalCarrito()).toBe(6.5);

    // Incrementar cantidad
    component.modificarCantidadCarritoPOS(prod1.id, 1);
    expect(posService.carrito()[0].cantidad).toBe(2);
    expect(posService.carrito()[0].subtotal).toBe(13.0);

    // No permitir agregar producto agotado
    const prodAgotado = testProductos[2]; // Stock: 0
    let toastNotice = '';
    component.notice.subscribe((msg) => (toastNotice = msg));
    component.agregarAlCarritoPOS(prodAgotado);
    expect(toastNotice).toContain('agotado en almacén');
  });

  it('debe calcular correctamente el desglose tributario peruano (Subtotal base 1.18, IGV 18%, Total)', async () => {
    // Agregar 2 unidades de Gatorade (6.50 c/u = 13.00)
    // Agregar 1 unidad de Papas Lays (4.00)
    // Total = S/ 17.00
    posService.agregarAlCarrito(testProductos[0], 2);
    posService.agregarAlCarrito(testProductos[1], 1);

    const total = posService.totalCarrito();
    expect(total).toBe(17.0);

    // Base imponible = Total / 1.18 = 17 / 1.18 = 14.4067... -> 14.41
    const subtotal = posService.subtotalCarrito();
    expect(subtotal).toBe(14.41);

    // IGV 18% = Total - Subtotal = 17 - 14.41 = 2.59
    const igv = posService.igvCarrito();
    expect(igv).toBe(2.59);

    expect(Number((subtotal + igv).toFixed(2))).toBe(total);
  });

  it('debe calcular el estado de pago en efectivo y el vuelto correctamente', async () => {
    posService.agregarAlCarrito(testProductos[0], 2); // Total: S/ 13.00
    component.setMetodoPagoPOS('efectivo');

    // Monto menor al total -> insuficiente
    component.posMontoPagado.set(10.0);
    expect(component.posPagoEstado()).toBe('insuficiente');
    expect(component.posPagoResumenLabel()).toBe('FALTA POR COBRAR:');
    expect(component.posPagoResumenMonto()).toBe(3.0);

    // Monto exacto
    component.setMontoRapidoPOS(13.0);
    expect(component.posPagoEstado()).toBe('exacto');
    expect(component.posPagoResumenLabel()).toBe('PAGO EXACTO:');
    expect(component.posPagoResumenMonto()).toBe(0);

    // Monto mayor -> sobrante / vuelto a entregar
    component.setMontoRapidoPOS(20.0);
    expect(component.posPagoEstado()).toBe('sobrante');
    expect(component.posPagoResumenLabel()).toBe('VUELTO A ENTREGAR:');
    expect(component.posPagoResumenMonto()).toBe(7.0);
  });

  it('debe bloquear el cobro si no hay un turno de caja abierto', async () => {
    posService.agregarAlCarrito(testProductos[0], 1);
    cajaService.sesionActiva.set(null); // Sin turno

    let avisoEmitido = '';
    component.notice.subscribe((msg) => (avisoEmitido = msg));

    await component.procesarCobroPOS();
    expect(avisoEmitido).toContain('Se requiere un turno de caja abierto');
    expect(component.modalTicketVentaOpen()).toBe(false);
  });

  it('waits for the persisted sale and never creates a separate manual cash income', async () => {
    await cajaService.abrirTurno(1, 'Caja Mostrador', 1, 'Titular', 'owner@example.invalid', 200);
    posService.paymentsReady.set(true);
    posService.agregarAlCarrito(testProductos[0], 2);
    component.setMetodoPagoPOS('efectivo');
    component.posMontoPagado.set(20);
    const http = TestBed.inject(HttpTestingController);
    const operation = component.procesarCobroPOS();
    const post = http.expectOne(request => request.url.endsWith('/pos/sales'));
    expect(component.modalTicketVentaOpen()).toBe(false);
    expect(posService.carrito()).toHaveLength(1);
    expect(posService.productos()[0].stock).toBe(20);
    post.flush({ id: 'VNT-1', sedeId: 1, numeroComprobante: 'B001-000001', items: post.request.body.items,
      total: 13, subtotal: 11.02, igv: 1.98, metodoPago: 'efectivo', montoPagado: 20, vuelto: 7,
      clienteNombre: 'Cliente Mostrador', clienteDocumento: '', cajeroNombre: 'Titular',
      tipoComprobante: 'boleta', fecha: new Date().toISOString(), estado: 'completada' });
    await Promise.resolve();
    await Promise.resolve();
    http.match(request => request.method === 'GET').forEach(request => {
      if (request.request.url.includes('/products')) request.flush([{ ...testProductos[0], stock: 18 }]);
      else if (request.request.url.includes('payment-capabilities')) request.flush({ ready: true });
      else request.flush([]);
    });
    await operation;
    http.match(request => request.method === 'GET').forEach(request => request.flush([]));
    expect(component.modalTicketVentaOpen()).toBe(true);
    expect(component.ventaEmitidaSeleccionada()?.id).toBe('VNT-1');
    expect(posService.carrito()).toHaveLength(0);
    expect(posService.productos()[0].stock).toBe(18);
    expect(cajaService.movimientos()).toHaveLength(0);
  });

  it('preserves stock/cart on server rejection and reuses the operation key on retry', async () => {
    await cajaService.abrirTurno(1, 'Caja', 1, 'Titular', 'owner@example.invalid', 0);
    posService.paymentsReady.set(true);
    posService.agregarAlCarrito(testProductos[0], 1);
    component.setMetodoPagoPOS('tarjeta');
    const http = TestBed.inject(HttpTestingController);
    let key = '';
    for (let attempt = 0; attempt < 2; attempt++) {
      const operation = component.procesarCobroPOS();
      const request = http.expectOne(r => r.url.endsWith('/pos/sales'));
      if (!key) key = request.request.body.idempotencyKey;
      expect(request.request.body.idempotencyKey).toBe(key);
      request.flush({ message: 'No guardado' }, { status: 503, statusText: 'Unavailable' });
      await operation;
      expect(component.modalTicketVentaOpen()).toBe(false);
      expect(posService.carrito()).toHaveLength(1);
      expect(posService.productos()[0].stock).toBe(20);
      expect(cajaService.movimientos()).toHaveLength(0);
    }
  });

  it('debe registrar entrada de mercadería (reposición de stock para Kardex +)', async () => {
    const prod = testProductos[0]; // Stock inicial: 20
    component.abrirModalIngresoMercaderia(prod.id);
    expect(component.modalIngresoMercaderiaOpen()).toBe(true);
    expect(component.ingresoProductoId()).toBe(prod.id);

    component.ingresoCantidad.set(10);
    component.ingresoPrecioCompra.set(4.0);
    component.ingresoMotivo.set('Compra a distribuidora autorizada');

    let aviso = '';
    component.notice.subscribe((msg) => (aviso = msg));

    component.confirmarIngresoMercaderia();

    expect(component.modalIngresoMercaderiaOpen()).toBe(false);
    expect(aviso).toContain('Ingreso registrado: +10 unids en Kardex');

    // Stock incrementado a 30
    const prodActualizado = posService.productos().find((p) => p.id === prod.id);
    expect(prodActualizado?.stock).toBe(30);

    // Registro en Kardex con operación '+'
    const mov = posService.kardex()[0];
    expect(mov.tipo).toBe('+');
    expect(mov.cantidad).toBe(10);
    expect(mov.saldoStock).toBe(30);
    expect(mov.motivo).toBe('Compra a distribuidora autorizada');
  });

  it('debe formatear el ticket de venta en texto para su impresión y descarga', async () => {
    const ventaPrueba = {
      id: 'VNT-998877',
      fecha: new Date().toISOString(),
      cajeroNombre: 'Roberto Mendoza',
      clienteNombre: 'Carlos Santana',
      clienteDocumento: '77889900',
      tipoComprobante: 'boleta' as const,
      numeroComprobante: 'B001-000001',
      items: [
        {
          productoId: 1,
          nombre: 'Gatorade Cool Blue 750ml',
          cantidad: 2,
          precioUnitario: 6.5,
          subtotal: 13.0,
        },
      ],
      subtotal: 11.02,
      igv: 1.98,
      total: 13.0,
      metodoPago: 'efectivo' as const,
      montoPagado: 20.0,
      vuelto: 7.0,
      estado: 'completada' as const,
    };

    const texto = component.generarComprobanteTextoPOS(ventaPrueba);
    expect(texto).toContain('CANCHERO SPORT CLUB');
    expect(texto).toContain('BOLETA');
    expect(texto).toContain('B001-000001');
    expect(texto).toContain('Carlos Santana');
    expect(texto).toContain('Gatorade Cool Blue');
    expect(texto).toContain('TOTAL A PAGAR: S/ 13.00');
    expect(texto).toContain('IMPORTE RECIBIDO: S/ 20.00');
    expect(texto).toContain('VUELTO: S/ 7.00');
  });
});
