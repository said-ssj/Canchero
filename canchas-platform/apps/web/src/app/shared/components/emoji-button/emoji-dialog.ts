import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  ViewChild,
  effect,
  inject,
  signal,
} from '@angular/core';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { ThemeService } from '@core/theme/theme.service';
@Component({
  imports: [MatDialogModule],
  template: `<header>
      <h2 mat-dialog-title>Emojis</h2>
      <button
        type="button"
        class="icon-only"
        mat-dialog-close
        aria-label="Cerrar selector de emojis"
      >
        <span class="material-symbols-outlined">close</span>
      </button>
    </header>
    <mat-dialog-content
      ><div #pickerHost></div>
      @if (loading()) {
        <p role="status">Cargando emojis…</p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
    </mat-dialog-content>`,
  styles: [
    `
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding-right: 20px;
      }
      h2 {
        font-size: 18px;
      }
      .icon-only {
        display: inline-flex;
        width: 22px;
        height: 22px;
        align-items: center;
        justify-content: center;
        background: transparent;
        border: 0;
        padding: 0;
        color: var(--color-ink-900);
        cursor: pointer;
      }
      .icon-only span {
        font-size: 22px;
      }
      .icon-only:focus-visible {
        outline: 2px solid var(--color-brand-green);
        outline-offset: 3px;
      }
      mat-dialog-content {
        padding: 0 12px 12px !important;
        max-height: 70dvh;
      }
      p {
        padding: 12px;
        color: var(--color-ink-600);
      }
    `,
  ],
})
export class EmojiDialog implements AfterViewInit {
  @ViewChild('pickerHost', { static: true }) private host!: ElementRef<HTMLElement>;
  private readonly dialog = inject(MatDialogRef<EmojiDialog, string>);
  private readonly destroy = inject(DestroyRef);
  private readonly theme = inject(ThemeService);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private picker?: HTMLElement;
  private dead = false;
  constructor() {
    effect(() => {
      const dark = this.theme.isDark();
      this.picker?.classList.toggle('dark', dark);
      this.picker?.classList.toggle('light', !dark);
    });
    this.destroy.onDestroy(() => {
      this.dead = true;
      this.picker?.remove();
    });
  }
  async ngAfterViewInit() {
    try {
      const [{ Picker }, { default: i18n }] = await Promise.all([
        import('emoji-picker-element'),
        import('emoji-picker-element/i18n/es'),
      ]);
      if (this.dead) return;
      const picker = new Picker({
        locale: 'es',
        i18n,
        dataSource: new URL('assets/emojis/data.json', document.baseURI).href,
      });
      picker.style.cssText =
        'width:100%;height:min(380px,55dvh);--background:var(--color-surface);--border-color:var(--color-border);--border-radius:6px;--button-hover-background:transparent;--button-active-background:var(--color-border);--outline-color:var(--color-brand-green);--indicator-color:var(--color-brand-green);--input-border-color:var(--color-border);--input-border-radius:6px;';
      picker.classList.add(this.theme.isDark() ? 'dark' : 'light');
      picker.addEventListener('emoji-click', (event) => {
        if (event.detail.unicode) this.dialog.close(event.detail.unicode);
      });
      this.picker = picker;
      this.host.nativeElement.append(picker);
      this.loading.set(false);
    } catch {
      if (!this.dead) {
        this.loading.set(false);
        this.error.set('No pudimos abrir el selector de emojis. Cierra y vuelve a intentarlo.');
      }
    }
  }
}
