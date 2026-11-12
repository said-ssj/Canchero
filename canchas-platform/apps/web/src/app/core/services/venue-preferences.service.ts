import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';

@Injectable({ providedIn: 'root' })
export class VenuePreferences {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  readonly favorites = signal(new Set<string>());
  readonly alerts = signal(new Set<string>());
  readonly busy = signal(new Set<string>());
  readonly loading = signal(false);
  readonly error = signal('');
  private generation = 0;
  private alertKey() {
    return `canchero_venue_alerts:${this.auth.user()?.id || 'guest'}`;
  }
  constructor() {
    effect(() => {
      const id = this.auth.user()?.id;
      untracked(() => {
        this.generation++;
        this.favorites.set(new Set());
        this.busy.set(new Set());
        this.error.set('');
        try {
          const stored = JSON.parse(localStorage.getItem(this.alertKey()) || '[]');
          this.alerts.set(
            new Set(Array.isArray(stored) ? stored.filter((v) => typeof v === 'string') : []),
          );
        } catch {
          this.alerts.set(new Set());
        }
        if (id) void this.load();
        else this.loading.set(false);
      });
    });
  }
  async load() {
    const user = this.auth.user()?.id;
    if (!user) return;
    const gen = ++this.generation;
    this.loading.set(true);
    this.error.set('');
    try {
      const ids = await firstValueFrom(
        this.http.get<string[]>(environment.apiUrl + '/me/favorite-venues').pipe(timeout(15000)),
      );
      if (gen === this.generation && user === this.auth.user()?.id)
        this.favorites.set(new Set(ids));
    } catch {
      if (gen === this.generation) this.error.set('No se pudieron cargar tus favoritos.');
    } finally {
      if (gen === this.generation) this.loading.set(false);
    }
  }
  async toggleFavorite(id: string): Promise<boolean> {
    if (!this.auth.user()?.id) {
      void this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return false;
    }
    if (this.loading() || this.error() || this.busy().has(id)) return false;
    const user = this.auth.user()!.id,
      gen = this.generation,
      remove = this.favorites().has(id);
    this.busy.update((s) => new Set([...s, id]));
    try {
      const url = environment.apiUrl + '/me/favorite-venues/' + encodeURIComponent(id);
      await firstValueFrom(
        (remove ? this.http.delete<void>(url) : this.http.put<void>(url, {})).pipe(timeout(15000)),
      );
      if (user !== this.auth.user()?.id || gen !== this.generation) return false;
      this.favorites.update((s) => {
        const next = new Set(s);
        remove ? next.delete(id) : next.add(id);
        return next;
      });
      return true;
    } catch {
      if (gen === this.generation)
        this.error.set('No se pudo guardar el favorito. Reintenta la carga.');
      return false;
    } finally {
      if (gen === this.generation)
        this.busy.update((s) => {
          const next = new Set(s);
          next.delete(id);
          return next;
        });
    }
  }
  toggleAlert(id: string): boolean {
    const next = new Set(this.alerts());
    next.has(id) ? next.delete(id) : next.add(id);
    try {
      localStorage.setItem(this.alertKey(), JSON.stringify([...next]));
      this.alerts.set(next);
      return true;
    } catch {
      return false;
    }
  }
}
