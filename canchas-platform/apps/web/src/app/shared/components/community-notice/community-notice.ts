import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { ChatService, CommunityRestriction } from '@core/services/chat.service';
@Component({
  selector: 'app-community-notice',
  imports: [CommonModule],
  template: `@if (status()?.restricted) {
      <aside role="alert">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        <div>
          <strong>Mensajes y publicaciones restringidos temporalmente</strong>
          <p>
            Tu cuenta está en revisión por reportes de distintas personas. Hasta
            {{ status()?.until | date: 'd MMM, HH:mm' }} no puedes enviar mensajes ni publicar. Tus
            reservas y pases siguen disponibles.
          </p>
        </div>
      </aside>
    } @else if (status()?.underReview) {
      <aside role="status">
        <span class="material-symbols-outlined" aria-hidden="true">info</span>
        <p>Hay una revisión de seguridad en curso. No implica una sanción confirmada.</p>
      </aside>
    }`,
  styles: [
    `
      aside {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px 20px;
        background: var(--color-surface);
        color: var(--color-ink-900);
        border-bottom: 1px solid var(--color-border);
        font-size: 13px;
      }
      p {
        margin: 4px 0 0;
      }
      .material-symbols-outlined {
        font-size: 20px;
        flex-shrink: 0;
      }
    `,
  ],
})
export class CommunityNotice {
  private readonly auth = inject(AuthService);
  private readonly api = inject(ChatService);
  private readonly destroy = inject(DestroyRef);
  protected readonly status = signal<CommunityRestriction | null>(null);
  private generation = 0;
  constructor() {
    effect((onCleanup) => {
      const id = this.auth.user()?.id;
      const generation = ++this.generation;
      this.status.set(null);
      if (!id) return;
      const load = async () => {
        if (document.visibilityState !== 'visible') return;
        try {
          const status = await firstValueFrom(this.api.status());
          if (generation === this.generation && this.auth.user()?.id === id)
            this.status.set(status);
        } catch {
          /* No inventar un estado ante fallos de red. */
        }
      };
      void load();
      const timer = setInterval(() => void load(), 60000);
      onCleanup(() => {
        clearInterval(timer);
        this.generation++;
      });
    });
    this.destroy.onDestroy(() => this.generation++);
  }
}
