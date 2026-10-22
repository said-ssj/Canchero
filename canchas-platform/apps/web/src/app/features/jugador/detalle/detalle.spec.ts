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
    mockDatabaseService.getVenueDetalle.mockImplementation((id: string) => (id === 'venue-10' ? mockVenue : undefined));

    await TestBed.configureTestingModule({
      imports: [Detalle],
      providers: [
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
    expect(text).toContain('4.8');
    expect(text).toContain('Grass Sintético');
    expect(text).toContain('Instalación Verificada');
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

    component['goToBookingFlow']();
    expect(navigateSpy).toHaveBeenCalledWith(['/checkout'], {
      queryParams: { courtId: 'court-101' },
    });
  });

  it('Caso 5: Hero carousel utiliza fotos reales y fallbackVenueImg si no hay fotos', () => {
    createComponent();
    expect(component['currentHero']()).toBe('https://example.com/norte1.jpg');

    // Cambiar foto
    component['nextHeroImage']();
    expect(component['currentHero']()).toBe('https://example.com/norte2.jpg');
  });

  it('Caso 6: Botón de notificaciones de la cabecera está deshabilitado como función pendiente (disabled real)', () => {
    createComponent();

    const notifBtn = fixture.nativeElement.querySelector('button[aria-label="Notificaciones de horarios próximamente"]');
    expect(notifBtn).toBeTruthy();
    expect((notifBtn as HTMLButtonElement).disabled).toBe(true);
    expect((notifBtn as HTMLButtonElement).title).toContain('próximamente');
  });

  it.each([401, 403, 409, 500])('keeps the opinion draft and modal on HTTP %s', (status) => {
    createComponent();
    mockAuthService.currentUser.mockReturnValue({ id: 'user-1', nombre: 'Jugador' });
    vi.spyOn(component as any, 'reservasJugadasDe').mockReturnValue([{ id: 101, fecha: '2026-10-01' }]);
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
    vi.spyOn(component as any, 'reservasJugadasDe').mockReturnValue([{ id: 101, fecha: '2026-10-01' }]);
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
    vi.spyOn(component as any, 'reservasJugadasDe').mockReturnValue([{ id: 101, fecha: '2026-10-01' }]);
    mockReviewService.publish.mockReturnValue(of({ id: 'server-id', clienteNombre: 'Autor confirmado', puntuacion: 4, comentario: 'Texto confirmado' }));
    component['reviewModalOpen'].set(true);
    component['reviewText'].set('Borrador enviado al servidor');
    component['submitReview']();
    expect(component['reviews']()[0]).toMatchObject({ id: 'server-id', author: 'Autor confirmado', rating: 4, text: 'Texto confirmado' });
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
});
