import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';

/** Filtros de la campana en este navegador; separados por cuenta y sede. */
@Injectable({ providedIn: 'root' })
export class AdminAlertPreferences {
  private readonly auth = inject(AuthService);
  private readonly version = signal(0);
  private key(venue: string | number | null | undefined): string | null {
    const user = this.auth.currentUser()?.id;
    return user && venue ? `canchero_alertas:${user}:${venue}` : null;
  }
  get(venue: string | number | null | undefined): Record<string, boolean> {
    this.version();
    const defaults = { pagos: true, stock: true, reservas: false, contacto: false, resenas: false };
    const key = this.key(venue);
    try {
      const saved = key ? JSON.parse(localStorage.getItem(key) || '{}') : {};
      return { ...defaults, pagos: saved.pagos !== false, stock: saved.stock !== false };
    } catch {
      return defaults;
    }
  }
  set(venue: string | number | null | undefined, kind: string, value: boolean): boolean {
    const key = this.key(venue);
    if (!key || !['pagos', 'stock'].includes(kind)) return false;
    try {
      localStorage.setItem(key, JSON.stringify({ ...this.get(venue), [kind]: value }));
      this.version.update((n) => n + 1);
      return true;
    } catch {
      return false;
    }
  }
}
