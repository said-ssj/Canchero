import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

type Theme = 'light' | 'dark' | 'system';
const STORAGE_KEY = 'canchero_theme';

function parseTheme(value: string | null): Theme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly media = this.window?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly preference = signal<Theme>(
    parseTheme(this.window?.localStorage.getItem(STORAGE_KEY) ?? null),
  );
  private readonly systemDark = signal(this.media?.matches ?? false);

  readonly mode = this.preference.asReadonly();
  readonly isDark = computed(() =>
    this.mode() === 'system' ? this.systemDark() : this.mode() === 'dark',
  );

  constructor() {
    const onSystemChange = (event: MediaQueryListEvent) => this.systemDark.set(event.matches);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null)
        this.preference.set(parseTheme(event.newValue));
    };
    this.media?.addEventListener('change', onSystemChange);
    this.window?.addEventListener('storage', onStorage);
    inject(DestroyRef).onDestroy(() => {
      this.media?.removeEventListener('change', onSystemChange);
      this.window?.removeEventListener('storage', onStorage);
    });
    effect(() => {
      const dark = this.isDark();
      this.document.documentElement.classList.toggle('dark-theme', dark);
      this.document.body?.classList.toggle('dark-theme', dark);
    });
  }

  set(mode: Theme): void {
    this.preference.set(mode);
    this.window?.localStorage.setItem(STORAGE_KEY, mode);
  }
}
