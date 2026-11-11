import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { describe, it, expect } from 'vitest';
import { SearchService } from './search.service';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
describe('Búsqueda con fuentes reales', () => {
  function setup() {
    let venues: any[] = [
      {
        id: '10',
        nombre: 'Cancha Mundial',
        ciudad: 'Ica',
        distrito: 'Ica',
        direccion: 'Av. Real',
        ownerId: 'owner-1',
        canchas: [{ id: '101', nombre: 'Principal', tipo: 'Fútbol 7' }],
      },
    ];
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        SearchService,
        { provide: DatabaseService, useValue: { getVenuesPublicos: () => venues } },
        {
          provide: AuthService,
          useValue: { user: signal({ id: 'actual', nombre: 'Persona actual' }) },
        },
      ],
    });
    return {
      service: TestBed.inject(SearchService),
      http: TestBed.inject(HttpTestingController),
      setVenues: (v: any[]) => (venues = v),
    };
  }
  it('no inventa dueños ni identificadores y conserva datos devueltos por la API', async () => {
    const { service, http } = setup();
    const result = firstValueFrom(service.search('mundial', false, true));
    http
      .expectOne((r) => r.url.endsWith('/community/profiles/search'))
      .flush([
        {
          id: 'real',
          name: 'Persona Real',
          role: 'Jugador',
          photo: 'https://example.test/avatar.jpg',
          handle: null,
        },
      ]);
    const r = await result;
    expect(r.personas).toEqual([
      {
        id: 'real',
        nombre: 'Persona Real',
        username: '',
        foto: 'https://example.test/avatar.jpg',
        rol: 'Jugador',
        isCurrentUser: false,
      },
    ]);
    expect(r.sedes).toHaveLength(1);
    expect(r.personas.some((p) => p.id === 'owner-1')).toBe(false);
    http.verify();
  });
  it('actualiza el índice al renombrar una sede sin cambiar el número de sedes', async () => {
    const { service, http, setVenues } = setup();
    let result = firstValueFrom(service.search('mundial'));
    http.expectOne((r) => r.url.endsWith('/profiles/search')).flush([]);
    expect((await result).totalSedes).toBe(1);
    setVenues([{ id: '10', nombre: 'Nombre cambiado', canchas: [] }]);
    result = firstValueFrom(service.search('mundial'));
    http.expectOne((r) => r.url.endsWith('/profiles/search')).flush([]);
    expect((await result).totalSedes).toBe(0);
    http.verify();
  });
  it('distingue un fallo de personas de una búsqueda sin resultados y mantiene sedes', async () => {
    const { service, http } = setup();
    const result = firstValueFrom(service.search('mundial'));
    http
      .expectOne((r) => r.url.endsWith('/profiles/search'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    const r = await result;
    expect(r.personasError).toBe(true);
    expect(r.totalSedes).toBe(1);
    expect(r.personas).toEqual([]);
    http.verify();
  });
});
