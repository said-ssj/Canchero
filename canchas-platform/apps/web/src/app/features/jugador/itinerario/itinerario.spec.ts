import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Itinerario } from './itinerario';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import { ConfirmationService } from '@shared/components/confirmation/confirmation.service';
import type { User } from '@shared/models/user.model';
import type { Booking } from '@shared/models/booking.model';

describe('Itinerario Component - Fase 6: Mi Itinerario Privado', () => {
  let fixture: ComponentFixture<Itinerario>;
  let component: Itinerario;

  const isLoggedInSignal = signal(false);
  const currentUserSignal = signal<User | null>(null);
  const confirm = vi.fn();

  const mockVenuesPublicos = [
    {
      id: 'venue-10',
      nombre: 'Complejo Deportivo Norte',
      fotos: ['https://example.com/venue-norte.jpg'],
      canchas: [],
    },
  ];

  const sampleBookingsServer = [
    {
      id: '101',
      id_reserva: 101,
      codigoPase: 'CAN-101-PASE',
      courtName: 'Cancha 1 Sintética',
      courtId: 'court-101',
      venueName: 'Complejo Deportivo Norte',
      venueId: 'venue-10',
      fecha: '2026-11-20', // Futura
      horario: '19:00 - 20:00',
      total: 120,
      status: 'Confirmada',
      paymentStatus: 'aprobado',
      paidAmount: 120,
      balanceAmount: 0,
      paymentMethod: 'Tarjeta',
      paymentOperationNumber: 'OP-12345678',
      jugadores: ['Renato Tapia', 'Paolo Guerrero'],
    },
    {
      id: '102',
      id_reserva: 102,
      codigoPase: 'CAN-102-PASE',
      courtName: 'Cancha 2 Techada',
      courtId: 'court-102',
      venueName: 'Complejo Deportivo Norte',
      venueId: 'venue-10',
      fecha: '2026-01-10', // Pasada
      horario: '18:00 - 19:00',
      total: 90,
      status: 'Finalizada',
      paymentStatus: 'aprobado',
      paidAmount: 90,
      balanceAmount: 0,
      paymentMethod: 'Tarjeta',
      paymentOperationNumber: 'OP-87654321',
      jugadores: ['Renato Tapia'],
    },
  ];

  const mockDatabaseService = {
    fetchMyBookings: vi.fn(),
    cancelPlayerBooking: vi.fn(),
    getVenuesPublicos: vi.fn(() => mockVenuesPublicos as any),
  };

  const mockAuthService = {
    isLoggedIn: isLoggedInSignal,
    currentUser: currentUserSignal,
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    confirm.mockResolvedValue(true);
    isLoggedInSignal.set(false);
    currentUserSignal.set(null);

    mockDatabaseService.fetchMyBookings.mockResolvedValue(sampleBookingsServer);
    mockDatabaseService.cancelPlayerBooking.mockResolvedValue({ id: 101, estado: 'Cancelada' });
    mockDatabaseService.getVenuesPublicos.mockReturnValue(mockVenuesPublicos as any);

    await TestBed.configureTestingModule({
      imports: [Itinerario],
      providers: [
        provideRouter([]),
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ConfirmationService, useValue: { confirm } },
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(Itinerario);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('Caso 1: Usuario no autenticado no consulta el servidor y muestra mensaje de inicio de sesión', () => {
    isLoggedInSignal.set(false);
    currentUserSignal.set(null);
    createComponent();

    expect(component['isLoggedIn']()).toBe(false);
    expect(mockDatabaseService.fetchMyBookings).not.toHaveBeenCalled();
    expect(component['serverBookings']().length).toBe(0);
    expect(fixture.nativeElement.textContent).toContain('Inicia sesión para ver tu itinerario');
  });

  it('Caso 2: Usuario autenticado carga sus reservas reales con desglose financiero exacto', async () => {
    isLoggedInSignal.set(true);
    currentUserSignal.set({
      id: 'usr-real-42',
      id_usuario: 'usr-real-42',
      nombre: 'Renato Tapia',
      email: 'renato.tapia@seleccion.pe',
      rol: 'cliente',
    } as User);
    createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(mockDatabaseService.fetchMyBookings).toHaveBeenCalledTimes(1);
    const bookings = component['serverBookings']();
    expect(bookings.length).toBe(2);

    const b1 = bookings[0];
    expect(b1.id).toBe('101');
    expect(b1.codigoPase).toBe('CAN-101-PASE');
    expect(b1.courtName).toBe('Cancha 1 Sintética');
    expect(b1.total).toBe(120);
    expect(b1.paidAmount).toBe(120);
    expect(b1.balanceAmount).toBe(0);
    expect(b1.paymentMethod).toBe('Tarjeta');
    expect(b1.paymentOperationNumber).toBe('OP-12345678');
    expect(b1.status).toBe('CONFIRMADO');

    // Comprobamos formato financiero
    expect(component['fmtTotal'](b1)).toBe('S/. 120.00');
    expect(component['fmtPaid'](b1)).toBe('S/. 120.00');
    expect(component['fmtBalance'](b1)).toBe('S/. 0.00');

    // En el DOM se deben reflejar los montos y el número de operación
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('OP-12345678');
    expect(text).toContain('S/. 120.00');
  });

  it('Caso 3: Cambio de usuario o logout limpia inmediatamente las reservas e ignora respuestas desfasadas', async () => {
    let slowResolve!: (value: any) => void;
    mockDatabaseService.fetchMyBookings.mockImplementationOnce(
      () => new Promise((resolve) => { slowResolve = resolve; }),
    );

    isLoggedInSignal.set(true);
    currentUserSignal.set({
      id: 'usr-a',
      id_usuario: 'usr-a',
      nombre: 'Usuario A',
      email: 'a@test.pe',
      rol: 'cliente',
    } as User);
    createComponent();
    expect(component['isLoading']()).toBe(true);

    // Usuario B inicia sesión antes de que responda A
    mockDatabaseService.fetchMyBookings.mockResolvedValueOnce([
      {
        id: '201',
        id_reserva: 201,
        codigoPase: 'CAN-201',
        courtName: 'Cancha B',
        fecha: '2026-11-25',
        horario: '20:00 - 21:00',
        total: 100,
        status: 'Confirmada',
        paidAmount: 100,
        balanceAmount: 0,
      },
    ]);
    currentUserSignal.set({
      id: 'usr-b',
      id_usuario: 'usr-b',
      nombre: 'Usuario B',
      email: 'b@test.pe',
      rol: 'cliente',
    } as User);
    fixture.detectChanges();
    await fixture.whenStable();

    // La respuesta vieja de A resuelve tardíamente
    slowResolve([
      {
        id: '999-viejo',
        codigoPase: 'VIEJO',
        total: 500,
      },
    ]);
    await fixture.whenStable();
    fixture.detectChanges();

    // No debe contener ninguna reserva del usuario anterior A
    const bookings = component['serverBookings']();
    expect(bookings.some((b) => b.id === '999-viejo')).toBe(false);
    expect(bookings.length).toBe(1);
    expect(bookings[0].id).toBe('201');

    // Ahora logout
    isLoggedInSignal.set(false);
    currentUserSignal.set(null);
    fixture.detectChanges();

    expect(component['serverBookings']().length).toBe(0);
    expect(component['loadError']()).toBeNull();
  });

  it('Caso 4: Filtros de pestañas clasifican correctamente Próximas, Historial y Todas', async () => {
    isLoggedInSignal.set(true);
    currentUserSignal.set({ id: 'usr-1', nombre: 'Jugador 1' } as User);
    createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    // Por defecto pestaña 'proximas'
    expect(component['tabActiva']()).toBe('proximas');
    expect(component['countProximas']()).toBe(1);
    expect(component['countHistorial']()).toBe(1);
    expect(component['countTodas']()).toBe(2);

    expect(component['reservasVisibles']().length).toBe(1);
    expect(component['reservasVisibles']()[0].id).toBe('101');

    // Cambiar a historial
    component['setTab']('historial');
    expect(component['tabActiva']()).toBe('historial');
    expect(component['reservasVisibles']().length).toBe(1);
    expect(component['reservasVisibles']()[0].id).toBe('102');

    // Cambiar a todas
    component['setTab']('todas');
    expect(component['tabActiva']()).toBe('todas');
    expect(component['reservasVisibles']().length).toBe(2);
  });

  it('does not call cancellation when confirmation is dismissed', async () => {
    isLoggedInSignal.set(true);
    currentUserSignal.set({ id: 'usr-1', nombre: 'Jugador 1' } as User);
    createComponent();
    await fixture.whenStable();
    confirm.mockResolvedValue(false);
    await component['cancelarReserva'](component['serverBookings']()[0]);
    expect(mockDatabaseService.cancelPlayerBooking).not.toHaveBeenCalled();
    expect(component['serverBookings']()[0].status).toBe('CONFIRMADO');
  });

  it('does not send an old cancellation after the account changes during confirmation', async () => {
    isLoggedInSignal.set(true);
    currentUserSignal.set({ id: 'usr-1', nombre: 'Jugador 1' } as User);
    createComponent();
    await fixture.whenStable();
    let resolve!: (value: boolean) => void;
    confirm.mockReturnValue(new Promise<boolean>(done => { resolve = done; }));
    const pending = component['cancelarReserva'](component['serverBookings']()[0]);
    currentUserSignal.set({ id: 'usr-2', nombre: 'Jugador 2' } as User);
    resolve(true);
    await pending;
    expect(mockDatabaseService.cancelPlayerBooking).not.toHaveBeenCalled();
  });

  it('Caso 5: Cancelación confirmada actualiza el estado a CANCELADO y contadores sin recargar', async () => {
    isLoggedInSignal.set(true);
    currentUserSignal.set({ id: 'usr-1', nombre: 'Jugador 1' } as User);
    createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['countProximas']()).toBe(1);
    expect(component['countHistorial']()).toBe(1);

    const bookingToCancel = component['serverBookings']()[0]; // 101 (Próxima)
    await component['cancelarReserva'](bookingToCancel);
    fixture.detectChanges();

    expect(mockDatabaseService.cancelPlayerBooking).toHaveBeenCalledWith('101');
    const updated = component['serverBookings']().find((b) => b.id === '101');
    expect(updated?.status).toBe('CANCELADO');

    // Ahora pasa automáticamente a historial
    expect(component['countProximas']()).toBe(0);
    expect(component['countHistorial']()).toBe(2);
  });

  it('Caso 6: Fallo en cancelación muestra mensaje de error claro y no cambia el estado a cancelado', async () => {
    isLoggedInSignal.set(true);
    currentUserSignal.set({ id: 'usr-1', nombre: 'Jugador 1' } as User);
    mockDatabaseService.cancelPlayerBooking.mockRejectedValueOnce({
      error: { message: 'No puedes cancelar con menos de 2 horas de anticipación' },
    });
    createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    const booking = component['serverBookings']()[0];
    await component['cancelarReserva'](booking);
    fixture.detectChanges();

    expect(component['cancelError']()).toBe('No puedes cancelar con menos de 2 horas de anticipación');
    expect(component['serverBookings']()[0].status).toBe('CONFIRMADO');
    expect(fixture.nativeElement.textContent).toContain('No puedes cancelar con menos de 2 horas de anticipación');
  });

  it('Caso 7: Error de carga de reservas permite reintentar con botón retry', async () => {
    isLoggedInSignal.set(true);
    currentUserSignal.set({ id: 'usr-1', nombre: 'Jugador 1' } as User);
    mockDatabaseService.fetchMyBookings.mockRejectedValueOnce(new Error('Fallo de conexión al servidor'));

    createComponent();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['loadError']()).toBe('Fallo de conexión al servidor');
    expect(fixture.nativeElement.textContent).toContain('Fallo de conexión al servidor');

    // Al reintentar, resuelve con éxito
    mockDatabaseService.fetchMyBookings.mockResolvedValueOnce(sampleBookingsServer);
    component['retry']();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component['loadError']()).toBeNull();
    expect(component['serverBookings']().length).toBe(2);
  });

  it('Caso 8: Apertura y cierre del modal de Pase QR y acción de compartir en WhatsApp', () => {
    createComponent();
    const testBooking: Booking = {
      id: '99',
      codigoPase: 'CAN-99-TEST',
      courtName: 'Cancha Central',
      venueName: 'Arena Gol',
      venueId: 'v-1',
      fecha: '2026-12-01',
      horario: '20:00 - 21:00',
      total: 150,
      status: 'CONFIRMADO',
      paidAmount: 150,
      balanceAmount: 0,
      jugadores: ['Renato'],
    };

    expect(component['qrAbierto']()).toBe(false);
    component['openQr'](testBooking);
    expect(component['qrAbierto']()).toBe(true);
    expect(component['reservaQr']()?.codigoPase).toBe('CAN-99-TEST');

    component['closeQr']();
    expect(component['qrAbierto']()).toBe(false);
    expect(component['reservaQr']()).toBeNull();

    // Compartir en WhatsApp abre ventana con datos reales
    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    component['compartirWhatsApp'](testBooking);
    expect(windowOpenSpy).toHaveBeenCalledWith(
      expect.stringContaining('Arena%20Gol'),
      '_blank',
    );
  });
});
