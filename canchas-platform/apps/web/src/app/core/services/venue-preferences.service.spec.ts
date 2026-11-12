import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { VenuePreferences } from './venue-preferences.service';

describe('Favoritos sincronizados y avisos locales', () => {
  function setup() {
    localStorage.clear();
    const user = signal<any>({ id: 'one' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: AuthService, useValue: { user } },
      ],
    });
    const service = TestBed.inject(VenuePreferences),
      http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    return { service, http, user };
  }
  it('confirma el guardado en API y no muestra éxito si falla', async () => {
    const { service, http } = setup();
    http.expectOne((r) => r.url.endsWith('/me/favorite-venues')).flush(['43']);
    await Promise.resolve();
    await Promise.resolve();
    expect(service.favorites().has('43')).toBe(true);
    const failed = service.toggleFavorite('44');
    http
      .expectOne((r) => r.method === 'PUT' && r.url.endsWith('/44'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(await failed).toBe(false);
    expect(service.favorites().has('44')).toBe(false);
    expect(service.error()).toContain('No se pudo guardar');
    http.verify();
  });
  it('no conserva favoritos ni respuestas tardías de otra cuenta y la campana no hace HTTP', async () => {
    const { service, http, user } = setup();
    const first = http.expectOne((r) => r.url.endsWith('/me/favorite-venues'));
    user.set({ id: 'two' });
    TestBed.tick();
    const second = http.expectOne((r) => r.url.endsWith('/me/favorite-venues'));
    second.flush(['44']);
    first.flush(['43']);
    await Promise.resolve();
    await Promise.resolve();
    expect([...service.favorites()]).toEqual(['44']);
    expect(service.toggleAlert('44')).toBe(true);
    expect(service.alerts().has('44')).toBe(true);
    http.expectNone((r) => r.url.includes('alert'));
    user.set(null);
    TestBed.tick();
    expect(service.alerts().size).toBe(0);
    expect(service.favorites().size).toBe(0);
    http.verify();
  });
});
