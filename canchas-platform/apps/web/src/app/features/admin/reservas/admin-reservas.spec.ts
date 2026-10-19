import { signal } from '@angular/core';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import { CajaService } from '@core/services/caja.service';
import { TestBed, ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { AdminReservas } from './admin-reservas';
import type { AdminReservationRow, CourtOption, NuevaReservaPresencialInput } from './admin-reservas.models';
import {
  addCalendarDays,
  addHoursToTime,
  calculateBookingPrice,
  isTimeOverlap,
  limaDate,
  minutesToTimeString,
  reservationCsv,
  timeStringToMinutes,
} from './admin-reservas.utils';

function row(
  id: number,
  courtId = 1,
  date = '2026-10-14',
  state: AdminReservationRow['estado'] = 'pendiente',
  overrides: Partial<AdminReservationRow> = {},
): AdminReservationRow {
  return {
    reserva: {
      id,
      cancha_id: courtId,
      usuario_id: 7,
      fecha: date,
      hora_inicio: '10:00',
      hora_fin: '12:00',
      estado: state,
      codigo_pase: `#CAN-${id}`,
      creado_en: '',
      actualizado_en: '',
    },
    codigoPase: `#CAN-${id}`,
    codigoCorto: `CAN-${id}`,
    horario: '10:00 - 12:00',
    fechaLabel: date,
    canchaNombre: 'Cancha igual',
    canchaTag1: 'Fútbol',
    canchaTag2: 'Grass',
    jugadorNombre: 'Ana Perez',
    telefono: '999111222',
    iniciales: 'AP',
    estado: state,
    monto: 50,
    montoTotal: 100,
    adelanto: 50,
    saldo: 50,
    esClienteSinCuenta: false,
    checkInRealizado: false,
    metodo: 'Efectivo',
    metodoIcon: 'payments',
    operacion: '',
    waLink: '',
    ...overrides,
  };
}

const mockCourts: CourtOption[] = [
  { id: 1, nombre: 'Cancha 1 (Fútbol 7)', precio_hora: 80, precio_hora_noche: 100, hora_inicio_noche: '18:00' },
  { id: 2, nombre: 'Cancha 2 (Fútbol 5)', precio_hora: 60, precio_hora_noche: 80, hora_inicio_noche: '19:00' },
];

describe('AdminReservas', () => {
  let fixture: ComponentFixture<AdminReservas>;
  let component: AdminReservas;
  const records = [row(1), row(2, 2), row(3, 9)];
  const approve = vi.fn();
  const reject = vi.fn();
  const refreshCatalogo = vi.fn();
  beforeEach(async () => {
    vi.resetAllMocks();
    approve.mockResolvedValue(undefined);
    reject.mockResolvedValue(undefined);
    await TestBed.configureTestingModule({
      imports: [AdminReservas],
      providers: [
        { provide: DatabaseService, useValue: {
          catalogLoading: signal(false), loadErrors: signal([]), refreshCatalogo,
          aprobarReserva: approve, descartarReserva: reject,
        } },
        { provide: AuthService, useValue: { currentUser: signal(null) } },
        { provide: CajaService, useValue: {} },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AdminReservas);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('rows', records);
    fixture.componentRef.setInput('courts', mockCourts);
    fixture.componentRef.setInput('venueId', 10);
    fixture.componentRef.setInput('venueName', 'Sede de prueba');
    fixture.componentRef.setInput('minimumDepositPercent', 50);
    fixture.detectChanges();
    component.today.set('2026-10-14');
  });
  afterEach(() => { fixture.destroy(); vi.restoreAllMocks(); });

  it('isolates rows by court ID even when venue data contains foreign rows', () => {
    expect(component.scopedRows().map(r => r.reserva.id)).toEqual([1, 2]);
    component.selectCourt(2);
    expect(component.filteredRows().map(r => r.reserva.id)).toEqual([2]);
    fixture.componentRef.setInput('venueId', null);
    fixture.detectChanges();
    expect(component.scopedRows()).toEqual([]);
  });
  it('filters seven calendar days without including the past or following week', () => {
    fixture.componentRef.setInput('rows', [row(1, 1, '2026-10-13'), row(2), row(3, 1, '2026-10-20'), row(4, 1, '2026-10-21')]);
    component.filter.set('semana');
    expect(component.filteredRows().map(r => r.reserva.id)).toEqual([2, 3]);
  });
  it('closes details and resets filters when changing venue', () => {
    component.search('Ana');
    component.openDetails(records[0]);
    expect(document.querySelector('mat-dialog-container')).not.toBeNull();
    fixture.componentRef.setInput('venueId', 20);
    fixture.componentRef.setInput('courts', [{ id: 9, nombre: 'Otra cancha' }]);
    fixture.detectChanges();
    expect(component.query()).toBe('');
    expect(component.selected()).toBeNull();
    expect(component.scopedRows().map(r => r.reserva.id)).toEqual([3]);
  });
  it('shows loading, error and empty states exclusively', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    fixture.componentRef.setInput('loading', false);
    fixture.componentRef.setInput('error', 'Sin conexion');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('Sin conexion');
    expect(fixture.nativeElement.querySelector('table')).toBeNull();
    fixture.componentRef.setInput('error', '');
    fixture.componentRef.setInput('rows', []);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No hay reservas');
  });
  it('reloads data instead of only emitting an unhandled route output', () => {
    component.reload();
    expect(refreshCatalogo).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('loading', true);
    component.reload();
    expect(refreshCatalogo).toHaveBeenCalledTimes(1);
  });
  it('waits for the server and prevents duplicate approval requests', async () => {
    let finish!: () => void;
    approve.mockReturnValueOnce(new Promise<void>(resolve => { finish = resolve; }));
    const notice = vi.spyOn(component.notice, 'emit');
    const pending = component.requestAction('approve', records[0]);
    expect(notice).not.toHaveBeenCalled();
    await component.requestAction('approve', records[0]);
    expect(approve).toHaveBeenCalledTimes(1);
    finish();
    await pending;
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('aprobada'));
  });
  it('reports a server failure without closing details or reporting success', async () => {
    approve.mockRejectedValueOnce(new Error('offline'));
    const action = vi.spyOn(component.action, 'emit');
    const notice = vi.spyOn(component.notice, 'emit');
    component.openDetails(records[0]);
    await component.requestAction('approve', records[0]);
    expect(action).not.toHaveBeenCalled();
    expect(notice).toHaveBeenCalledWith(expect.stringContaining('No se pudo'));
    expect(component.guardando()).toBe(false);
    expect(document.querySelector('mat-dialog-container')).not.toBeNull();
  });
  it('does not approve foreign, nonpending or stale rows', async () => {
    await component.requestAction('approve', records[2]);
    await component.requestAction('approve', row(1));
    expect(approve).not.toHaveBeenCalled();
  });
  it('keeps incomplete financial operations disabled and emits no fake transaction', () => {
    const button = Array.from(fixture.nativeElement.querySelectorAll('button')).find((el: any) => el.textContent.includes('Reserva presencial')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    const created = vi.spyOn(component.createBooking, 'emit');
    const action = vi.spyOn(component.action, 'emit');
    component.bookingCourtId.set(1);
    component.bookingNombreCliente.set('Cliente de prueba');
    component.bookingTelefonoCliente.set('999111222');
    component.submitBooking();
    component.selected.set(records[0]);
    component.confirmCollectBalance();
    component.confirmCheckIn(records[0]);
    component.confirmCancelReservation();
    expect(created).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });
  it('downloads a CSV only when matching data is available', () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    component.exportCsv();
    expect(click).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('error', 'offline');
    component.exportCsv();
    expect(click).toHaveBeenCalledTimes(1);
  });
});

describe('Reservation export and calendar helpers', () => {
  it('uses the Lima date at the UTC day boundary', () => {
    expect(limaDate(new Date('2026-10-15T02:00:00Z'))).toBe('2026-10-14');
    expect(addCalendarDays('2026-12-29', 6)).toBe('2027-01-04');
  });

  it('computes time conversions and adds consecutive hours correctly', () => {
    expect(timeStringToMinutes('18:30')).toBe(1110);
    expect(minutesToTimeString(1110)).toBe('18:30');
    expect(addHoursToTime('17:00', 3)).toBe('20:00');
    expect(addHoursToTime('23:00', 2)).toBe('01:00');
  });

  it('accurately detects time overlaps between slots', () => {
    expect(isTimeOverlap('10:00', '12:00', '11:00', '13:00')).toBe(true);
    expect(isTimeOverlap('10:00', '12:00', '12:00', '14:00')).toBe(false); // contiguous, no overlap
    expect(isTimeOverlap('12:00', '14:00', '10:00', '12:00')).toBe(false);
    expect(isTimeOverlap('09:00', '13:00', '10:00', '11:00')).toBe(true);
  });

  it('calculates booking price combining diurnal and nocturnal tranches', () => {
    const court: CourtOption = {
      id: 1,
      nombre: 'Cancha Test',
      precio_hora: 70,
      precio_hora_noche: 90,
      hora_inicio_noche: '18:00',
    };
    // 16:00 to 19:00 (3 hours): 16-17 (70), 17-18 (70), 18-19 (90) = 230
    const calc = calculateBookingPrice(court, '16:00', 3);
    expect(calc.total).toBe(230);
    expect(calc.breakdown).toHaveLength(3);
    expect(calc.breakdown[0]).toEqual({ tranche: '16:00 - 17:00', price: 70, isNight: false });
    expect(calc.breakdown[1]).toEqual({ tranche: '17:00 - 18:00', price: 70, isNight: false });
    expect(calc.breakdown[2]).toEqual({ tranche: '18:00 - 19:00', price: 90, isNight: true });
  });

  it('escapes quotes, newlines and spreadsheet formulas in CSV', () => {
    const csv = reservationCsv([
      row(1, 1, '2026-10-14', 'pendiente', {
        jugadorNombre: '=1+1',
        canchaNombre: 'A "B", C\nD',
        esClienteSinCuenta: true,
      }),
    ]);
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"A ""B"", C\nD"');
    expect(csv).toContain('"Presencial (Sin cuenta)"');
    expect(csv).toContain('"50"');
  });
});
