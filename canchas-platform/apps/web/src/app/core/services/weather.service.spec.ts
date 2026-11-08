import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect } from 'vitest';
import { WeatherService } from './weather.service';
describe('Consultas compartidas del clima', () => {
  it('consulta una sola vez la sede al usarla en varias reservas y tolera errores', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const service = TestBed.inject(WeatherService),
      http = TestBed.inject(HttpTestingController);
    const results: unknown[] = [];
    service.forecast('54').subscribe((x) => results.push(x));
    service.forecast('54').subscribe((x) => results.push(x));
    http
      .expectOne((r) => r.url.endsWith('/venues/54/weather'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    expect(results).toEqual([null, null]);
    http.verify();
  });
});
