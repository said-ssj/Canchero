import { VenuePreferences } from '@core/services/venue-preferences.service';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { of, Subject, throwError } from 'rxjs';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Detalle } from './detalle';
import { DatabaseService } from '@core/supabase/database.service';
import { CourtFilterService } from '@core/services/court-filter.service';
import { MapsService } from '@core/services/maps.service';
import { ReviewService } from './review.service';
import { AuthService } from '@core/auth/auth.service';
import type { Venue } from '@shared/models/venue.model';
import type { Court } from '@shared/models/court.model';

describe('Detalle Component - Fase 7: Diseño y Verificación Integral', () => {
  let fixture: ComponentFixture<Detalle>;
  let component: Detalle;
  let router: Router;

  const catalogLoadingSignal = signal(false);

  const mockCourt1: Court = {
    id: 'court-101',
    id_cancha: 101,
    id_sede: 10,
    nombre: 'Cancha 1 Sintética',
    tipo: 'Fútbol 7',
    formato: 'Fútbol 7',
    superficie: 'Grass Sintético',
    cobertura: 'Techada',
    precioHora: 90,
    disponible: true,
  };

  const mockVenue: Venue = {
    id: 'venue-10',
    nombre: 'Complejo Deportivo Norte',
    ciudad: 'Lima',
    distrito: 'Los Olivos',
    direccion: 'Av. Las Palmeras 1234',
    rating: 4.8,
    precioBase: 90,
    fotos: ['https://example.com/norte1.jpg', 'https://example.com/norte2.jpg'],
    amenidades: ['Grass Sintético', 'Vestuarios', 'Estacionamiento'],
    canchas: [mockCourt1],
  };

  const mockDatabaseService = {
    sedes: signal([
      {
        id: 'venue-10',
        imagen_url: 'https://example.com/norte1.jpg',
        fotos: ['https://example.com/norte2.jpg'],
      },
    ]),
    cargarHorariosSede: vi.fn(async () => []),
    catalogLoading: catalogLoadingSignal,
    getVenueDetalle: vi.fn((id: string) => (id === 'venue-10' ? mockVenue : undefined)),
  };

  const mockReviewService = {
    getByVenue: vi.fn(() => of([])),
    publish: vi.fn(),
  };

  const mockAuthService = {
    currentUser: vi.fn<() => { id: string; nombre: string } | null>(() => null),
  };

  const mockMapsService = {
    getGoogleMapsDirectionsUrl: vi.fn(() => 'https://maps.google.com'),
    getEmbedMapUrl: vi.fn(() => 'https://maps.google.com/embed'),
  };

  let mockParamMap = convertToParamMap({ id: 'venue-10' });

  const mockActivatedRoute = {
    get paramMap() {
      return of(mockParamMap);
    },
    snapshot: {
      paramMap: {
        get: (key: string) => mockParamMap.get(key),
      },
    },
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    mockAuthService.currentUser.mockReturnValue(null);
    mockReviewService.getByVenue.mockReturnValue(of([]));
    catalogLoadingSignal.set(false);
    mockParamMap = convertToParamMap({ id: 'venue-10' });
    mockDatabaseService.getVenueDetalle.mockImplementation((id: string) =>
      id === 'venue-10' ? mockVenue : undefined,
    );

    await TestBed.configureTestingModule({
      imports: [Detalle],
      providers: [
        {
          provide: VenuePreferences,
          useFactory: () => {
            const favorites = signal(new Set<string>(['venue-20'])),
              alerts = signal(new Set<string>());
            return {
              favorites,
              alerts,
              busy: signal(new Set<string>()),
              loading: signal(false),
              error: signal(''),
              load: vi.fn(),
              toggleFavorite: async (id: string) => {
                favorites.update((s) => {
                  const n = new Set(s);
                  n.has(id) ? n.delete(id) : n.add(id);
                  return n;
                });
                return true;
              },
              toggleAlert: (id: string) => {
                alerts.update((s) => {
                  const n = new Set(s);
                  n.has(id) ? n.delete(id) : n.add(id);
                  return n;
                });
                return true;
              },
            };
          },
        },
        provideRouter([]),
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: ReviewService, useValue: mockReviewService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: MapsService, useValue: mockMapsService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute },
        CourtFilterService,
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(Detalle);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('Caso 1: Carga asíncrona del catálogo muestra skeleton y no emite mensaje falso de "No encontramos esa sede"', () => {
    catalogLoadingSignal.set(true);
    createComponent();

    expect(component['isLoading']()).toBe(true);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(element.textContent).not.toContain('No encontramos esa sede');
  });

  it('Caso 2: Sede válida renderiza cabecera, migas de pan, nombre, dirección y atributos auténticos', () => {
    catalogLoadingSignal.set(false);
    createComponent();

    expect(component['venue']()).toBeDefined();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Complejo Deportivo Norte');
    expect(text).toContain('Av. Las Palmeras 1234');
    expect(text).toContain('Los Olivos');
    expect(text).not.toContain('4.8');
    expect(text).toContain('Grass Sintético');
    expect(text).not.toContain('Instalación Verificada');
    expect(text).toContain('Sin reseñas todavía');
    // Nunca debe exhibir FIFA Quality inventado
    expect(text).not.toContain('FIFA Quality');
  });

  it('Caso 3: Selección de cancha (selectLosa) navega directamente a checkout con courtId explícito', () => {
    createComponent();
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    component['selectLosa'](mockCourt1);
    expect(navigateSpy).toHaveBeenCalledWith(['/checkout'], {
      queryParams: { courtId: 'court-101' },
    });
  });

  it('Caso 4: Botón de reserva principal (goToBookingFlow) navega a checkout con courtId de la cancha seleccionada', () => {
    createComponent();
    const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

    expect(component['selectedCourt']()).toBeUndefined();
    component['goToBookingFlow']();
    expect(navigateSpy).not.toHaveBeenCalled();
    component['selectedCourtId'].set('court-101');
    component['goToBookingFlow']();
    expect(navigateSpy).toHaveBeenCalledWith(['/checkout'], {
      queryParams: { courtId: 'court-101' },
    });
  });

  it('Caso 5: Hero carousel utiliza fotos realmente registradas', () => {
    createComponent();
    expect(component['currentHero']()).toBe('https://example.com/norte1.jpg');

    // Cambiar foto
    component['nextHeroImage']();
    expect(component['currentHero']()).toBe('https://example.com/norte2.jpg');
  });

  it('Caso 6: enlaza al dueño sin un botón para seguir a la sede', () => {
    createComponent();

    const notifBtn = [...fixture.nativeElement.querySelectorAll('button')].find((button: any) =>
      button.textContent.includes('Seguir'),
    );
    expect(notifBtn).toBeUndefined();
    expect(fixture.nativeElement.querySelector('app-owner-identity')).toBeTruthy();
  });

  it.each([401, 403, 409, 500])('keeps the opinion draft and modal on HTTP %s', (status) => {
    createComponent();
    mockAuthService.currentUser.mockReturnValue({ id: 'user-1', nombre: 'Jugador' });
    vi.spyOn(component as any, 'reservasJugadasDe').mockReturnValue([
      { id: 101, fecha: '2026-10-01' },
    ]);
    mockReviewService.publish.mockReturnValue(throwError(() => ({ status })));
    component['reviewModalOpen'].set(true);
    component['reviewText'].set('Esta opinion debe mantenerse como borrador');
    component['submitReview']();
    expect(component['reviews']()).toEqual([]);
    expect(component['reviewModalOpen']()).toBe(true);
    expect(component['reviewError']()).not.toBe('');
    expect(component['reviewSubmitting']()).toBe(false);
    expect(component['toastText']()).not.toContain('publicada');
  });

  it('ignores a pending publication after logout and blocks double submission', () => {
    createComponent();
    mockAuthService.currentUser.mockReturnValue({ id: 'user-1', nombre: 'Jugador' });
    vi.spyOn(component as any, 'reservasJugadasDe').mockReturnValue([
      { id: 101, fecha: '2026-10-01' },
    ]);
    const pending = new Subject<any>();
    mockReviewService.publish.mockReturnValue(pending);
    component['reviewText'].set('Una opinion para comprobar el cambio de sesion');
    component['submitReview']();
    component['submitReview']();
    expect(mockReviewService.publish).toHaveBeenCalledOnce();
    mockAuthService.currentUser.mockReturnValue(null);
    pending.next({ id: 'saved-1', puntuacion: 5, comentario: 'Guardada' });
    pending.complete();
    expect(component['reviews']()).toEqual([]);
    expect(component['toastText']()).not.toContain('publicada');
  });

  it('refuses to publish without a completed booking', () => {
    createComponent();
    mockAuthService.currentUser.mockReturnValue({ id: 'user-1', nombre: 'Jugador' });
    vi.spyOn(component as any, 'reservasJugadasDe').mockReturnValue([]);
    component['reviewText'].set('Una opinion sin reserva no debe publicarse');
    component['submitReview']();
    expect(mockReviewService.publish).not.toHaveBeenCalled();
    expect(component['reviewError']()).toContain('reserva completada');
  });

  it('publishes only the confirmed server response', () => {
    createComponent();
    mockAuthService.currentUser.mockReturnValue({ id: 'user-1', nombre: 'Jugador' });
    vi.spyOn(component as any, 'reservasJugadasDe').mockReturnValue([
      { id: 101, fecha: '2026-10-01' },
    ]);
    mockReviewService.publish.mockReturnValue(
      of({
        id: 'server-id',
        clienteNombre: 'Autor confirmado',
        puntuacion: 4,
        comentario: 'Texto confirmado',
      }),
    );
    component['reviewModalOpen'].set(true);
    component['reviewText'].set('Borrador enviado al servidor');
    component['submitReview']();
    expect(component['reviews']()[0]).toMatchObject({
      id: 'server-id',
      author: 'Autor confirmado',
      rating: 4,
      text: 'Texto confirmado',
    });
    expect(component['reviewModalOpen']()).toBe(false);
    expect(component['toastText']()).toContain('publicada');
  });

  it('shows a loading error instead of claiming there are no reviews', () => {
    mockReviewService.getByVenue.mockReturnValue(throwError(() => ({ status: 503 })));
    createComponent();
    expect(component['reviewsLoadError']()).not.toBe('');
    expect(fixture.nativeElement.textContent).not.toContain('Sin reseñas en esta sede');
    mockReviewService.getByVenue.mockReturnValue(of([]));
    component['retryReviews']();
    fixture.detectChanges();
    expect(component['reviewsLoadError']()).toBe('');
    expect(fixture.nativeElement.textContent).toContain('Sin reseñas en esta sede');
  });

  it('Caso 7: ID inexistente cuando no está cargando muestra mensaje claro de sede no encontrada', () => {
    catalogLoadingSignal.set(false);
    mockParamMap = convertToParamMap({ id: 'inexistente-999' });
    createComponent();

    expect(component['venue']()).toBeUndefined();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('No encontramos esa sede');
    expect(text).toContain('La sede que buscas no existe o ya no se encuentra disponible');
  });

  it('no inventa un mapa cuando la sede no tiene coordenadas', () => {
    createComponent();
    expect(component['coordinates']()).toBeNull();
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('todavía no ha configurado su punto');
  });

  it('una cancha en mantenimiento no navega a pago aunque se invoque directamente', () => {
    createComponent();
    const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component['selectLosa']({ ...mockCourt1, disponible: false });
    expect(navigate).not.toHaveBeenCalled();
  });

  it('si falla el horario, conserva el acceso a las canchas y permite reintentar', async () => {
    mockDatabaseService.cargarHorariosSede.mockRejectedValueOnce(new Error('offline'));
    createComponent();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos consultar el horario');
    expect(fixture.nativeElement.textContent).toContain('Elegir horario');
    expect(component['hoursLoading']()).toBe(false);
  });
});
