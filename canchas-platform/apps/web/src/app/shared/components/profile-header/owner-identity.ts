import { Component, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { CommunityProfileService } from '@core/services/community-profile.service';
@Component({
  selector: 'app-owner-identity',
  imports: [RouterLink],
  template: `@if (owner(); as user) {
    <a [routerLink]="['/perfiles', user.id]">
      @if (user.photo && !broken()) {
        <img [src]="user.photo" [alt]="'Foto de ' + user.name" (error)="broken.set(true)" />
      } @else {
        <span class="owner-initials">{{ initials(user.name) }}</span>
      }
      <span
        ><small>Perfil del dueño</small><strong>{{ user.name }}</strong></span
      ><span class="material-symbols-outlined" aria-hidden="true">arrow_forward</span></a
    >
  }`,
  styles: `
    :host {
      display: block;
      flex-basis: 100%;
      margin-top: 8px;
    }
    a {
      display: inline-flex;
      gap: 9px;
      align-items: center;
      color: var(--ink);
      text-decoration: none;
      font-size: 12px;
    }
    img,
    .owner-initials {
      width: 36px;
      height: 36px;
      object-fit: cover;
      border-radius: 50%;
      flex-shrink: 0;
    }
    .owner-initials {
      display: grid;
      place-items: center;
      background: #15803d;
      color: white;
      font-size: 12px;
      font-weight: 700;
    }
    small {
      display: block;
      color: var(--muted);
      font-size: 10px;
    }
    .material-symbols-outlined {
      font-size: 16px;
    }
    a:focus-visible {
      outline: 2px solid var(--primary);
      outline-offset: 3px;
    }
  `,
})
export class OwnerIdentity {
  readonly venueId = input.required<string>();
  private readonly api = inject(CommunityProfileService);
  protected readonly owner = signal<{ id: string; name: string; photo: string | null } | null>(
    null,
  );
  protected readonly broken = signal(false);
  private request = 0;
  constructor() {
    effect(() => {
      void this.load(this.venueId());
    });
  }
  private async load(id: string) {
    const request = ++this.request;
    this.owner.set(null);
    this.broken.set(false);
    try {
      const owner = await firstValueFrom(this.api.owner(id));
      if (request === this.request) this.owner.set(owner);
    } catch {
      if (request === this.request) this.owner.set(null);
    }
  }
  protected initials(name: string) {
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'U'
    );
  }
}
