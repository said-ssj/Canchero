import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi, describe, beforeEach, afterEach, it, expect } from 'vitest';
import { AdminFinanzas } from './admin-finanzas';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';

describe('AdminFinanzas Component - Etapa 7 (Finanzas y Liquidación)', () => {
  let fixture: ComponentFixture<AdminFinanzas>;
  let component: AdminFinanzas;

  const mockCurrentUser = signal<{ id: string; email: string; nombre: string; rol: string } | null>({
    id: 'owner-uuid',
    email: 'dueno@canchero.pe',
    nombre: 'Dueño Oficial',
    rol: 'dueno',
  });

  const mockSedes = [
    { id: 1, id_dueno: 1, nombre: 'Sede Principal Surco' },
    { id: 2, id_dueno: 1, nombre: 'Sede San Borja' },
  ];

  const mockCanchas = [
    { id: 101, id_sede: 1, nombre: 'Cancha Fútbol 7' },
    { id: 102, id_sede: 1, nombre: 'Cancha Fútbol 5' },
    { id: 201, id_sede: 2, nombre: 'Cancha San Borja A' },
  ];

  const mockReservas = [
    {
      id: 1001,
      cancha_id: 101,
      codigo_pase: '#CAN-1001',
      fecha: '2026-09-10',
      hora_inicio: '18:00',
      hora_fin: '19:00',
    },
    {
      id: 1002,
      cancha_id: 102,
      codigo_pase: '#CAN-1002',
      fecha: '2026-09-11',
      hora_inicio: '20:00',
      hora_fin: '21:00',
    },
    {
      id: 2001,
      cancha_id: 201,
      codigo_pase: '#CAN-2001',
      fecha: '2026-09-12',
      hora_inicio: '19:00',
      hora_fin: '20:00',
    },
  ];

  const mockPagos = [
    {
      id: 501,
      reserva_id: 1001,
      monto: 100, // Bruto 100 -> Comision 5 (5%), Neto 95 (95%)
      comision_plataforma: 5,
      monto_neto_dueno: 95,
      metodo_pago: 'Yape',
      estado_liquidacion: 'transferido',
      fecha_pago: '2026-09-10',
    },
    {
      id: 502,
      reserva_id: 1002,
      monto: 200, // Bruto 200 -> Comision 10 (5%), Neto 190 (95%)
      comision_plataforma: 10,
      monto_neto_dueno: 190,
      metodo_pago: 'Tarjeta Débito',
      estado_liquidacion: 'pendiente',
      fecha_pago: '2026-09-11',
    },
    {
      id: 503,
      reserva_id: 2001,
      monto: 150, // Sede 2
      comision_plataforma: 7.5,
      monto_neto_dueno: 142.5,
      metodo_pago: 'Plin',
      estado_liquidacion: 'transferido',
      fecha_pago: '2026-09-12',
    },
  ];

  const mockDbService = {
    usuarios: signal<any[]>([{ id: 1, email: 'dueno@canchero.pe', rol: 'dueno' }]),
    getSedesPorDueno: vi.fn(() => mockSedes),
    getCanchasPorDueno: vi.fn(() => mockCanchas),
    reservas: signal<any[]>(mockReservas),
    getPagosPorDueno: vi.fn(() => mockPagos),
    refreshCatalogo: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminFinanzas],
      providers: [
        provideRouter([]),
        { provide: DatabaseService, useValue: mockDbService },
        { provide: AuthService, useValue: { currentUser: mockCurrentUser } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminFinanzas);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('debe crearse e inicializarse correctamente', () => {
    expect(component).toBeTruthy();
  });

  it('deshabilita operaciones pendientes sin emitir avisos ni abrir devoluciones', () => {
    const notice = vi.fn();
    component.notice.subscribe(notice);
    const root = fixture.nativeElement as HTMLElement;
    const pending = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(button =>
      /Consultar periodo|Revisar devolución|Solicitar liquidación/.test(button.textContent ?? '')
    );
    expect(pending).toHaveLength(3);
    for (const button of pending) {
      expect(button.disabled).toBe(true);
      button.click();
    }
    expect(component['reembolsoModalOpen']()).toBe(false);
    expect(notice).not.toHaveBeenCalled();
    expect(root.querySelector<HTMLAnchorElement>('.config-link')?.getAttribute('href')).toBe('/admin/configuracion');
  });

  it('mantiene filtros reales y deshabilita exportación cuando no hay resultados', () => {
    component['buscarFacturables']('sin coincidencias');
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const exportButton = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button =>
      button.textContent?.includes('Exportar CSV')
    );
    expect(exportButton?.disabled).toBe(true);
    expect(component['facturablesFiltrados']()).toHaveLength(0);
    component['buscarFacturables']('');
    fixture.detectChanges();
    expect(exportButton?.disabled).toBe(false);
  });

  it('calcula métricas de comisión al 5% y neto al 95% para todos los pagos del dueño', () => {
    // Total Bruto: 100 + 200 + 150 = 450
    // Total Comisión (5%): 5 + 10 + 7.5 = 22.5
    // Total Neto (95%): 95 + 190 + 142.5 = 427.5
    // Liquidado (transferido): 95 + 142.5 = 237.5
    const m = component['metricas']();
    expect(m.ingresoBruto).toBe(300);
    expect(m.comisionApp).toBe(15);
    expect(m.ingresoNeto).toBe(285);
    expect(m.totalLiquidado).toBe(95);
    expect(m.liquidacionesPendientes).toBe(1);
  });

  it('aísla los cobros y métricas cuando se proporciona venueId', () => {
    // Sede 1 solo tiene Canchas 101 y 102 (Pagos 501 y 502)
    fixture.componentRef.setInput('venueId', 1);
    fixture.detectChanges();

    const rows = component['facturables']();
    expect(rows.length).toBe(2);
    expect(rows.some((r) => r.codigo === '#CAN-2001')).toBe(false);

    const m = component['metricas']();
    expect(m.ingresoBruto).toBe(300); // 100 + 200
    expect(m.comisionApp).toBe(15); // 5% de 300
    expect(m.ingresoNeto).toBe(285); // 95% de 300
  });

  it('permite cambiar de período contable y emite notificación', () => {
    const noticeSpy = vi.fn();
    component.notice.subscribe(noticeSpy);

    component['seleccionarPeriodoFinanzas']('07 Sep - 13 Sep 2026', 'Esta Semana', 'Semanal');
    expect(component['periodoTag']()).toBe('Semanal');
    const range = component['periodoRango']()!;
    expect(component['periodoActual']()).toBe(range.from + ' - ' + range.to);
    expect(noticeSpy).toHaveBeenCalledWith('Período financiero seleccionado: Esta Semana');
  });

  it('filtra cobros por estado (all, pendiente, liquidado)', () => {
    expect(component['facturablesPendientesCount']()).toBe(1);
    expect(component['facturablesLiquidadosCount']()).toBe(1);

    component['filtrarFacturables']('pendiente');
    expect(component['facturablesFiltrados']().length).toBe(1);
    expect(component['facturablesFiltrados']()[0].codigo).toBe('#CAN-1002');

    component['filtrarFacturables']('liquidado');
    expect(component['facturablesFiltrados']().length).toBe(1);
  });

  it('busca cobros por texto (código o método)', () => {
    component['buscarFacturables']('CAN-1001');
    expect(component['facturablesFiltrados']().length).toBe(1);
    expect(component['facturablesFiltrados']()[0].codigo).toBe('#CAN-1001');

    component['buscarFacturables']('inexistente');
    expect(component['facturablesFiltrados']().length).toBe(0);
  });

  it('filtra por cancha específica', () => {
    component['filtrarFacturablesPorCancha']('Cancha Fútbol 7');
    expect(component['facturablesFiltrados']().length).toBe(1);
    expect(component['facturablesFiltrados']()[0].canchaNombre).toBe('Cancha Fútbol 7');
  });

  it('abre y cierra el modal de detalle de cobro con desglose completo', () => {
    component['verDetalleFacturable']('#CAN-1001');
    expect(component['detalleModalOpen']()).toBe(true);
    expect(component['detalleFacturable']()?.monto).toBe(100);
    expect(component['detalleFacturable']()?.comision).toBe(5);
    expect(component['detalleFacturable']()?.neto).toBe(95);

    component['cerrarDetalleModal']();
    expect(component['detalleModalOpen']()).toBe(false);
    expect(component['detalleFacturable']()).toBeNull();
  });

  it('abre y cierra el modal de configuración de columnas y alterna visibilidad', () => {
    component['abrirColumnasAvanzadas']();
    expect(component['columnasModalOpen']()).toBe(true);

    component['toggleColumna']('comision');
    expect(component['columnas']().comision).toBe(false);

    component['cerrarColumnasAvanzadas']();
    expect(component['columnasModalOpen']()).toBe(false);
  });

  it('exporta reporte financiero en CSV con descarga real y emite notificación', () => {
    const noticeSpy = vi.fn();
    component.notice.subscribe(noticeSpy);

    // Mock click and revokeObjectURL
    const clickSpy = vi.fn();
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-url');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      click: clickSpy,
      set href(_v: string) {},
      set download(_v: string) {},
    } as any);

    component['exportarReporteFinanciero']();

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:test-url');
    expect(noticeSpy).toHaveBeenCalledWith(expect.stringContaining('Reporte financiero exportado'));

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    createElementSpy.mockRestore();
  });

  it('solicita adelanto o soporte y emite aviso al dueño', () => {
    const noticeSpy = vi.fn();
    component.notice.subscribe(noticeSpy);

    component['solicitarAdelantoLiquidacion']();
    expect(noticeSpy).toHaveBeenCalledWith(expect.stringContaining('aun no esta disponible'));
  });

  it('muestra el estado de carga (skeleton) cuando loading es true', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const skeleton = compiled.querySelector('.finanzas-skeleton-container');
    expect(skeleton).toBeTruthy();
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
  });

  it('muestra el estado de error cuando error es proporcionado', () => {
    fixture.componentRef.setInput('error', 'Fallo de conexión a Supabase');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorBanner = compiled.querySelector('.finanzas-error-banner');
    expect(errorBanner).toBeTruthy();
    expect(errorBanner?.textContent).toContain('Fallo de conexión a Supabase');
  });
});
