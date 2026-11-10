import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';

@Injectable({ providedIn: 'root' })
export class RecentSearchesService {
  private readonly auth = inject(AuthService);
  private readonly maxItems = 5;

  private get storageKey(): string {
    const userId = this.auth.user()?.id;
    return `canchero_recent_searches_${userId || 'guest'}`;
  }

  readonly recentSearches = signal<string[]>(this.loadFromStorage());

  constructor() {
    // Si cambia el usuario, recargar su historial
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', () => {
        this.recentSearches.set(this.loadFromStorage());
      });
    }
  }

  private loadFromStorage(): string[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.slice(0, this.maxItems) : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(items: string[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(items));
    } catch {}
  }

  add(term: string): void {
    const clean = term.trim();
    if (!clean) return;

    this.recentSearches.update((list) => {
      // Elimina si ya existía para ponerlo al principio
      const filtered = list.filter((item) => item.toLowerCase() !== clean.toLowerCase());
      const next = [clean, ...filtered].slice(0, this.maxItems);
      this.saveToStorage(next);
      return next;
    });
  }

  remove(term: string): void {
    this.recentSearches.update((list) => {
      const next = list.filter((item) => item !== term);
      this.saveToStorage(next);
      return next;
    });
  }

  clear(): void {
    this.recentSearches.set([]);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(this.storageKey);
      } catch {}
    }
  }
}
