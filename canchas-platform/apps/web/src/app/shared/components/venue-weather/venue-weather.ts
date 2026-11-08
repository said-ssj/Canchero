import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { WeatherService, VenueForecast, WeatherConditions } from '@core/services/weather.service';

export function weatherDescription(code: number, day: boolean): { icon: string; text: string } {
  if (code === 0) return { icon: day ? 'clear_day' : 'clear_night', text: 'Despejado' };
  if (code <= 3)
    return {
      icon: code === 3 ? 'cloud' : day ? 'partly_cloudy_day' : 'partly_cloudy_night',
      text: code === 3 ? 'Nublado' : 'Parcialmente nublado',
    };
  if (code <= 48) return { icon: 'foggy', text: 'Neblina' };
  if (code >= 95) return { icon: 'thunderstorm', text: 'Tormenta' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { icon: 'weather_snowy', text: 'Nieve' };
  return { icon: 'rainy', text: 'Lluvia' };
}

@Component({
  selector: 'app-venue-weather',
  template: `
    @if (conditions(); as c) {
      <div
        class="weather"
        [class.subtle]="subtle()"
        [attr.title]="description().text + ' · Pronóstico orientativo para la sede'"
      >
        <span class="material-symbols-outlined" aria-hidden="true">{{ description().icon }}</span>
        <div class="weather-copy">
          @if (!subtle()) {
            <span class="weather-label">{{
              date() ? 'Clima para tu partido' : 'Clima en la sede'
            }}</span>
          }
          <span class="weather-values"
            >{{ temperature() }} °C
            @if (!subtle()) {
              · {{ description().text }}
            }
            @if (c.rainProbability != null) {
              <span> · Lluvia {{ c.rainProbability }} %</span>
            }
          </span>
          @if (!subtle()) {
            <small
              >{{
                date() ? date() + ' · ' + c.time.slice(11, 16) : 'Condiciones actuales estimadas'
              }}
              ·
              <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer"
                >Open-Meteo</a
              >
            </small>
          }
        </div>
        @if (subtle()) {
          <a
            class="credit"
            href="https://open-meteo.com/"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Pronóstico de Open-Meteo"
            >Open-Meteo</a
          >
        }
      </div>
    } @else if (!subtle() && !loading()) {
      <p class="weather-unavailable">
        {{
          date()
            ? 'Pronóstico no disponible para este horario.'
            : 'Clima no disponible en este momento.'
        }}
      </p>
    }
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .weather {
      display: flex;
      align-items: center;
      width: fit-content;
      max-width: 100%;
      gap: 10px;
      padding: 12px;
      margin-block: 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      color: var(--ink);
    }
    .weather > .material-symbols-outlined {
      flex: none;
      font-size: 26px;
      color: var(--muted);
    }
    .weather-copy {
      display: grid;
      gap: 3px;
      min-width: 0;
    }
    .weather-label {
      font-size: 12px;
      color: var(--muted);
    }
    .weather-values {
      font-size: 14px;
      font-weight: 600;
    }
    small,
    .weather-unavailable {
      font-size: 11px;
      color: var(--muted);
    }
    a {
      color: inherit;
      text-decoration: underline;
    }
    .weather-unavailable {
      margin-block: 10px;
    }
    .subtle {
      border: 0;
      padding: 0;
      margin-block: 8px 0;
      gap: 6px;
      flex-wrap: wrap;
      color: var(--muted);
    }
    .subtle > .material-symbols-outlined {
      font-size: 17px;
    }
    .subtle .weather-values {
      font-size: 12px;
      font-weight: 400;
    }
    .credit {
      font-size: 10px;
    }
    :focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 2px;
    }
  `,
})
export class VenueWeather {
  readonly venueId = input<string | number | null | undefined>(null);
  readonly date = input<string | null | undefined>(null);
  readonly hour = input<string | number | null | undefined>(null);
  readonly subtle = input(false);
  private readonly weather = inject(WeatherService);
  readonly forecast = signal<VenueForecast | null>(null);
  readonly loading = signal(false);
  readonly conditions = computed<WeatherConditions | null>(() => {
    const f = this.forecast();
    if (!f?.available) return null;
    const date = this.date();
    if (!date) return f.current;
    const raw = String(this.hour() ?? '');
    const match = raw.match(/^\s*(\d{1,2})/);
    if (!match) return null;
    const hour = match[1].padStart(2, '0');
    return f.hourly.find((c) => c.time === `${date}T${hour}:00`) ?? null;
  });
  readonly temperature = computed(() => Math.round(this.conditions()?.temperature ?? 0));
  readonly description = computed(() =>
    weatherDescription(this.conditions()?.code ?? 0, this.conditions()?.day ?? true),
  );
  constructor() {
    effect((onCleanup) => {
      const venue = this.venueId();
      this.forecast.set(null);
      if (venue == null || venue === '') {
        this.loading.set(false);
        return;
      }
      this.loading.set(true);
      const subscription = this.weather.forecast(String(venue)).subscribe((f) => {
        this.forecast.set(f);
        this.loading.set(false);
      });
      onCleanup(() => subscription.unsubscribe());
    });
  }
}
