import { Injectable, computed, inject } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';

@Injectable({ providedIn: 'root' })
export class AdminContext {
  private readonly auth = inject(AuthService);
  private readonly db = inject(DatabaseService);

  readonly ownerId = computed(() => this.auth.currentUser()?.id ?? '');
  readonly venues = computed(() => this.ownerId() ? this.db.getSedesPorDueno(this.ownerId()) : []);
  readonly venue = computed(() => {
    const venues = this.venues();
    const selected = this.db.sedeOperativaId?.();
    return venues.find(venue => Number(venue.id) === Number(selected)) ?? venues[0];
  });
  readonly courts = computed(() => {
    const id = this.venue()?.id;
    return id ? this.db.getCanchasPorSede(id) : [];
  });
  readonly loading = computed(() => this.db.catalogLoading?.() ?? false);
  readonly error = computed(() => (this.db.loadErrors?.() ?? []).join(', '));

  selectVenue(value: number | string): void {
    const id = Number(value);
    if (this.venues().some(venue => Number(venue.id) === id)) this.db.setSedeOperativaId(id);
  }
}
