import { DOCUMENT } from '@angular/common';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { ThemeService } from '@core/theme/theme.service';

const THEMES = {
  light: { icon: 'light_mode', label: 'Claro', next: 'dark' },
  dark: { icon: 'dark_mode', label: 'Oscuro', next: 'system' },
  system: { icon: 'desktop_windows', label: 'Sistema', next: 'light' },
} as const;

type DeviceViewport = 'mobile' | 'tablet' | 'desktop';

@Component({
  imports: [MatButtonModule],
  selector: 'app-theme-toggle',
  template: `
    <button
      mat-icon-button
      disableRipple
      type="button"
      class="theme-toggle-btn"
      [attr.aria-label]="label()"
      [attr.title]="label()"
      (click)="cycle()"
    >
      <span class="material-symbols-outlined" aria-hidden="true">{{ currentIcon() }}</span>
    </button>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
    }
    button.theme-toggle-btn {
      appearance: none;
      display: inline-grid;
      place-items: center;
      inline-size: 32px;
      block-size: 32px;
      min-width: 32px;
      padding: 0;
      border: none;
      border-radius: 50%;
      background: transparent !important;
      box-shadow: none !important;
      --mat-icon-button-state-layer-color: transparent !important;
      --mat-icon-button-hover-state-layer-opacity: 0 !important;
      --mat-icon-button-focus-state-layer-opacity: 0 !important;
      --mat-icon-button-pressed-state-layer-opacity: 0 !important;
      color: inherit;
      cursor: pointer;
      transition: color 0.15s ease;
    }
    button.theme-toggle-btn:hover,
    button.theme-toggle-btn:focus,
    button.theme-toggle-btn:active {
      background: transparent !important;
      background-color: transparent !important;
      box-shadow: none !important;
      color: var(--color-brand-green, #27802d) !important;
    }
    ::ng-deep button.theme-toggle-btn .mat-mdc-button-persistent-ripple,
    ::ng-deep button.theme-toggle-btn .mat-ripple {
      display: none !important;
    }
    button.theme-toggle-btn span {
      font-size: 22px;
      line-height: 1;
    }
    button.theme-toggle-btn:focus-visible {
      outline: 2px solid var(--color-brand-green);
      outline-offset: 3px;
    }
  `,
})
export class ThemeToggle {
  private readonly theme = inject(ThemeService);
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly viewport = signal<DeviceViewport>(this.detectViewport());

  protected readonly current = computed(() => THEMES[this.theme.mode()]);
  protected readonly systemDeviceIcon = computed(() => {
    const vp = this.viewport();
    if (vp === 'mobile') return 'smartphone';
    if (vp === 'tablet') return 'tablet_mac';
    return 'desktop_windows';
  });
  protected readonly currentIcon = computed(() =>
    this.theme.mode() === 'system' ? this.systemDeviceIcon() : this.current().icon,
  );
  protected readonly label = computed(
    () =>
      'Tema actual: ' + this.current().label + '. Cambiar a ' + THEMES[this.current().next].label,
  );

  constructor() {
    const onResize = () => this.viewport.set(this.detectViewport());
    this.window?.addEventListener('resize', onResize, { passive: true });
    inject(DestroyRef).onDestroy(() => {
      this.window?.removeEventListener('resize', onResize);
    });
  }

  private detectViewport(): DeviceViewport {
    const width = this.window?.innerWidth ?? 1280;
    if (width <= 767) return 'mobile';
    if (width <= 1024) return 'tablet';
    return 'desktop';
  }

  protected cycle(): void {
    this.theme.set(this.current().next);
  }
}
