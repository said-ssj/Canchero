import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';
import { of } from 'rxjs';
import { VenueWeather, weatherDescription } from './venue-weather';
import { WeatherService } from '@core/services/weather.service';

describe('Clima discreto de la reserva', () => {
  const forecast = {
    updatedAt: '2026-11-07T19:00:00Z',
    available: true,
    current: {
      time: '2026-11-07T14:00',
      temperature: 24,
      code: 0,
      day: true,
      rainProbability: null,
    },
    hourly: [
      { time: '2026-11-08T18:00', temperature: 19.4, code: 3, day: false, rainProbability: 15 },
    ],
  };
  function setup(date?: string, subtle = false) {
    TestBed.configureTestingModule({
      imports: [VenueWeather],
      providers: [{ provide: WeatherService, useValue: { forecast: () => of(forecast) } }],
    });
    const f = TestBed.createComponent(VenueWeather);
    f.componentRef.setInput('venueId', '54');
    f.componentRef.setInput('date', date);
    f.componentRef.setInput('hour', '18:00 - 20:00');
    f.componentRef.setInput('subtle', subtle);
    f.detectChanges();
    return f;
  }
  it('muestra el pronóstico de la fecha y hora elegidas, sin usar el clima actual', () => {
    const f = setup('2026-11-08');
    expect(f.nativeElement.textContent).toContain('19 °C');
    expect(f.nativeElement.textContent).toContain('Lluvia 15 %');
    expect(f.nativeElement.textContent).not.toContain('24 °C');
  });
  it('en itinerario no crea tarjeta, aviso ni espacio cuando no hay pronóstico', () => {
    const f = setup('2026-12-01', true);
    expect(f.nativeElement.textContent.trim()).toBe('');
    expect(f.nativeElement.querySelector('[role=alert]')).toBeNull();
  });
  it('usa una sola línea discreta sin el título del panel en el itinerario', () => {
    const f = setup('2026-11-08', true);
    expect(f.nativeElement.querySelector('.subtle')).not.toBeNull();
    expect(f.nativeElement.querySelector('.weather-label')).toBeNull();
    expect(f.nativeElement.textContent).toContain('19 °C');
  });
  it('distingue el sol de la noche y las tormentas', () => {
    expect(weatherDescription(0, false).icon).toBe('clear_night');
    expect(weatherDescription(95, true).icon).toBe('thunderstorm');
  });
  it('no muestra un porcentaje vacío si la API omite la lluvia actual', () => {
    const f = setup();
    const current = { ...forecast.current } as any;
    delete current.rainProbability;
    f.componentInstance.forecast.set({ ...forecast, current });
    f.detectChanges();
    expect(f.nativeElement.textContent).not.toContain('Lluvia');
  });
});
