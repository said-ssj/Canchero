import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';

@Component({
  selector: 'app-managed-venue-profiles',
  imports: [RouterLink],
  template: `
    <section aria-labelledby="managed-profiles-title">
      <span class="material-symbols-outlined" aria-hidden="true">storefront</span>
      <h2 id="managed-profiles-title">Perfiles de sede</h2>
      <p>
        Tu cuenta es personal. Cada sede tiene su propio perfil público para reservar y consultar
        sus instalaciones.
      </p>
      @if (db.catalogLoading()) {
        <p role="status">Consultando tus sedes…</p>
      } @else if (db.catalogError()) {
        <p>No pudimos consultar tus sedes.</p>
        <button class="btn outline" type="button" (click)="db.refreshCatalogo()">Reintentar</button>
      } @else if (venues().length) {
        <label for="managed-profile">Sede</label>
        <select
          id="managed-profile"
          [value]="selected()?.id"
          (change)="selectedId.set($any($event.target).value)"
        >
          @for (venue of venues(); track venue.id) {
            <option [value]="venue.id">{{ venue.nombre }}</option>
          }
        </select>
        @if (selected(); as venue) {
          <a class="btn primary" [routerLink]="['/sedes', venue.id]"
            >Ver perfil público<span class="material-symbols-outlined" aria-hidden="true"
              >arrow_outward</span
            ></a
          >
        }
      } @else {
        <p>Todavía no tienes una sede publicada.</p>
      }
      <a class="admin-link" routerLink="/admin/sedes">Administrar sedes</a>
    </section>
  `,
  styles: `
    section {
      display: grid;
      gap: 12px;
    }
    h2 {
      font-size: 16px;
      margin: 0;
    }
    p,
    label,
    select,
    a {
      font-size: 12px;
    }
    p {
      color: var(--muted);
    }
    select {
      min-width: 0;
      width: 100%;
      background: var(--surface);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 8px;
    }
    .material-symbols-outlined {
      color: var(--color-success-700, #25832a);
      font-size: 20px;
    }
    .primary .material-symbols-outlined {
      color: inherit;
    }
    .admin-link {
      color: var(--color-success-700, #25832a);
    }
  `,
})
export class ManagedVenueProfiles {
  protected readonly db = inject(DatabaseService);
  private readonly auth = inject(AuthService);
  protected readonly selectedId = signal('');
  protected readonly venues = computed(() => {
    const user = this.auth.user();
    if (!user || !this.auth.isOwner()) return [];
    const allowed = new Set(this.db.getSedesPorDueno(user.id).map((venue) => String(venue.id)));
    // Intersect with the actual loaded catalogue; never expose local drafts as public venues.
    return this.db.sedes().filter((venue) => venue.activo && allowed.has(String(venue.id)));
  });
  protected readonly selected = computed(
    () =>
      this.venues().find((venue) => String(venue.id) === this.selectedId()) ??
      this.venues().find((venue) => Number(venue.id) === this.db.sedeOperativaId()) ??
      this.venues()[0],
  );
}
