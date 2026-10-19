import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Checkout } from './checkout';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import type { Court, Venue } from '@shared/models/venue.model';
import type { User } from '@shared/models/user.model';
import { resolveSlotAvailability } from '@core/utils/availability.utils';
import type { WeekDay } from './checkout';

describe('Checkout Component - Fase 1: Identidad y Cancha Concreta', () => {
  let fixture: ComponentFixture<Checkout>;
  let component: Checkout;

  const catalogLoadingSignal = signal(false);
  const isLoggedInSignal = signal(false);
  const currentUserSignal = signal<User | null>(null);

  const mockReservasSignal = signal<any[]>([]);
  const mockBloqueosSignal = signal<any[]>([]);
  const mockHorariosSignal = signal<any[]>([]);
  const mockTarifasCanchaSignal = signal<any[]>([]);

  const queryParams$ = new BehaviorSubject(convertToParamMap({ courtId: 'court-101' }));

  const mockCourtNorteF7: Court = {
    id: 'court-101',
    id_cancha: 101,
    id_sede: 10,
    nombre: 'Cancha 1 Sintética',
    tipo: 'Fútbol 7',
    formato: 'Fútbol 7',
    superficie: 'Grass Sintético',
    cobertura: 'Techada',
    precioHora: 90,
    precioHoraNoche: 120,
    horaInicioNoche: '18:00',
    disponible: true,
  };

  const mockVenueNorte: Venue = {
    id: 'venue-10',
    nombre: 'Complejo Deportivo Norte',
    ciudad: 'Lima',
    distrito: 'Los Olivos',
    direccion: 'Av. Las Palmeras 1234',
    rating: 4.8,
    precioBase: 90,
    fotos: ['https://example.com/norte.jpg'],
    amenidades: ['Estacionamiento', 'Vestuarios'],
    canchas: [mockCourtNorteF7],
  };

  const mockCourtSurF7: Court = {
    id: 'court-202',
    id_cancha: 202,
    id_sede: 20,
    nombre: 'Cancha Central Sur',
    tipo: 'Fútbol 7',
    formato: 'Fútbol 7',
    superficie: 'Grass Sintético',
    cobertura: 'Al Aire Libre',
    precioHora: 140,
    precioHoraNoche: 170,
    horaInicioNoche: '19:00',
    disponible: true,
  };

  const mockVenueSur: Venue = {
    id: 'venue-20',
    nombre: 'Arena Gol Sur',
    ciudad: 'Lima',
    distrito: 'Surco',
    direccion: 'Av. Benavides 4567',
    rating: 4.6,
    precioBase: 140,
    fotos: ['https://example.com/sur.jpg'],
    amenidades: ['Cafetería', 'Tribuna'],
    canchas: [mockCourtSurF7],
  };

  const courtsCatalog: Record<string, { court: Court; venue: Venue }> = {
    'court-101': { court: mockCourtNorteF7, venue: mockVenueNorte },
    'court-202': { court: mockCourtSurF7, venue: mockVenueSur },
  };

  const mockDatabaseService = {
    catalogLoading: catalogLoadingSignal,
    getVenuesPublicos: vi.fn(() => [mockVenueNorte, mockVenueSur]),
    getCourtPublica: vi.fn((id: string | number) => courtsCatalog[String(id)]),
    reservas: mockReservasSignal,
    bloqueos: mockBloqueosSignal,
    horarios: mockHorariosSignal,
    tarifasCancha: mockTarifasCanchaSignal,
    getCourtSlotAvailability: vi.fn((court: Court, dateStr: string, hour: number, nowDate?: Date) =>
      resolveSlotAvailability(
        court,
        dateStr,
        hour,
        mockReservasSignal(),
        mockBloqueosSignal(),
        mockHorariosSignal(),
        mockTarifasCanchaSignal(),
        nowDate,
      ),
    ),
    refreshCatalogo: vi.fn(async () => {}),
  };

  const mockAuthService = {
    isLoggedIn: isLoggedInSignal,
    currentUser: currentUserSignal,
  };

  const mockActivatedRoute = {
    snapshot: {
      queryParamMap: {
        get: (key: string) => queryParams$.value.get(key),
      },
    },
    queryParamMap: queryParams$.asObservable(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    catalogLoadingSignal.set(false);
    isLoggedInSignal.set(false);
    currentUserSignal.set(null);
    mockReservasSignal.set([]);
    mockBloqueosSignal.set([]);
    mockHorariosSignal.set([]);
    mockTarifasCanchaSignal.set([]);
    queryParams$.next(convertToParamMap({ courtId: 'court-101' }));

    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [
        provideRouter([]),
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('Caso 1: resuelve contextualmente la cancha concreta y su sede desde URL directa con courtId válido', () => {
    queryParams$.next(convertToParamMap({ courtId: 'court-101' }));
    createComponent();

    expect(component['queryCourtId']()).toBe('court-101');
    expect(component['contextError']()).toBeNull();
    expect(component['resolvedCourt']()?.id).toBe('court-101');
    expect(component['resolvedCourt']()?.nombre).toBe('Cancha 1 Sintética');
    expect(component['resolvedVenue']()?.nombre).toBe('Complejo Deportivo Norte');
    expect(component['basePrice']()).toBe(90);
    expect(component['selectedComplejo']().name).toBe('Complejo Deportivo Norte');
    expect(component['selectedTipoCancha']()).toBe('Cancha 1 Sintética (Fútbol 7)');
  });

  it('Caso 2: dos canchas del mismo formato (Fútbol 7) en sedes diferentes resuelven a su propia sede sin contaminación cruzada', () => {
    // Primera cancha: court-101 en Complejo Deportivo Norte (precio 90)
    queryParams$.next(convertToParamMap({ courtId: 'court-101' }));
    createComponent();

    expect(component['resolvedCourt']()?.id).toBe('court-101');
    expect(component['resolvedVenue']()?.id).toBe('venue-10');
    expect(component['basePrice']()).toBe(90);

    // Cambio reactivo a segunda cancha: court-202 en Arena Gol Sur (precio 140)
    queryParams$.next(convertToParamMap({ courtId: 'court-202' }));
    fixture.detectChanges();

    expect(component['queryCourtId']()).toBe('court-202');
    expect(component['resolvedCourt']()?.id).toBe('court-202');
    expect(component['resolvedVenue']()?.id).toBe('venue-20');
    expect(component['resolvedVenue']()?.nombre).toBe('Arena Gol Sur');
    expect(component['basePrice']()).toBe(140);
    expect(component['contextError']()).toBeNull();
  });

  it('Caso 3: carga tardía del catálogo muestra estado de carga y resuelve correctamente al terminar sin error prematuro ni fallback', () => {
    // Inicia con catálogo aún cargando
    catalogLoadingSignal.set(true);
    queryParams$.next(convertToParamMap({ courtId: 'court-101' }));
    createComponent();

    expect(component['isLoadingCatalog']()).toBe(true);
    // No debe reportar error prematuro mientras el catálogo está en tránsito
    expect(component['contextError']()).toBeNull();

    // Catálogo termina de cargar asíncronamente
    catalogLoadingSignal.set(false);
    fixture.detectChanges();

    expect(component['isLoadingCatalog']()).toBe(false);
    expect(component['contextError']()).toBeNull();
    expect(component['resolvedCourt']()?.id).toBe('court-101');
    expect(component['resolvedVenue']()?.nombre).toBe('Complejo Deportivo Norte');
  });

  it('Caso 4a: URL directa sin courtId muestra error explícito y no asume ninguna primera cancha por defecto', () => {
    queryParams$.next(convertToParamMap({}));
    createComponent();

    expect(component['queryCourtId']()).toBeNull();
    expect(component['contextError']()).toContain('No se ha seleccionado ninguna cancha');
    expect(component['resolvedCourt']()).toBeNull();
    expect(component['resolvedVenue']()).toBeNull();
    // Jamás debe hacer fallback silencioso a la cancha 1
    expect(component['selectedComplejo']().name).toBe('');
  });

  it('Caso 4b: courtId inexistente o inactivo muestra mensaje de error explícito y no simula disponibilidad', () => {
    queryParams$.next(convertToParamMap({ courtId: 'inexistente-999' }));
    createComponent();

    expect(component['queryCourtId']()).toBe('inexistente-999');
    expect(component['contextError']()).toContain('ID: inexistente-999');
    expect(component['contextError']()).toContain('no existe o no se encuentra activa');
    expect(component['resolvedCourt']()).toBeNull();
    expect(component['resolvedVenue']()).toBeNull();
  });

  it('Caso 5: sesión ausente expone returnUrl relativo seguro y deshabilita el envío sin simular reserva', () => {
    queryParams$.next(convertToParamMap({ courtId: 'court-101' }));
    isLoggedInSignal.set(false);
    currentUserSignal.set(null);
    createComponent();

    expect(component['isLoggedIn']()).toBe(false);
    expect(component['currentUser']()).toBeNull();
    // returnUrl debe ser relativo y limpio de secretos
    expect(component['returnUrl']()).toBe('/checkout?courtId=court-101');

    // Intentar confirmar sin autenticación debe bloquear y mostrar mensaje claro
    component['confirmarReserva']();
    expect(component['confirmError']()).toContain('Debes iniciar sesión con tu cuenta de jugador');
    expect(component['showSuccess']()).toBe(false);
  });

  it('Caso 6: sesión activa muestra identidad real del usuario y no simula éxito local sin confirmación del servidor', async () => {
    queryParams$.next(convertToParamMap({ courtId: 'court-101' }));
    isLoggedInSignal.set(true);
    currentUserSignal.set({
      id: 'usr-real-42',
      id_usuario: 'usr-real-42',
      nombre: 'Renato Tapia',
      email: 'renato.tapia@seleccion.pe',
      rol: 'cliente',
    } as User);
    createComponent();

    expect(component['isLoggedIn']()).toBe(true);
    expect(component['currentUser']()?.nombre).toBe('Renato Tapia');
    expect(component['currentUser']()?.email).toBe('renato.tapia@seleccion.pe');

    // Seleccionamos un turno futuro válido
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];
    component['toggleSlot'](futureDay, 19);

    // Si el servicio no responde con persistencia real en servidor, jamás simula éxito falso
    await component['confirmarReserva']();
    expect(component['showSuccess']()).toBe(false);
    expect(component['confirmError']()).toBeTruthy();
  });

  it('Caso 7: cambio de sesión en vivo (usuario A -> usuario B -> logout) actualiza titular/capitán y nunca expone "Carlos Jugador"', () => {
    queryParams$.next(convertToParamMap({ courtId: 'court-101' }));
    isLoggedInSignal.set(true);
    currentUserSignal.set({
      id: 'usr-a',
      id_usuario: 'usr-a',
      nombre: 'Paolo Guerrero',
      email: 'paolo@seleccion.pe',
      telefono: '999111222',
      rol: 'cliente',
    } as User);
    createComponent();

    expect(component['currentUser']()?.nombre).toBe('Paolo Guerrero');
    expect(component['players']()[0]?.name).toBe('Paolo Guerrero');
    expect(component['players']()[0]?.isCaptain).toBe(true);

    // Cambia la sesión a otro jugador autenticado
    currentUserSignal.set({
      id: 'usr-b',
      id_usuario: 'usr-b',
      nombre: 'Gianluca Lapadula',
      email: 'gianluca@seleccion.pe',
      telefono: '999333444',
      rol: 'cliente',
    } as User);
    fixture.detectChanges();

    expect(component['currentUser']()?.nombre).toBe('Gianluca Lapadula');
    expect(component['players']()[0]?.name).toBe('Gianluca Lapadula');

    // Cierra sesión mientras está en checkout
    isLoggedInSignal.set(false);
    currentUserSignal.set(null);
    fixture.detectChanges();

    expect(component['isLoggedIn']()).toBe(false);
    expect(component['currentUser']()).toBeNull();
    expect(component['players']()[0]?.name).toBe('Tú (Titular)');
    expect(fixture.nativeElement.textContent).not.toContain('Carlos Jugador');
  });

  it('Caso 8: recarga del componente con courtId=court-202 mantiene la cancha de Arena Gol Sur sin caer a la primera sede', () => {
    queryParams$.next(convertToParamMap({ courtId: 'court-202' }));
    createComponent();
    expect(component['resolvedCourt']()?.id).toBe('court-202');
    expect(component['resolvedVenue']()?.nombre).toBe('Arena Gol Sur');

    // Simulamos recreación por recarga de navegador
    fixture.destroy();
    createComponent();

    expect(component['resolvedCourt']()?.id).toBe('court-202');
    expect(component['resolvedVenue']()?.nombre).toBe('Arena Gol Sur');
    expect(component['basePrice']()).toBe(140);
  });
});

describe('Checkout Component - Fase 2: Disponibilidad Real y Tarifas', () => {
  let fixture: ComponentFixture<Checkout>;
  let component: Checkout;

  const catalogLoadingSignal = signal(false);
  const isLoggedInSignal = signal(true);
  const currentUserSignal = signal<User | null>({
    id: 'usr-real-42',
    id_usuario: 'usr-real-42',
    nombre: 'Renato Tapia',
    email: 'renato.tapia@seleccion.pe',
    rol: 'cliente',
  } as User);

  const mockReservasSignal = signal<any[]>([]);
  const mockBloqueosSignal = signal<any[]>([]);
  const mockHorariosSignal = signal<any[]>([]);
  const mockTarifasCanchaSignal = signal<any[]>([]);

  const queryParams$ = new BehaviorSubject(convertToParamMap({ courtId: 'court-101' }));

  const mockCourtNorteF7: Court = {
    id: 'court-101',
    id_cancha: 101,
    id_sede: 10,
    nombre: 'Cancha 1 Sintética',
    tipo: 'Fútbol 7',
    formato: 'Fútbol 7',
    superficie: 'Grass Sintético',
    cobertura: 'Techada',
    precioHora: 90,
    precioHoraNoche: 120,
    horaInicioNoche: '18:00',
    disponible: true,
  };

  const mockVenueNorte: Venue = {
    id: 'venue-10',
    nombre: 'Complejo Deportivo Norte',
    ciudad: 'Lima',
    distrito: 'Los Olivos',
    direccion: 'Av. Las Palmeras 1234',
    rating: 4.8,
    precioBase: 90,
    fotos: ['https://example.com/norte.jpg'],
    amenidades: ['Estacionamiento', 'Vestuarios'],
    canchas: [mockCourtNorteF7],
  };

  const courtsCatalog: Record<string, { court: Court; venue: Venue }> = {
    'court-101': { court: mockCourtNorteF7, venue: mockVenueNorte },
  };

  const mockLoadErrorsSignal = signal<Record<string, string>>({});

  const mockDatabaseService = {
    catalogLoading: catalogLoadingSignal,
    loadErrors: mockLoadErrorsSignal,
    getVenuesPublicos: vi.fn(() => [mockVenueNorte]),
    getCourtPublica: vi.fn((id: string | number) => courtsCatalog[String(id)]),
    reservas: mockReservasSignal,
    bloqueos: mockBloqueosSignal,
    horarios: mockHorariosSignal,
    tarifasCancha: mockTarifasCanchaSignal,
    getCourtSlotAvailability: vi.fn((court: Court, dateStr: string, hour: number, nowDate?: Date) =>
      resolveSlotAvailability(
        court,
        dateStr,
        hour,
        mockReservasSignal(),
        mockBloqueosSignal(),
        mockHorariosSignal(),
        mockTarifasCanchaSignal(),
        nowDate,
      ),
    ),
    fetchCourtAvailability: vi.fn(async (_courtId: string | number, _from: string, _to: string) => ({
      courtId: '101',
      sedeId: 10,
      from: _from,
      to: _to,
      horarios: [],
      tarifas: [],
      bloqueos: [],
      ocupaciones: [],
    })),
    refreshCatalogo: vi.fn(async () => {}),
  };

  const mockAuthService = {
    isLoggedIn: isLoggedInSignal,
    currentUser: currentUserSignal,
  };

  const mockActivatedRoute = {
    snapshot: {
      queryParamMap: {
        get: (key: string) => queryParams$.value.get(key),
      },
    },
    queryParamMap: queryParams$.asObservable(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    catalogLoadingSignal.set(false);
    mockLoadErrorsSignal.set({});
    mockReservasSignal.set([]);
    mockBloqueosSignal.set([]);
    mockHorariosSignal.set([]);
    mockTarifasCanchaSignal.set([]);
    queryParams$.next(convertToParamMap({ courtId: 'court-101' }));

    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [
        provideRouter([]),
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('F2-1: Turno libre en horario diurno calcula precio base (90) y permite selección', async () => {
    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    expect(component['slotStatus'](futureDay, 10)).toBe('available');
    expect(component['slotPriceAt'](futureDay, 10)).toBe(90);
    expect(component['isNightHour'](10)).toBe(false);

    component['toggleSlot'](futureDay, 10);
    expect(component['selectedSlots']().length).toBe(1);
    expect(component['selectedSlots']()[0].price).toBe(90);
    expect(component['selectedSlots']()[0].time).toBe('10:00 - 11:00');
  });

  it('F2-2: Turno nocturno aplica tarifa nocturna configurable (120) sin fórmulas fijas (+10)', async () => {
    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    expect(component['isNightHour'](18)).toBe(true);
    expect(component['isNightHour'](19)).toBe(true);
    expect(component['slotPriceAt'](futureDay, 19)).toBe(120);
    expect(component['slotPriceAt'](futureDay, 19)).not.toBe(100);

    component['toggleSlot'](futureDay, 19);
    expect(component['selectedSlots']()[0].price).toBe(120);
  });

  it('F2-3: Reserva activa en la cancha marca los turnos ocupados como occupied y bloquea su selección', async () => {
    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[2];

    mockReservasSignal.set([
      {
        id_reserva: 501,
        id_cancha: 101,
        id_cliente: 'uuid-cliente-privado-999',
        id_estado_reserva: 1,
        estado: 'confirmada',
        fecha_reserva: futureDay.dateStr,
        hora_inicio: '18:00',
        hora_fin: '20:00',
        monto_total: 240,
      },
    ]);
    fixture.detectChanges();

    expect(component['slotStatus'](futureDay, 18)).toBe('occupied');
    expect(component['slotStatus'](futureDay, 19)).toBe('occupied');

    expect(component['slotStatus'](futureDay, 17)).toBe('available');
    expect(component['slotStatus'](futureDay, 20)).toBe('available');

    component['toggleSlot'](futureDay, 18);
    expect(component['selectedSlots']().length).toBe(0);

    const slot18 = component['getSlot'](futureDay, 18);
    expect((slot18 as any).id_cliente).toBeUndefined();
    expect((slot18 as any).monto_total).toBeUndefined();
    expect(slot18.reason).toBe('Turno ocupado');
  });

  it('F2-4: Reserva cancelada o anulada NO ocupa el turno (se muestra available)', async () => {
    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[2];

    mockReservasSignal.set([
      {
        id_reserva: 502,
        id_cancha: 101,
        id_cliente: 'uuid-cliente-privado',
        id_estado_reserva: 4,
        estado: 'cancelada',
        fecha_reserva: futureDay.dateStr,
        hora_inicio: '18:00',
        hora_fin: '19:00',
      },
    ]);
    fixture.detectChanges();

    expect(component['slotStatus'](futureDay, 18)).toBe('available');
  });

  it('F2-5: Bloqueo de mantenimiento activo marca el intervalo como blocked y lo desactiva', async () => {
    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[4];

    mockBloqueosSignal.set([
      {
        id_bloqueo: 88,
        id_cancha: 101,
        motivo: 'Mantenimiento del césped sintético',
        fecha_inicio: `${futureDay.dateStr}T14:00:00`,
        fecha_fin: `${futureDay.dateStr}T17:00:00`,
        activo: true,
      },
    ]);
    fixture.detectChanges();

    expect(component['slotStatus'](futureDay, 14)).toBe('blocked');
    expect(component['slotStatus'](futureDay, 15)).toBe('blocked');
    expect(component['slotStatus'](futureDay, 16)).toBe('blocked');
    expect(component['slotStatus'](futureDay, 17)).toBe('available');

    component['toggleSlot'](futureDay, 14);
    expect(component['selectedSlots']().length).toBe(0);
  });

  it('F2-6: Fuera de horario de atención de la sede o día inactivo marca el turno como closed', async () => {
    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[0];
    const dayOfWeek = new Date(`${futureDay.dateStr}T12:00:00Z`).getUTCDay();

    mockHorariosSignal.set([
      {
        id_tipo_horario: 1,
        sede_id: 10,
        dia_semana: dayOfWeek,
        hora_apertura: '10:00',
        hora_cierre: '20:00',
        activo: true,
      },
    ]);
    fixture.detectChanges();

    expect(component['slotStatus'](futureDay, 8)).toBe('closed');
    expect(component['slotStatus'](futureDay, 9)).toBe('closed');
    expect(component['slotStatus'](futureDay, 10)).toBe('available');
    expect(component['slotStatus'](futureDay, 19)).toBe('available');
    expect(component['slotStatus'](futureDay, 20)).toBe('closed');
  });

  it('F2-7: Horarios pasados en America/Lima se marcan como past y no son interactivos', async () => {
    createComponent();
    await fixture.whenStable();
    const pastDay: WeekDay = {
      dateStr: '2020-01-01',
      year: 2020,
      monthName: 'Ene',
      dayNum: 1,
      dayName: 'Mié',
      displayShort: 'Mié 01',
      displayFull: 'Miércoles 1 de Enero',
      isPast: true,
      isToday: false,
    };

    expect(component['slotStatus'](pastDay, 15)).toBe('past');
    component['toggleSlot'](pastDay, 15);
    expect(component['selectedSlots']().length).toBe(0);
  });

  it('F2-8: Error de disponibilidad nunca muestra slots libres ("error no equivale a libre") y permite reintentar', async () => {
    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    expect(component['slotStatus'](futureDay, 10)).toBe('available');

    component['availabilityError'].set('No se pudo conectar con el servicio de disponibilidad');
    fixture.detectChanges();

    expect(component['slotStatus'](futureDay, 10)).toBe('closed');
    component['toggleSlot'](futureDay, 10);
    expect(component['selectedSlots']().length).toBe(0);

    component['retryAvailability']();
    await fixture.whenStable();
    expect(component['availabilityError']()).toBeNull();
    expect(mockDatabaseService.refreshCatalogo).toHaveBeenCalled();
  });

  it('F2-9: Navegación semanal actualiza weekOffset y descarta desfasajes de petición', async () => {
    createComponent();
    await fixture.whenStable();
    expect(component['weekOffset']()).toBe(0);
    const initialSeq = component['requestSeq']();

    component['nextWeek']();
    expect(component['weekOffset']()).toBe(1);
    expect(component['requestSeq']()).toBe(initialSeq + 1);

    component['nextWeek']();
    expect(component['weekOffset']()).toBe(2);
    expect(component['requestSeq']()).toBe(initialSeq + 2);

    component['prevWeek']();
    expect(component['weekOffset']()).toBe(1);

    component['todayWeek']();
    expect(component['weekOffset']()).toBe(0);
    await fixture.whenStable();
  });

  it('F2-10: Error real propagado desde DatabaseService.loadErrors activa effectiveAvailabilityError y bloquea casillas', async () => {
    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    const futureDay = component['currentWeekDays']()[3];

    expect(component['slotStatus'](futureDay, 10)).toBe('available');

    mockLoadErrorsSignal.set({ availability: 'Fallo de red al consultar GET /api/courts/101/availability' });
    fixture.detectChanges();

    expect(component['effectiveAvailabilityError']()).toContain('Fallo de red');
    expect(component['slotStatus'](futureDay, 10)).toBe('closed');
    expect(component['canProceedToPaso2']()).toBe(false);
  });

  it('F2-11: Respuesta tardía de una semana previa es ignorada cuando el usuario cambia rápidamente de semana', async () => {
    let resolveSlowWeek1!: (val: any) => void;
    mockDatabaseService.fetchCourtAvailability.mockImplementationOnce(
      () => new Promise((res) => { resolveSlowWeek1 = res; }),
    );

    createComponent();
    // Mientras la semana 0 sigue pendiente, el usuario avanza a la semana 1
    component['nextWeek']();
    await fixture.whenStable();
    expect(component['weekOffset']()).toBe(1);
    expect(component['isLoadingAvailability']()).toBe(false);

    // Ahora falla tardíamente la petición de la semana 0: debe ignorarse por completo
    resolveSlowWeek1(null);
    mockLoadErrorsSignal.set({ availability: 'Error obsoleto' });
    // Limpiamos loadErrors para comprobar que availabilityError local no se contaminó por la promesa vieja
    mockLoadErrorsSignal.set({});
    await fixture.whenStable();

    expect(component['availabilityError']()).toBeNull();
  });

  it('F2-12: Respeta horarios individuales de cancha (usar_horario_sede=false), descansos recurrentes y bloqueos con espacio', async () => {
    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    const futureDay = component['currentWeekDays']()[1]; // Martes (día 2)

    const customCourt: Court = {
      ...mockCourtNorteF7,
      usar_horario_sede: false,
      horarios_semana: [
        { dia_semana: 2, abierto: true, hora_apertura: '09:00', hora_cierre: '22:00' },
      ],
      descansos_recurrentes: [
        { id: 'd1', titulo: 'Almuerzo personal', dias: [2], hora_inicio: '13:00', hora_fin: '15:00' },
      ],
    };

    mockBloqueosSignal.set([
      {
        id_bloqueo: 99,
        id_cancha: 101,
        motivo: 'Resiembra puntual',
        // Formato timestamp con espacio devuelto por JDBC/Postgres
        fecha_inicio: `${futureDay.dateStr} 16:00:00`,
        fecha_fin: `${futureDay.dateStr} 17:00:00`,
        activo: true,
      },
    ]);

    const s8 = resolveSlotAvailability(customCourt, futureDay.dateStr, 8, [], mockBloqueosSignal(), [], []);
    const s10 = resolveSlotAvailability(customCourt, futureDay.dateStr, 10, [], mockBloqueosSignal(), [], []);
    const s13 = resolveSlotAvailability(customCourt, futureDay.dateStr, 13, [], mockBloqueosSignal(), [], []);
    const s16 = resolveSlotAvailability(customCourt, futureDay.dateStr, 16, [], mockBloqueosSignal(), [], []);

    expect(s8.state).toBe('closed');
    expect(s10.state).toBe('available');
    expect(s13.state).toBe('blocked');
    expect(s13.reason).toBe('Almuerzo personal');
    expect(s16.state).toBe('blocked');
    expect(s16.reason).toBe('Resiembra puntual');
  });
});

describe('Checkout Component - Fase 3: Selección, Agrupación y Cotización', () => {
  let fixture: ComponentFixture<Checkout>;
  let component: Checkout;

  const catalogLoadingSignal = signal(false);
  const isLoggedInSignal = signal(true);
  const currentUserSignal = signal<User | null>({
    id: 'usr-real-42',
    id_usuario: 'usr-real-42',
    nombre: 'Renato Tapia',
    email: 'renato.tapia@seleccion.pe',
    rol: 'cliente',
  } as User);

  const mockReservasSignal = signal<any[]>([]);
  const mockBloqueosSignal = signal<any[]>([]);
  const mockHorariosSignal = signal<any[]>([]);
  const mockTarifasCanchaSignal = signal<any[]>([]);

  const queryParams$ = new BehaviorSubject(convertToParamMap({ courtId: 'court-101' }));

  const mockCourtNorteF7: Court = {
    id: 'court-101',
    id_cancha: 101,
    id_sede: 10,
    nombre: 'Cancha 1 Sintética',
    tipo: 'Fútbol 7',
    formato: 'Fútbol 7',
    superficie: 'Grass Sintético',
    cobertura: 'Techada',
    precioHora: 90,
    precioHoraNoche: 120,
    horaInicioNoche: '18:00',
    disponible: true,
  };

  const mockVenueNorte: Venue = {
    id: 'venue-10',
    nombre: 'Complejo Deportivo Norte',
    ciudad: 'Lima',
    distrito: 'Los Olivos',
    direccion: 'Av. Las Palmeras 1234',
    rating: 4.8,
    precioBase: 90,
    fotos: ['https://example.com/norte.jpg'],
    amenidades: ['Estacionamiento', 'Vestuarios'],
    canchas: [mockCourtNorteF7],
  };

  const courtsCatalog: Record<string, { court: Court; venue: Venue }> = {
    'court-101': { court: mockCourtNorteF7, venue: mockVenueNorte },
  };

  const mockDatabaseService = {
    catalogLoading: catalogLoadingSignal,
    getVenuesPublicos: vi.fn(() => [mockVenueNorte]),
    getCourtPublica: vi.fn((id: string | number) => courtsCatalog[String(id)]),
    reservas: mockReservasSignal,
    bloqueos: mockBloqueosSignal,
    horarios: mockHorariosSignal,
    tarifasCancha: mockTarifasCanchaSignal,
    getCourtSlotAvailability: vi.fn((court: Court, dateStr: string, hour: number, nowDate?: Date) =>
      resolveSlotAvailability(
        court,
        dateStr,
        hour,
        mockReservasSignal(),
        mockBloqueosSignal(),
        mockHorariosSignal(),
        mockTarifasCanchaSignal(),
        nowDate,
      ),
    ),
    refreshCatalogo: vi.fn(async () => {}),
  };

  const mockAuthService = {
    isLoggedIn: isLoggedInSignal,
    currentUser: currentUserSignal,
  };

  const mockActivatedRoute = {
    snapshot: {
      queryParamMap: {
        get: (key: string) => queryParams$.value.get(key),
      },
    },
    queryParamMap: queryParams$.asObservable(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    catalogLoadingSignal.set(false);
    mockReservasSignal.set([]);
    mockBloqueosSignal.set([]);
    mockHorariosSignal.set([]);
    mockTarifasCanchaSignal.set([]);
    queryParams$.next(convertToParamMap({ courtId: 'court-101' }));

    await TestBed.configureTestingModule({
      imports: [Checkout],
      providers: [
        provideRouter([]),
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(Checkout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('F3-1: Selección inicial vacía; canProceedToPaso2 es false y goToPaso(2) es bloqueado', () => {
    createComponent();
    expect(component['selectedSlots']().length).toBe(0);
    expect(component['bookingBlock']().isValid).toBe(false);
    expect(component['canProceedToPaso2']()).toBe(false);

    component['goToPaso'](2);
    expect(component['activePaso']()).toBe(1);
    expect(component['confirmError']()).toContain('selecciona al menos un turno');
  });

  it('F3-2: Dos horas contiguas seleccionadas en distinto orden (19:00 y luego 18:00) forman un bloque continuo ordenado 18:00 - 20:00', () => {
    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 19);
    component['toggleSlot'](futureDay, 18);
    fixture.detectChanges();

    const block = component['bookingBlock']();
    expect(block.isValid).toBe(true);
    expect(block.timeStart).toBe('18:00');
    expect(block.timeEnd).toBe('20:00');
    expect(block.durationHours).toBe(2);
    expect(block.displayRange).toBe('18:00 - 20:00');
    expect(component['canProceedToPaso2']()).toBe(true);
    expect(component['horasLabel']()).toBe('2 horas continuas');
    expect(component['subtotal']()).toBe(240);
  });

  it('F3-3: Deseleccionar una hora de un bloque de dos horas recalcula inmediatamente el bloque e importe', () => {
    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    component['toggleSlot'](futureDay, 19);
    expect(component['subtotal']()).toBe(240);

    component['removeSlotByHour'](18);
    fixture.detectChanges();

    const block = component['bookingBlock']();
    expect(block.isValid).toBe(true);
    expect(block.timeStart).toBe('19:00');
    expect(block.timeEnd).toBe('20:00');
    expect(block.durationHours).toBe(1);
    expect(component['subtotal']()).toBe(120);
    expect(component['canProceedToPaso2']()).toBe(true);
  });

  it('F3-4: Selección con hueco intermedio (p. ej. 18:00 y 20:00 sin 19:00) invalida el bloque y deshabilita continuar', () => {
    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    component['toggleSlot'](futureDay, 20);
    fixture.detectChanges();

    const block = component['bookingBlock']();
    expect(block.isValid).toBe(false);
    expect(block.errorMessage).toContain('Existe un hueco no seleccionado entre las 19:00 y las 20:00');
    expect(component['canProceedToPaso2']()).toBe(false);
    expect(component['selectionValidationMessage']()).toContain('Existe un hueco no seleccionado');

    component['goToPaso'](2);
    expect(component['activePaso']()).toBe(1);
    expect(component['confirmError']()).toContain('Existe un hueco no seleccionado');
  });

  it('F3-5: Selección en días distintos es rechazada (cada reserva representa un único bloque en la misma fecha)', () => {
    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const day1 = component['currentWeekDays']()[1];
    const day2 = component['currentWeekDays']()[2];

    component['toggleSlot'](day1, 18);
    component['toggleSlot'](day2, 18);
    fixture.detectChanges();

    const block = component['bookingBlock']();
    expect(block.isValid).toBe(false);
    expect(block.errorMessage).toContain('pertenecer a la misma fecha');
    expect(component['canProceedToPaso2']()).toBe(false);
    expect(fixture.nativeElement.querySelectorAll('.slot.chosen[aria-pressed="true"]')).toHaveLength(2);
    const summaryBlock = fixture.nativeElement.querySelector('[data-summary-block]');
    expect(summaryBlock.textContent).toContain(day1.displayShort);
    expect(summaryBlock.textContent).toContain(day2.displayShort);

    component['goToPaso'](2);
    expect(component['activePaso']()).toBe(1);
    expect(component['confirmError']()).toContain('pertenecer a la misma fecha');
  });

  it('F3-6: Desglose tarifario mixto (diurno + nocturno) cotiza exactamente por tramo sin fórmulas fijas', () => {
    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 17);
    component['toggleSlot'](futureDay, 18);
    fixture.detectChanges();

    const block = component['bookingBlock']();
    expect(block.isValid).toBe(true);
    expect(block.tranches.length).toBe(2);

    expect(block.tranches[0].hour).toBe(17);
    expect(block.tranches[0].price).toBe(90);
    expect(block.tranches[0].rateType).toBe('Día');
    expect(block.tranches[0].isNight).toBe(false);

    expect(block.tranches[1].hour).toBe(18);
    expect(block.tranches[1].price).toBe(120);
    expect(block.tranches[1].rateType).toBe('Noche');
    expect(block.tranches[1].isNight).toBe(true);

    expect(component['subtotal']()).toBe(210);
    expect(component['total']()).toBe(210);
  });

  it('F3-7: Bloque continuo que abarca medianoche (hora 23:00) normaliza hora de fin a 00:00', () => {
    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 22);
    component['toggleSlot'](futureDay, 23);
    fixture.detectChanges();

    const block = component['bookingBlock']();
    expect(block.isValid).toBe(true);
    expect(block.timeStart).toBe('22:00');
    expect(block.timeEnd).toBe('00:00');
    expect(block.displayRange).toBe('22:00 - 00:00');
    expect(block.durationHours).toBe(2);
    expect(component['canProceedToPaso2']()).toBe(true);
  });

  it('F3-8: reprice() elimina turnos que se volvieron no disponibles concurrentemente', () => {
    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    component['toggleSlot'](futureDay, 19);
    expect(component['selectedSlots']().length).toBe(2);

    mockReservasSignal.set([
      {
        id_cancha: 101,
        fecha_reserva: futureDay.dateStr,
        hora_inicio: '19:00',
        hora_fin: '20:00',
        estado: 'confirmada',
        id_estado_reserva: 1,
      },
    ]);

    component['reprice']();
    fixture.detectChanges();

    expect(component['selectedSlots']().length).toBe(1);
    expect(component['selectedSlots']()[0].hour).toBe(18);
    expect(component['confirmError']()).toContain('ya no se encuentran disponibles');
  });

  it('F3-9: Error de disponibilidad deshabilita canProceedToPaso2 incluso si hay selección previa', () => {
    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    expect(component['canProceedToPaso2']()).toBe(true);

    component['availabilityError'].set('Error de conexión');
    fixture.detectChanges();

    expect(component['canProceedToPaso2']()).toBe(false);
  });

  it('F3-10: La hora 23 (23:00 - 00:00) forma parte de filteredHours() y puede seleccionarse desde la grilla', () => {
    createComponent();
    expect(component['filteredHours']()).toContain(23);
    component['setTimeFilter']('prime');
    expect(component['filteredHours']()).toContain(23);
  });

  it('F3-11: goToPaso(2) ejecuta automáticamente reprice() antes de avanzar, actualizando precio concurrente o bloqueando si se ocupó', () => {
    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    expect(component['subtotal']()).toBe(120);

    // Simulamos cambio de tarifa en servidor antes de avanzar al paso 2
    mockTarifasCanchaSignal.set([
      {
        id_tarifa: 77,
        cancha_id: 101,
        dia_semana: new Date(`${futureDay.dateStr}T12:00:00Z`).getUTCDay(),
        hora_inicio: '18:00',
        hora_fin: '23:00',
        precio: 155,
        activo: true,
      },
    ]);

    component['goToPaso'](2);
    fixture.detectChanges();

    expect(component['activePaso']()).toBe(2);
    expect(component['selectedSlots']()[0].price).toBe(155);
    expect(component['subtotal']()).toBe(155);
  });

  it('F3-12: Cotización en servidor (POST /api/courts/{id}/quote) prevalece sobre el cálculo local al sincronizarse', async () => {
    (mockDatabaseService as any).quoteCourtBooking = vi.fn(async (courtId: string, dateStr: string, hours: number[]) => ({
      courtId: String(courtId),
      dateStr,
      timeStart: '18:00',
      timeEnd: '20:00',
      durationHours: hours.length,
      isValid: true,
      errorMessage: null,
      tranches: [
        { hour: 18, timeStart: '18:00', timeEnd: '19:00', displayTime: '18:00 - 19:00', price: 135, isNight: true, rateType: 'Noche' as const },
        { hour: 19, timeStart: '19:00', timeEnd: '20:00', displayTime: '19:00 - 20:00', price: 135, isNight: true, rateType: 'Noche' as const },
      ],
      subtotal: 270,
    }));

    createComponent();
    component['nextWeek']();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    component['toggleSlot'](futureDay, 19);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((mockDatabaseService as any).quoteCourtBooking).toHaveBeenCalledWith('court-101', futureDay.dateStr, [18, 19]);
    expect(component['subtotal']()).toBe(270);
    expect(component['bookingBlock']().tranches[0].price).toBe(135);
  });

  it('F4-1: confirmarReserva persiste el bloque completo (no solo la primera hora) con idempotencyKey y abre éxito solo tras confirmación del servidor', async () => {
    const createOnlineBookingSpy = vi.fn(async (payload: any) => ({
      reserva: {
        id: 701,
        codigo_pase: '#CAN-7010',
        fecha_reserva: payload.fecha,
        hora_inicio: '18:00',
        hora_fin: '20:00',
        monto_total: payload.total,
      },
      pago: { id: 701, monto: payload.total },
      response: {
        id: '701',
        codigoPase: '#CAN-7010',
        horario: '18:00 - 20:00',
        total: payload.total,
      },
    }));
    (mockDatabaseService as any).createOnlineBooking = createOnlineBookingSpy;
    (mockDatabaseService as any).fetchCourtAvailability = vi.fn(async () => ({}));
    delete (mockDatabaseService as any).quoteCourtBooking;

    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    component['toggleSlot'](futureDay, 19);
    fixture.detectChanges();

    expect(component['canSubmitReservation']()).toBe(true);
    await component['confirmarReserva']();

    expect(createOnlineBookingSpy).toHaveBeenCalledTimes(1);
    const sentPayload = createOnlineBookingSpy.mock.calls[0][0];
    expect(sentPayload.courtId).toBe('court-101');
    expect(sentPayload.fecha).toBe(futureDay.dateStr);
    expect(sentPayload.horario).toBe('18:00 - 20:00');
    expect(sentPayload.hours).toEqual([18, 19]);
    expect(sentPayload.total).toBe(240);
    expect(sentPayload.idempotencyKey).toMatch(/^chk-court-101-/);

    expect(component['showSuccess']()).toBe(true);
    expect(component['reservaCode']()).toBe('#CAN-7010');
    expect(component['confirmError']()).toBe('');
  });

  it('F4-2: Reintento con la misma selección reutiliza la misma idempotencyKey y cambiar horas genera una nueva clave', async () => {
    const keys: string[] = [];
    (mockDatabaseService as any).fetchCourtAvailability = undefined;
    delete (mockDatabaseService as any).quoteCourtBooking;
    (mockDatabaseService as any).createOnlineBooking = vi.fn(async (payload: any) => {
      keys.push(payload.idempotencyKey);
      return {
        reserva: { id: 702, codigo_pase: '#CAN-7020' },
        pago: { id: 702, monto: payload.total },
        response: { id: '702', codigoPase: '#CAN-7020', horario: payload.horario, total: payload.total },
      };
    });

    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    component['toggleSlot'](futureDay, 19);
    await component['confirmarReserva']();
    await component['confirmarReserva']();

    expect(keys.length).toBe(2);
    expect(keys[0]).toBe(keys[1]);

    // Si el usuario agrega una hora adicional (18:00 - 21:00), la firma cambia y genera otra clave
    component['toggleSlot'](futureDay, 20);
    await component['confirmarReserva']();
    expect(keys.length).toBe(3);
    expect(keys[2]).not.toBe(keys[0]);
  });

  it('F4-3: Ignora clics repetidos mientras submitting() está en curso (evita doble envío concurrente desde UI)', async () => {
    let resolveBooking!: (value: any) => void;
    (mockDatabaseService as any).fetchCourtAvailability = undefined;
    delete (mockDatabaseService as any).quoteCourtBooking;
    const createOnlineBookingSpy = vi.fn(
      () =>
        new Promise((res) => {
          resolveBooking = res;
        }),
    );
    (mockDatabaseService as any).createOnlineBooking = createOnlineBookingSpy;

    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    const firstPromise = component['confirmarReserva']();
    expect(component['submitting']()).toBe(true);
    expect(component['canSubmitReservation']()).toBe(false);

    // Segundo clic mientras el primero sigue en vuelo
    await component['confirmarReserva']();
    expect(createOnlineBookingSpy).toHaveBeenCalledTimes(1);

    resolveBooking({
      reserva: { id: 703, codigo_pase: '#CAN-7030' },
      pago: { id: 703, monto: 120 },
      response: { id: '703', codigoPase: '#CAN-7030', horario: '18:00 - 19:00', total: 120 },
    });
    await firstPromise;
    expect(component['submitting']()).toBe(false);
    expect(component['showSuccess']()).toBe(true);
  });

  it('F4-4: Ante 409 Conflict del servidor, no muestra éxito, recarga disponibilidad real y poda turnos ocupados con reprice()', async () => {
    (mockDatabaseService as any).fetchCourtAvailability = undefined;
    delete (mockDatabaseService as any).quoteCourtBooking;

    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    component['toggleSlot'](futureDay, 19);
    expect(component['selectedSlots']().length).toBe(2);

    (mockDatabaseService as any).fetchCourtAvailability = vi.fn(async () => {
      // Al refrescar disponibilidad, la hora 19:00 ya aparece ocupada por otro jugador
      mockReservasSignal.set([
        {
          id_cancha: 101,
          fecha_reserva: futureDay.dateStr,
          hora_inicio: '19:00',
          hora_fin: '20:00',
          estado: 'confirmada',
          id_estado_reserva: 2,
        },
      ]);
      return {};
    });

    (mockDatabaseService as any).createOnlineBooking = vi.fn(async () => {
      throw {
        status: 409,
        error: { message: 'Horario no disponible: ya existe una reserva activa en ese rango.' },
      };
    });

    await component['confirmarReserva']();

    expect(component['showSuccess']()).toBe(false);
    expect((mockDatabaseService as any).fetchCourtAvailability).toHaveBeenCalled();
    // La hora 19:00 fue removida por reprice() y solo queda 18:00
    expect(component['selectedSlots']().map((s) => s.hour)).toEqual([18]);
    expect(component['confirmError']()).toContain('Horario no disponible');
  });

  it('F4-5: Si el servidor falla (500/red), no simula éxito ni agrega reservas falsas', async () => {
    (mockDatabaseService as any).fetchCourtAvailability = undefined;
    delete (mockDatabaseService as any).quoteCourtBooking;
    mockReservasSignal.set([]);
    (mockDatabaseService as any).createOnlineBooking = vi.fn(async () => {
      throw {
        status: 500,
        error: { message: 'Error interno al persistir la reserva' },
      };
    });

    createComponent();
    component['nextWeek']();
    await fixture.whenStable();
    mockReservasSignal.set([]);
    fixture.detectChanges();
    const futureDay = component['currentWeekDays']()[3];

    component['toggleSlot'](futureDay, 18);
    await component['confirmarReserva']();

    expect(component['showSuccess']()).toBe(false);
    expect(component['confirmError']()).toContain('Error interno al persistir la reserva');
    expect(mockReservasSignal().length).toBe(0);
  });

  describe('Fase 5: Pago y Confirmación (Tarjeta online 100%, rechazo/timeout simulado y estados separados)', () => {
    it('F5-1: El flujo online del jugador exige 100% de pago con tarjeta y rechaza Yape/Plin', () => {
      createComponent();
      component['nextWeek']();
      const futureDay = component['currentWeekDays']()[3];
      component['toggleSlot'](futureDay, 18);

      // El total a pagar ahora debe ser el 100% del subtotal de la reserva
      expect(component['total']()).toBeGreaterThan(0);
      expect(component['totalToPayNow']()).toBe(component['total']());
      expect(component['paymentMethodName']()).toBe('Tarjeta');

      // Intentar cambiar a Yape o Plin online debe ser rechazado
      component['selectPayment']('yape');
      expect(component['paymentMethod']()).toBe('card');
      expect(component['confirmError']()).toContain('solo está habilitado el pago al 100% con tarjeta');

      component['selectPayment']('plin');
      expect(component['paymentMethod']()).toBe('card');
      expect(component['confirmError']()).toContain('solo está habilitado el pago al 100% con tarjeta');
    });

    it('F5-2: Valida los campos de la tarjeta impidiendo el envío si son inválidos', () => {
      createComponent();
      component['nextWeek']();
      const futureDay = component['currentWeekDays']()[3];
      component['toggleSlot'](futureDay, 18);

      expect(component['isCardValid']()).toBe(true);
      expect(component['canSubmitReservation']()).toBe(true);

      // Número inválido (<16 dígitos)
      component['cardNumber'].set('1234');
      expect(component['isCardValid']()).toBe(false);
      expect(component['canSubmitReservation']()).toBe(false);

      // Restaurar número, fecha inválida
      component['cardNumber'].set('4532 0000 0000 4242');
      component['cardExpiry'].set('13/25'); // mes inválido
      expect(component['isCardValid']()).toBe(false);

      // Formato incorrecto
      component['cardExpiry'].set('2028');
      expect(component['isCardValid']()).toBe(false);

      // Restaurar fecha, CVV inválido
      component['cardExpiry'].set('12/28');
      component['cardCvv'].set('1');
      expect(component['isCardValid']()).toBe(false);

      // Restaurar CVV, nombre vacío
      component['cardCvv'].set('123');
      component['cardHolder'].set('   ');
      expect(component['isCardValid']()).toBe(false);

      // Nombre válido
      component['cardHolder'].set('Juan Pérez');
      expect(component['isCardValid']()).toBe(true);
      expect(component['canSubmitReservation']()).toBe(true);
    });

    it('F5-3: Pago simulado exitoso (approved) confirma reserva en el servidor con saldo 0 y muestra modal con estados separados', async () => {
      (mockDatabaseService as any).fetchCourtAvailability = undefined;
      delete (mockDatabaseService as any).quoteCourtBooking;

      createComponent();
      component['nextWeek']();
      await fixture.whenStable();
      fixture.detectChanges();
      const futureDay = component['currentWeekDays']()[3];
      component['toggleSlot'](futureDay, 18);

      const createOnlineBookingSpy = vi.fn(async (payload: any) => ({
        reserva: { id: 801, codigo_pase: '#CAN-8010', estado: 'Confirmada', id_estado_reserva: 2 },
        pago: { id: 801, estado: 'aprobado', numero_operacion: 'IDEMP:test-idemp-801' },
        response: {
          id: '801',
          codigoPase: '#CAN-8010',
          horario: '18:00 - 19:00',
          total: 120,
          status: 'Confirmada',
          paymentStatus: 'aprobado',
          paidAmount: 120,
          balanceAmount: 0,
          paymentOperationNumber: 'IDEMP:test-idemp-801',
        },
      }));
      (mockDatabaseService as any).createOnlineBooking = createOnlineBookingSpy;

      component['cardSimulationOutcome'].set('approved');
      await component['confirmarReserva']();

      expect(createOnlineBookingSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          paymentOutcome: 'approved',
          metodoPago: 'Tarjeta',
        }),
      );
      expect(component['showSuccess']()).toBe(true);
      expect(component['reservaCode']()).toBe('#CAN-8010');
      expect(component['reservaStatus']()).toBe('Confirmada');
      expect(component['paymentStatus']()).toBe('aprobado');
      expect(component['paidAmount']()).toBe(120);
      expect(component['balanceAmount']()).toBe(0);
      expect(component['paymentOpNumber']()).toBe('IDEMP:test-idemp-801');
    });

    it('F5-4: Pago simulado rechazado (402) muestra error claro y no confirma reserva ni muestra modal de éxito', async () => {
      (mockDatabaseService as any).fetchCourtAvailability = undefined;
      delete (mockDatabaseService as any).quoteCourtBooking;

      createComponent();
      component['nextWeek']();
      await fixture.whenStable();
      fixture.detectChanges();
      const futureDay = component['currentWeekDays']()[3];
      component['toggleSlot'](futureDay, 18);

      (mockDatabaseService as any).createOnlineBooking = vi.fn(async () => {
        throw {
          status: 402,
          error: { message: 'El pago simulado con tarjeta fue rechazado por la entidad emisora. La reserva no fue confirmada.' },
        };
      });

      component['cardSimulationOutcome'].set('rejected');
      await component['confirmarReserva']();

      expect(component['showSuccess']()).toBe(false);
      expect(component['confirmError']()).toContain('rechazado por la entidad emisora');
    });

    it('F5-5: Pago simulado timeout (504) informa tiempo de espera agotado sin confirmar reserva', async () => {
      (mockDatabaseService as any).fetchCourtAvailability = undefined;
      delete (mockDatabaseService as any).quoteCourtBooking;

      createComponent();
      component['nextWeek']();
      await fixture.whenStable();
      fixture.detectChanges();
      const futureDay = component['currentWeekDays']()[3];
      component['toggleSlot'](futureDay, 18);

      (mockDatabaseService as any).createOnlineBooking = vi.fn(async () => {
        throw {
          status: 504,
          error: { message: 'Tiempo de espera agotado al conectar con el procesador de pagos. No se realizó ningún cargo.' },
        };
      });

      component['cardSimulationOutcome'].set('timeout');
      await component['confirmarReserva']();

      expect(component['showSuccess']()).toBe(false);
      expect(component['confirmError']()).toContain('Tiempo de espera agotado');
    });
  });
});
