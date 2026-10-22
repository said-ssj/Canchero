import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { Sedes } from './sedes';
import { DatabaseService } from '@core/supabase/database.service';
import { CourtFilterService } from '@core/services/court-filter.service';
import { MapsService } from '@core/services/maps.service';
import type { Venue } from '@shared/models/venue.model';

describe('Sedes Component - Fase 7: Diseño y Verificación Integral', () => {
  let fixture: ComponentFixture<Sedes>;
  let component: Sedes;

  const catalogLoadingSignal = signal(false);

  const mockVenues: Venue[] = [
    {
      id: 'venue-10',
      nombre: 'Complejo Deportivo Norte',
      ciudad: 'Lima',
      distrito: 'Los Olivos',
      direccion: 'Av. Las Palmeras 1234',
      rating: 4.8,
      precioBase: 90,
      favorita: false,
      fotos: ['https://example.com/norte.jpg'],
      amenidades: ['Estacionamiento', 'Vestuarios', 'Iluminación'],
      canchas: [
        {
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
        },
      ],
    },
    {
      id: 'venue-20',
      nombre: 'Arena Gol Sur',
      ciudad: 'Lima',
      distrito: 'Surco',
      direccion: 'Av. Benavides 4567',
      rating: 4.6,
      precioBase: 140,
      favorita: true,
      fotos: [],
      amenidades: ['Cafetería', 'Tribuna'],
      canchas: [
        {
          id: 'court-202',
          id_cancha: 202,
          id_sede: 20,
          nombre: 'Cancha Central Sur',
          tipo: 'Fútbol 7',
          formato: 'Fútbol 7',
          superficie: 'Grass Sintético',
          cobertura: 'Al Aire Libre',
          precioHora: 140,
          disponible: false,
        },
      ],
    },
  ];

  const mockDatabaseService = {
    catalogLoading: catalogLoadingSignal,
    getVenuesPublicos: vi.fn(() => mockVenues),
  };

  const mockMapsService = {
    getGoogleMapsDirectionsUrl: vi.fn((lat: number, lng: number) => `https://maps.google.com/?daddr=${lat},${lng}`),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    catalogLoadingSignal.set(false);
    mockDatabaseService.getVenuesPublicos.mockReturnValue(mockVenues);

    await TestBed.configureTestingModule({
      imports: [Sedes],
      providers: [
        provideRouter([]),
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: MapsService, useValue: mockMapsService },
        CourtFilterService,
      ],
    }).compileComponents();
  });

  function createComponent(): void {
    fixture = TestBed.createComponent(Sedes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('Caso 1: Carga asíncrona del catálogo muestra skeletons estáticos y no emite falso vacío', () => {
    catalogLoadingSignal.set(true);
    createComponent();

    expect(component['isLoading']()).toBe(true);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('[aria-busy="true"]')).toBeTruthy();
    expect(element.textContent).not.toContain('No encontramos sedes');
  });

  it('Caso 2: Una vez cargado el catálogo, renderiza las tarjetas de sede con sus atributos reales', () => {
    catalogLoadingSignal.set(false);
    createComponent();

    expect(component['isLoading']()).toBe(false);
    expect(component['filteredVenues']().length).toBe(2);

    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Complejo Deportivo Norte');
    expect(text).toContain('Arena Gol Sur');
    expect(text).toContain('Los Olivos, Lima');
    expect(text).toContain('1 canchas libres');
  });

  it('Caso 3: Filtro por ciudad y distrito actualiza reactivamente la lista de sedes', () => {
    createComponent();

    component['ciudad'].set('Lima');
    component['distrito'].set('Surco');
    fixture.detectChanges();

    const filtered = component['filteredVenues']();
    expect(filtered.length).toBe(1);
    expect(filtered[0].nombre).toBe('Arena Gol Sur');
  });

  it('Caso 4: Búsqueda por texto filtra por nombre, distrito o amenidad', () => {
    createComponent();

    component['busqueda'].set('Palmeras');
    fixture.detectChanges();

    const filtered = component['filteredVenues']();
    expect(filtered.length).toBe(1);
    expect(filtered[0].nombre).toBe('Complejo Deportivo Norte');
  });

  it('Caso 5: Pestaña "Mis Favoritas" filtra las sedes marcadas y botón favorito conmuta estado', () => {
    createComponent();

    // venue-20 iniciaba con favorita=true
    expect(component['favorites']().has('venue-20')).toBe(true);
    expect(component['countFav']()).toBe(1);

    component['selectView']('fav');
    fixture.detectChanges();

    expect(component['filteredVenues']().length).toBe(1);
    expect(component['filteredVenues']()[0].id).toBe('venue-20');

    // Conmuta favorito de venue-10
    const mockEvent = { stopPropagation: vi.fn() } as unknown as Event;
    component['toggleFav'](mockEvent, 'venue-10');
    fixture.detectChanges();

    expect(component['favorites']().has('venue-10')).toBe(true);
    expect(component['countFav']()).toBe(2);
  });

  it('Caso 6: Botón de notificaciones en tarjeta está deshabilitado como función pendiente (disabled real)', () => {
    createComponent();

    const alertButtons = fixture.nativeElement.querySelectorAll('.alert-btn');
    expect(alertButtons.length).toBeGreaterThan(0);
    for (const btn of Array.from(alertButtons)) {
      expect((btn as HTMLButtonElement).disabled).toBe(true);
      expect((btn as HTMLButtonElement).title).toContain('próximamente');
    }
  });

  it('Caso 7: Fallback de imagen previene imágenes rotas ante fotos faltantes o errores de carga', () => {
    createComponent();

    const mockImg = document.createElement('img');
    mockImg.src = 'https://broken.example.com/foto.jpg';
    const mockErrorEvent = { target: mockImg } as unknown as Event;

    component['onImgError'](mockErrorEvent);
    expect(mockImg.getAttribute('src')).toBe(component['fallbackVenueImg']);
    component['onImgError'](mockErrorEvent);
    expect(mockImg.getAttribute('src')).toBe(component['fallbackVenueImg']);
  });

  it('mantiene favoritos pendientes deshabilitados sin simular guardado', () => {
    createComponent();
    const buttons = fixture.nativeElement.querySelectorAll('.fav-btn') as NodeListOf<HTMLButtonElement>;
    expect(buttons.length).toBe(2);
    buttons.forEach(button => {
      expect(button.disabled).toBe(true);
      button.click();
    });
    expect(component['countFav']()).toBe(1);
  });

  it('no inventa una ruta para sedes sin coordenadas validas', () => {
    createComponent();
    expect(component['hasVenueCoordinates'](mockVenues[0])).toBe(false);
    expect(component['hasVenueCoordinates']({ ...mockVenues[0], latitud: -14, longitud: -75 })).toBe(true);
    expect(component['hasVenueCoordinates']({ ...mockVenues[0], latitud: 100, longitud: -75 })).toBe(false);
    const route = fixture.nativeElement.querySelector('.venue-body button[title="La sede no tiene una ubicación registrada"]') as HTMLButtonElement;
    expect(route.disabled).toBe(true);
  });

  it('Caso 8: Búsqueda sin coincidencias muestra estado de búsqueda vacía con botón para restablecer', () => {
    createComponent();

    component['busqueda'].set('TextoQueNoExisteEnNingunLado999');
    fixture.detectChanges();

    expect(component['filteredVenues']().length).toBe(0);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('No encontramos sedes con ese criterio');

    // Restablecer filtros
    component['resetFilters']();
    fixture.detectChanges();

    expect(component['filteredVenues']().length).toBe(2);
    expect(component['busqueda']()).toBe('');
  });
});
