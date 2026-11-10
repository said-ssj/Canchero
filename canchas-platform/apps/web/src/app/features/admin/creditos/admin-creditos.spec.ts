import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';

import { AdminCreditos } from './admin-creditos';
import { CreditService } from '@core/services/credit.service';
import { CajaService } from '@core/services/caja.service';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import type { CuentaPorCobrar } from '@shared/models/credit.model';

describe('AdminCreditos Component - Cuentas por Cobrar & Fiados', () => {
  let fixture: ComponentFixture<AdminCreditos>;
  let component: AdminCreditos;
  let creditService: CreditService;
  let cajaService: CajaService;

  const mockCurrentUser = signal({
    id: 'owner-uuid-1',
    email: 'admin@canchero.pe',
    nombre: 'Roberto Mendoza',
    rol: 'dueno',
  });

  const mockDbService = {
    sedeOperativaId: signal<number | null>(1),
    getSedesPorDueno: vi.fn(() => [{ id: 1, nombre: 'Sede Central Miraflores' }]),
    getSedeOperativaId: vi.fn(() => 1),
    getCanchasPorSede: vi.fn(() => [{ id: 10, id_sede: 1, nombre: 'Cancha 1' }]),
    reservas: signal<any[]>([]),
  };

  const testCuentas: CuentaPorCobrar[] = [
    {
      id: 1,
      sedeId: 1,
      clienteNombre: 'Carlos Mendoza',
      clienteDocumento: '45892147',
      telefono: '987654321',
      equipo: 'Los Galácticos FC',
      montoOriginal: 250.0,
      saldo: 120.0,
      totalAbonado: 130.0,
      concepto: 'Consumo cantina: 12 Gatorades + 6 aguas',
      fechaEmision: '2026-11-05T19:30:00Z',
      fechaVencimiento: '2026-11-15',
      estado: 'PENDIENTE',
      abonos: [
        {
          id: 101,
          cuentaId: 1,
          sesionCajaId: 1,
          fecha: '2026-11-06T20:00:00Z',
          monto: 130.0,
          medioPago: 'yape',
          nroOperacion: '198273',
          observacion: 'Abono inicial',
          cajeroNombre: 'Roberto Mendoza',
        },
      ],
    },
    {
      id: 2,
      sedeId: 1,
      clienteNombre: 'Prof. Miguel Ramos',
      clienteDocumento: '10234567',
      telefono: '912345678',
      equipo: 'Academia Cantolao',
      montoOriginal: 450.0,
      saldo: 450.0,
      totalAbonado: 0.0,
      concepto: 'Alquiler mensual formativo',
      fechaEmision: '2026-11-01T16:00:00Z',
      fechaVencimiento: '2026-11-20',
      estado: 'PENDIENTE',
      abonos: [],
    },
    {
      id: 3,
      sedeId: 1,
      clienteNombre: 'Jorge Bazán',
      clienteDocumento: '43981256',
      telefono: '998877665',
      equipo: 'Deportivo Rímac',
      montoOriginal: 180.0,
      saldo: 180.0,
      totalAbonado: 0.0,
      concepto: 'Consumo bar semifinal',
      fechaEmision: '2026-10-25T22:15:00Z',
      fechaVencimiento: '2026-11-02',
      estado: 'VENCIDA',
      abonos: [],
    },
  ];

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(CajaService.prototype as any, 'setupRealtimeSubscriptions').mockImplementation(
      async () => {},
    );

    await TestBed.configureTestingModule({
      imports: [AdminCreditos],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: mockCurrentUser } },
        { provide: DatabaseService, useValue: mockDbService },
      ],
    }).compileComponents();

    creditService = TestBed.inject(CreditService);
    cajaService = TestBed.inject(CajaService);

    creditService.cuentas.set([...testCuentas]);
    creditService.resumen.set({
      totalPorCobrar: 750.0,
      totalVencido: 180.0,
      totalCobradoMes: 130.0,
      clientesDeudores: 3,
      cuentasVencidas: 1,
    });
    creditService.filtroEstado.set('TODOS');
    creditService.busqueda.set('');

    fixture = TestBed.createComponent(AdminCreditos);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('venueId', 1);
    fixture.detectChanges();

    const httpMock = TestBed.inject(HttpTestingController);
    const summaryReqs = httpMock.match((r) => r.url.includes('/credits/summary'));
    summaryReqs.forEach((r) =>
      r.flush({
        totalPorCobrar: 750.0,
        totalVencido: 180.0,
        totalCobradoMes: 130.0,
        clientesDeudores: 3,
        cuentasVencidas: 1,
      }),
    );
    const listReqs = httpMock.match((r) => r.url.includes('/credits'));
    listReqs.forEach((r) => r.flush([...testCuentas]));

    creditService.loading.set(false);
    fixture.detectChanges();

    await fixture.whenStable();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fixture.destroy();
  });

  it('debe crearse correctamente y listar las cuentas de crédito iniciales', () => {
    expect(component).toBeTruthy();
    expect(creditService.cuentas().length).toBe(3);

    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('Créditos y cuentas por cobrar');
    expect(el.textContent).toContain('Carlos Mendoza');
    expect(el.textContent).toContain('Los Galácticos FC');
  });

  it('debe filtrar cuentas por estado (PENDIENTE, VENCIDA, CANCELADA)', () => {
    component.setFiltro('VENCIDA');
    fixture.detectChanges();

    const filtradas = creditService.cuentasFiltradas();
    expect(filtradas.length).toBe(1);
    expect(filtradas[0].clienteNombre).toBe('Jorge Bazán');
    expect(filtradas[0].estado).toBe('VENCIDA');
  });

  it('debe abrir modal de abono y prellenar con saldo restante', () => {
    const cuenta = testCuentas[0];
    component.abrirModalAbono(cuenta);

    expect(component.modalAbonoOpen()).toBe(true);
    expect(component.cuentaSeleccionada()?.id).toBe(cuenta.id);
    expect(component.abonoMonto()).toBe(120.0);
  });

  it('debe emitir aviso si el monto del abono excede el saldo restante', async () => {
    let aviso = '';
    component.notice.subscribe((msg) => (aviso = msg));

    const cuenta = testCuentas[0];
    component.abrirModalAbono(cuenta);
    component.abonoMonto.set(200.0); // Excede 120.0

    await component.confirmarAbono();

    expect(aviso).toContain('no puede exceder el saldo');
    expect(component.modalAbonoOpen()).toBe(true);
  });

  it('debe registrar abono válido y actualizar saldo en la lista', async () => {
    let aviso = '';
    component.notice.subscribe((msg) => (aviso = msg));

    const cuenta = testCuentas[0];
    vi.spyOn(creditService, 'registrarAbono').mockImplementation(async (cuentaId, req) => {
      const c = creditService.cuentas().find((x) => x.id === cuentaId)!;
      const nuevoSaldo = c.saldo - req.monto;
      const nuevoAbonado = c.totalAbonado + req.monto;
      const updated: CuentaPorCobrar = {
        ...c,
        saldo: nuevoSaldo,
        totalAbonado: nuevoAbonado,
        estado: nuevoSaldo <= 0 ? 'CANCELADA' : c.estado,
        abonos: [
          ...c.abonos,
          {
            id: Date.now(),
            cuentaId,
            sesionCajaId: 1,
            fecha: new Date().toISOString(),
            monto: req.monto,
            medioPago: req.medioPago,
            nroOperacion: req.nroOperacion,
            observacion: req.observacion,
            cajeroNombre: 'Roberto Mendoza',
          },
        ],
      };
      creditService.cuentas.update((list) => list.map((item) => (item.id === cuentaId ? updated : item)));
      return updated;
    });

    component.abrirModalAbono(cuenta);
    component.abonoMonto.set(50.0);
    component.abonoMedio.set('yape');

    await component.confirmarAbono();

    expect(component.modalAbonoOpen()).toBe(false);
    expect(aviso).toContain('Abono de S/ 50.00 registrado');

    const cuentaActualizada = creditService.cuentas().find((c) => c.id === cuenta.id);
    expect(cuentaActualizada?.saldo).toBe(70.0);
    expect(cuentaActualizada?.totalAbonado).toBe(180.0);
  });

  it('debe abrir modal de nueva cuenta y registrar fiado correctamente', async () => {
    let aviso = '';
    component.notice.subscribe((msg) => (aviso = msg));

    vi.spyOn(creditService, 'crearCuenta').mockImplementation(async (req) => {
      const nueva: CuentaPorCobrar = {
        id: 99,
        sedeId: req.sedeId,
        clienteNombre: req.clienteNombre,
        clienteDocumento: req.clienteDocumento || '',
        telefono: req.telefono || '',
        equipo: req.equipo || '',
        montoOriginal: req.montoOriginal,
        saldo: req.montoOriginal,
        totalAbonado: 0,
        concepto: req.concepto,
        fechaEmision: new Date().toISOString(),
        fechaVencimiento: req.fechaVencimiento || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0],
        estado: 'PENDIENTE',
        abonos: [],
      };
      creditService.cuentas.update((list) => [nueva, ...list]);
      return nueva;
    });

    component.abrirModalNuevaCuenta();
    expect(component.modalNuevaCuentaOpen()).toBe(true);

    component.nuevoCliente.set('Yoshimar Yotún');
    component.nuevoEquipo.set('Sporting Cristal');
    component.nuevoMonto.set(150.0);
    component.nuevoConcepto.set('Alquiler de cancha y balones');

    await component.confirmarNuevaCuenta();

    expect(component.modalNuevaCuentaOpen()).toBe(false);
    expect(aviso).toContain('Cuenta creada exitosamente para Yoshimar Yotún');

    const nueva = creditService.cuentas().find((c) => c.clienteNombre === 'Yoshimar Yotún');
    expect(nueva).toBeDefined();
    expect(nueva?.saldo).toBe(150.0);
    expect(nueva?.montoOriginal).toBe(150.0);
  });
});
