import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';
import { AdminCaja } from './admin-caja';
import { CajaService } from '@core/services/caja.service';
import { AuthService } from '@core/auth/auth.service';
import { ConfirmationService } from '@shared/components/confirmation/confirmation.service';
import { DatabaseService } from '@core/supabase/database.service';

describe('AdminCaja Component - Etapa 5 (Caja Operativa)', () => {
  let fixture: ComponentFixture<AdminCaja>;
  let component: AdminCaja;
  let cajaService: CajaService;
  const confirm = vi.fn();

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

  beforeEach(async () => {
    localStorage.clear();
    vi.clearAllMocks();
    confirm.mockResolvedValue(true);
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

    await TestBed.configureTestingModule({
      imports: [AdminCaja],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: mockCurrentUser } },
        { provide: DatabaseService, useValue: mockDbService },
        { provide: ConfirmationService, useValue: { confirm } },
      ],
    }).compileComponents();

    cajaService = TestBed.inject(CajaService);
    // Ensure clean state in cajaService
    cajaService.sesionActiva.set(null);
    cajaService.movimientos.set([]);
    cajaService.historialArqueos.set([]);
    cajaService.historialSesiones.set([]);

    fixture = TestBed.createComponent(AdminCaja);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('venueId', 1);
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).match(() => true).forEach(request => request.flush([]));
    await fixture.whenStable();
    await vi.waitFor(() => expect(cajaService.loading()).toBe(false));
    cajaService.cajasRegistradas.set([{ id: 1, nombre: 'Caja de prueba', sedeId: 1 }]);
    fixture.detectChanges();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    localStorage.clear();
    fixture.destroy();
  });

  it('debe crearse correctamente e iniciar con caja cerrada', async () => {
    expect(component).toBeTruthy();
    expect(component.sesionActual()).toBeNull();
    expect(cajaService.tieneSesionActiva()).toBe(false);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('No hay ningún turno abierto actualmente');
    expect(el.textContent).toContain('Caja Cerrada');
  });

  it('debe incluir las 11 denominaciones oficiales del Perú', async () => {
    expect(component.denominaciones.length).toBe(11);
    const valores = component.denominaciones.map((d) => d.valor);
    expect(valores).toContain(200);
    expect(valores).toContain(100);
    expect(valores).toContain(50);
    expect(valores).toContain(20);
    expect(valores).toContain(10);
    expect(valores).toContain(5);
    expect(valores).toContain(2);
    expect(valores).toContain(1);
    expect(valores).toContain(0.5);
    expect(valores).toContain(0.2);
    expect(valores).toContain(0.1);
  });

  it('conserva una sola apertura en el estado cerrado y abre el formulario', async () => {
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.caja-header-actions button')).toBeNull();
    const open = el.querySelector<HTMLButtonElement>('.is-closed-session button')!;
    expect(open.disabled).toBe(false);
    open.click();
    fixture.detectChanges();
    expect(component.modalAperturaCajaOpen()).toBe(true);
  });

  it('navega con toggles Material y bloquea el conteo de ejemplo', async () => {
    const el = fixture.nativeElement as HTMLElement;
    const tabs = el.querySelectorAll<HTMLButtonElement>('.caja-tabs-nav button');
    tabs[1].click();
    fixture.detectChanges();
    expect(component.cajaSubTab()).toBe('arqueo');
    expect(tabs[1].getAttribute('aria-checked')).toBe('true');
    const example = Array.from(el.querySelectorAll('button')).find(button =>
      button.textContent?.includes('Cargar Ejemplo'))!;
    const loadExample = vi.spyOn(component, 'cargarEjemploArqueoEspecificacion');
    expect(example.disabled).toBe(true);
    example.click();
    expect(loadExample).not.toHaveBeenCalled();
    tabs[2].click();
    fixture.detectChanges();
    expect(component.cajaSubTab()).toBe('historial');
    tabs[0].click();
    fixture.detectChanges();
    expect(component.cajaSubTab()).toBe('operacion');
  });

  it('debe abrir un turno con fondo inicial obligatorio', async () => {
    const notices: string[] = [];
    component.notice.subscribe((n) => notices.push(n));

    component.abrirModalAperturaCaja();
    expect(component.modalAperturaCajaOpen()).toBe(true);

    component.aperturaMonto.set(150.0);
    component.aperturaCajero.set('Carlos Cajero');
    await component.confirmarAperturaTurno();

    expect(component.modalAperturaCajaOpen()).toBe(false);
    expect(cajaService.tieneSesionActiva()).toBe(true);
    expect(component.sesionActual()?.montoApertura).toBe(150.0);
    expect(component.sesionActual()?.cajeroNombre).toBe('Carlos Cajero');
    expect(component.cajaSubTab()).toBe('operacion');
    expect(notices.some((n) => n.includes('Turno aperturado'))).toBe(true);

    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('TURNO EN OPERACIÓN ACTIVA');
    expect(el.textContent).toContain('Carlos Cajero');
    expect(el.textContent).toContain('S/ 150.00');
  });

  it('debe rechazar apertura con monto negativo o inválido', async () => {
    const notices: string[] = [];
    component.notice.subscribe((n) => notices.push(n));

    component.abrirModalAperturaCaja();
    component.aperturaMonto.set(-20);
    await component.confirmarAperturaTurno();

    expect(cajaService.tieneSesionActiva()).toBe(false);
    expect(notices).toContain('Ingresa un monto de apertura válido.');
  });

  it('debe registrar movimientos manuales (ingreso y egreso)', async () => {
    const notices: string[] = [];
    component.notice.subscribe((n) => notices.push(n));

    // Abrir turno primero
    await cajaService.abrirTurno(1, 'Caja Principal', 1, 'Roberto Mendoza', 'admin@canchero.pe', 100);

    // 1. Registrar egreso (compra de hielo)
    component.abrirModalMovimiento('egreso');
    expect(component.modalMovimientoCajaOpen()).toBe(true);
    component.movimientoMonto.set(15.0);
    component.movimientoConcepto.set('Compra de hielo para bar');
    component.movimientoAutorizado.set('Supervisor Juan');
    await component.confirmarRegistroMovimiento();

    expect(component.modalMovimientoCajaOpen()).toBe(false);
    expect(cajaService.movimientos().length).toBe(1);
    expect(cajaService.movimientos()[0].tipo).toBe('egreso');
    expect(cajaService.movimientos()[0].monto).toBe(15);
    expect(cajaService.totalEgresosManuales()).toBe(15);

    // 2. Registrar ingreso
    component.abrirModalMovimiento('ingreso');
    component.movimientoMonto.set(30.0);
    component.movimientoConcepto.set('Sencillo extra ingresado');
    await component.confirmarRegistroMovimiento();

    expect(cajaService.movimientos().length).toBe(2);
    expect(cajaService.totalIngresosManuales()).toBe(30);
    expect(cajaService.balanceMovimientosManuales()).toBe(15); // 30 - 15 = +15

    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Compra de hielo para bar');
    expect(el.textContent).toContain('Sencillo extra ingresado');
  });

  it('debe validar que el concepto sea obligatorio al registrar movimiento', async () => {
    const notices: string[] = [];
    component.notice.subscribe((n) => notices.push(n));

    await cajaService.abrirTurno(1, 'Caja Principal', 1, 'Roberto Mendoza', 'admin@canchero.pe', 100);
    component.abrirModalMovimiento('egreso');
    component.movimientoConcepto.set('   ');
    await component.confirmarRegistroMovimiento();

    expect(cajaService.movimientos().length).toBe(0);
    expect(notices).toContain('El concepto o motivo del movimiento es obligatorio.');
  });

  it('debe calcular el monto esperado del sistema según la Fórmula Oficial 5.4', async () => {
    // Monto Sistema = Monto Apertura + ∑ Pagos Efectivo + ∑ Ingresos - ∑ Egresos
    await cajaService.abrirTurno(1, 'Caja Principal', 1, 'Roberto Mendoza', 'admin@canchero.pe', 200);

    await cajaService.registrarMovimiento('ingreso', 50, 'Ingreso prueba', 'Admin');
    await cajaService.registrarMovimiento('egreso', 30, 'Egreso prueba', 'Admin');

    // 200 apertura + 0 pagos efectivo + 50 ingreso - 30 egreso = 220
    expect(component.montoSistemaCalculado()).toBe(220);
  });

  it('debe realizar el arqueo físico y calcular diferencia y estado de balance', async () => {
    await cajaService.abrirTurno(1, 'Caja Principal', 1, 'Roberto Mendoza', 'admin@canchero.pe', 200);

    // Esperado: 200
    // Contamos exactamente 200: 2 billetes de 100 (id 2)
    component.setCantidadDenominacion(2, 2);
    expect(component.totalEfectivoRecontado()).toBe(200);
    expect(component.diferenciaCalculada()).toBe(0);
    expect(component.balanceEstadoCalculado()).toBe('cuadrada');

    // Si contamos 180 (faltante de 20): 1 billete de 100 y 4 de 20
    component.setCantidadDenominacion(2, 1); // 100
    component.setCantidadDenominacion(4, 4); // 80 -> total 180
    expect(component.totalEfectivoRecontado()).toBe(180);
    expect(component.diferenciaCalculada()).toBe(-20);
    expect(component.balanceEstadoCalculado()).toBe('faltante');

    // Si contamos 250 (sobrante de 50): 1 billete de 200 (id 1) y 1 de 50 (id 3)
    component.setCantidadDenominacion(2, 0);
    component.setCantidadDenominacion(4, 0);
    component.setCantidadDenominacion(1, 1); // 200
    component.setCantidadDenominacion(3, 1); // 50 -> total 250
    expect(component.totalEfectivoRecontado()).toBe(250);
    expect(component.diferenciaCalculada()).toBe(50);
    expect(component.balanceEstadoCalculado()).toBe('sobrante');
  });

  it('does not close a cash session when the confirmation is dismissed', async () => {
    await cajaService.abrirTurno(1, 'Caja Principal', 1, 'Titular', 'owner@example.invalid', 0);
    confirm.mockResolvedValueOnce(false);
    await component.ejecutarCierreDeTurno();
    expect(confirm).toHaveBeenCalledOnce();
    expect(cajaService.tieneSesionActiva()).toBe(true);
    expect(cajaService.historialArqueos()).toHaveLength(0);
  });

  it('debe exigir justificación obligatoria en observaciones si la caja está descuadrada', async () => {
    const notices: string[] = [];
    component.notice.subscribe((n) => notices.push(n));

    await cajaService.abrirTurno(1, 'Caja Principal', 1, 'Roberto Mendoza', 'admin@canchero.pe', 200);

    // Conteo con faltante: 150 (diferencia -50)
    component.setCantidadDenominacion(2, 1); // 100
    component.setCantidadDenominacion(3, 1); // 50

    expect(component.balanceEstadoCalculado()).toBe('faltante');

    // Intentar cerrar sin observaciones
    component.arqueoObservaciones.set('');
    await component.ejecutarCierreDeTurno();

    // Debe ser bloqueado
    expect(cajaService.tieneSesionActiva()).toBe(true);
    expect(notices).toContain(
      'Es obligatorio ingresar una justificación en las observaciones por descuadre de caja.'
    );

    // Con observaciones válidas, se permite cerrar
    component.arqueoObservaciones.set('Faltante justificado por cambio entregado erróneamente');
    await component.ejecutarCierreDeTurno();

    expect(cajaService.tieneSesionActiva()).toBe(false);
    expect(cajaService.historialArqueos().length).toBe(1);
    expect(component.modalComprobanteArqueoOpen()).toBe(true);
    expect(component.cajaSubTab()).toBe('historial');
  });

  it('debe cargar el ejemplo oficial de especificación 5.4 (S/ 1,032.00)', async () => {
    component.cargarEjemploArqueoEspecificacion();
    expect(component.totalEfectivoRecontado()).toBe(1032.0);
    expect(component.arqueoCiegoRevelado()).toBe(true);
  });

  it('debe limpiar el conteo de arqueo al llamar a limpiarConteoArqueo', async () => {
    component.cargarEjemploArqueoEspecificacion();
    expect(component.totalEfectivoRecontado()).toBe(1032.0);

    component.limpiarConteoArqueo();
    expect(component.totalEfectivoRecontado()).toBe(0);
    expect(component.arqueoObservaciones()).toBe('');
    expect(component.arqueoCiegoRevelado()).toBe(false);
  });

  it('debe incrementar y decrementar usando los steppers con límite mínimo en 0', async () => {
    component.modificarCantidadDenominacion(1, 1); // +1 billete de 200
    expect(component.conteoCantidades()[1]).toBe(1);
    expect(component.totalEfectivoRecontado()).toBe(200);

    component.modificarCantidadDenominacion(1, -1); // -1 billete
    expect(component.conteoCantidades()[1]).toBe(0);

    component.modificarCantidadDenominacion(1, -1); // no debe bajar de 0
    expect(component.conteoCantidades()[1]).toBe(0);
  });

  it('debe separar pagos digitales sin mezclarlos con el saldo teórico de gaveta', async () => {
    await cajaService.abrirTurno(1, 'Caja Principal', 1, 'Roberto Mendoza', 'admin@canchero.pe', 100);

    // Simulamos un pago digital en la DB (Yape)
    mockDbService.pagos.set([
      {
        id: 1,
        reserva_id: 1,
        metodo_pago: 'Yape',
        monto: 80,
        fecha_pago: new Date().toISOString(),
      },
    ]);
    mockDbService.reservas.set([
      { id: 1, cancha_id: 10 },
    ]);

    // Pagos digitales no incrementan montoSistemaEsperado (solo pagos en efectivo lo harían)
    cajaService.serverBalance.set({ sesionId: 10, pagosDigital: 80, pagosEfectivo: 0, montoSistema: 100 });
    expect(cajaService.pagosDigitalesTurno()).toBe(80);
    expect(cajaService.pagosEfectivoTurno()).toBe(0);
    expect(component.montoSistemaCalculado()).toBe(100); // 100 apertura + 0 efectivo
  });
});
