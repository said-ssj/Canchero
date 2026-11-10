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
  private readonly mediaDark = this.window?.matchMedia?.('(prefers-color-scheme: dark)');
  private readonly mediaLight = this.window?.matchMedia?.('(prefers-color-scheme: light)');
  private readonly preference = signal<Theme>(
    parseTheme(this.window?.localStorage.getItem(STORAGE_KEY) ?? null),
  );
  private readonly systemDark = signal(this.resolveSystemDark());

  readonly mode = this.preference.asReadonly();
  readonly isDark = computed(() =>
    this.mode() === 'system' ? this.systemDark() : this.mode() === 'dark',
  );

  constructor() {
    const syncSystemTheme = () => this.systemDark.set(this.resolveSystemDark());
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        this.preference.set(parseTheme(event.newValue));
        syncSystemTheme();
      }
    };
    this.mediaDark?.addEventListener('change', syncSystemTheme);
    this.mediaLight?.addEventListener('change', syncSystemTheme);
    this.window?.addEventListener('storage', onStorage);
    this.window?.addEventListener('focus', syncSystemTheme);
    this.document.addEventListener('visibilitychange', syncSystemTheme);
    inject(DestroyRef).onDestroy(() => {
      this.mediaDark?.removeEventListener('change', syncSystemTheme);
      this.mediaLight?.removeEventListener('change', syncSystemTheme);
      this.window?.removeEventListener('storage', onStorage);
      this.window?.removeEventListener('focus', syncSystemTheme);
      this.document.removeEventListener('visibilitychange', syncSystemTheme);
    });
    effect(() => {
      const dark = this.isDark();
      this.document.documentElement.classList.toggle('dark-theme', dark);
      this.document.body?.classList.toggle('dark-theme', dark);
      this.document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
    });
  }

  private resolveSystemDark(): boolean {
    if (!this.window?.matchMedia) return false;
    if (this.window.matchMedia('(prefers-color-scheme: light)').matches) {
      return false;
    }
    return this.window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  set(mode: Theme): void {
    if (mode === 'system') {
      this.systemDark.set(this.resolveSystemDark());
    }
    this.preference.set(mode);
    this.window?.localStorage.setItem(STORAGE_KEY, mode);
  }
}
