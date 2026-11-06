import { Component, computed, inject } from '@angular/core';
import { ThemeService } from '@core/theme/theme.service';

const THEMES = {
  light: { icon: 'light_mode', label: 'Claro', next: 'dark' },
  dark: { icon: 'dark_mode', label: 'Oscuro', next: 'system' },
  system: { icon: 'desktop_windows', label: 'Sistema', next: 'light' },
} as const;

@Component({
  selector: 'app-theme-toggle',
  template: `
    <button type="button" [attr.aria-label]="label()" [attr.title]="label()" (click)="cycle()">
      <span class="material-symbols-outlined" aria-hidden="true">{{ current().icon }}</span>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    button {
      appearance: none;
      display: inline-grid;
      place-items: center;
      inline-size: 24px;
      block-size: 24px;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      cursor: pointer;
    }
    button span {
      font-size: 24px;
      line-height: 1;
    }
    button:focus-visible {
      outline: 2px solid var(--color-brand-green);
      outline-offset: 3px;
    }
  `,
})
export class ThemeToggle {
  private readonly theme = inject(ThemeService);
  protected readonly current = computed(() => THEMES[this.theme.mode()]);
  protected readonly label = computed(
    () =>
      'Tema actual: ' + this.current().label + '. Cambiar a ' + THEMES[this.current().next].label,
  );

  protected cycle(): void {
    this.theme.set(this.current().next);
  }
}
