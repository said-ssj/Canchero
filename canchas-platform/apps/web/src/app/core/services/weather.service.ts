import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of, shareReplay } from 'rxjs';
import { environment } from '@env/environment';

export interface WeatherConditions {
  time: string;
  temperature: number;
  code: number;
  day: boolean;
  rainProbability: number | null;
}
export interface VenueForecast {
  available: boolean;
  updatedAt: string | null;
  current: WeatherConditions | null;
  hourly: WeatherConditions[];
}
@Injectable({ providedIn: 'root' })
export class WeatherService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<
    string,
    { expires: number; value: Observable<VenueForecast | null> }
  >();
  forecast(venue: string): Observable<VenueForecast | null> {
    if (!/^\d+$/.test(venue)) return of(null);
    const previous = this.cache.get(venue);
    if (previous && previous.expires > Date.now()) return previous.value;
    if (this.cache.size >= 128) this.cache.delete(this.cache.keys().next().value!);
    const value = this.http
      .get<VenueForecast>(`${environment.apiUrl}/venues/${venue}/weather`)
      .pipe(
        catchError(() => of(null)),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.cache.set(venue, { expires: Date.now() + 20 * 60 * 1000, value });
    return value;
  }
}
