import { Injectable, computed, effect, inject } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { StaffService } from '@core/services/staff.service';
import { DatabaseService } from '@core/supabase/database.service';

@Injectable({ providedIn: 'root' })
export class AdminContext {
  private readonly auth = inject(AuthService);
  private readonly db = inject(DatabaseService);
  private readonly staff = inject(StaffService);

  readonly ownerId = computed(() => this.auth.currentUser()?.id ?? '');
  private readonly isStaff = computed(() => !!this.ownerId() && this.auth.isVenueStaff?.());

  /** Superadmin: todas las sedes. Dueño: las suyas. Personal: las que le asignaron. */
  readonly venues = computed(() =>
    this.ownerId() ? this.db.getSedesPorDueno(this.ownerId()) : [],
  );
  readonly venue = computed(() => {
    const venues = this.venues();
    const selected = this.db.sedeOperativaId?.();
    return venues.find((venue) => Number(venue.id) === Number(selected)) ?? venues[0];
  });
  readonly courts = computed(() => {
    const id = this.venue()?.id;
    return id ? this.db.getCanchasPorSede(id) : [];
  });
  readonly loading = computed(
    () => (this.db.catalogLoading?.() ?? false) || (this.isStaff() && !this.staff.mineLoaded()),
  );
  readonly error = computed(() => (this.db.loadErrors?.() ?? []).join(', '));

  /** Permisos en la sede elegida; null = sin límite (dueño o superadmin). */
  private readonly permisos = computed<Set<string> | null>(() => {
    if (!this.isStaff()) return null;
    const id = Number(this.venue()?.id);
    return new Set(
      this.staff
        .mine()
        .filter((a) => Number(a.sedeId) === id)
        .flatMap((a) => a.permisos),
    );
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.isStaff()) {
        this.staff.clearMine();
        return;
      }
      const request = this.staff.loadMine().subscribe({ error: () => undefined });
      onCleanup(() => request.unsubscribe());
    });
  }

  /** Solo oculta menús y botones; la API vuelve a comprobar cada acción. */
  can(...permisos: string[]): boolean {
    const p = this.permisos();
    return p === null || permisos.some((x) => p.has(x));
  }

  selectVenue(value: number | string): void {
    const id = Number(value);
    if (this.venues().some((venue) => Number(venue.id) === id)) this.db.setSedeOperativaId(id);
  }
}
