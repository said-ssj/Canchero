import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { SearchService } from '@core/services/search.service';
import { DatabaseService } from '@core/supabase/database.service';
import { SearchResults, highlightParts } from '@core/models/search.model';
@Component({
  selector: 'app-buscar',
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './buscar.html',
  styleUrl: './buscar.css',
})
export class Buscar {
  private readonly service = inject(SearchService);
  protected readonly db = inject(DatabaseService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly params = toSignal(this.route.queryParamMap, {
    initialValue: this.route.snapshot.queryParamMap,
  });
  protected readonly query = computed(() => this.params().get('q')?.trim() || '');
  protected readonly type = signal('todo');
  protected readonly result = signal<SearchResults | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected input = '';
  protected venueLimit = signal(3);
  protected courtLimit = signal(6);
  protected peopleLimit = signal(5);
  protected readonly parts = highlightParts;
  protected readonly tabs = ['todo', 'sedes', 'canchas', 'personas'];
  private request = 0;
  constructor() {
    effect(() => {
      const tipo = this.params().get('tipo') || 'todo';
      this.type.set(this.tabs.includes(tipo) ? tipo : 'todo');
    });
    effect(() => {
      const q = this.query();
      this.input = q;
      this.db.getVenuesPublicos();
      this.db.catalogLoading();
      void this.search(q);
    });
  }
  protected submit() {
    void this.router.navigate(['/buscar'], { queryParams: { q: this.input.trim() || null } });
  }
  protected selectType(tipo: string) {
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tipo: tipo === 'todo' ? null : tipo },
      queryParamsHandling: 'merge',
    });
  }
  protected clear() {
    this.input = '';
    this.submit();
  }
  protected count(tab: string) {
    const r = this.result();
    return tab === 'todo'
      ? r?.totalCount
      : tab === 'sedes'
        ? r?.totalSedes
        : tab === 'canchas'
          ? r?.totalCanchas
          : r?.totalPersonas;
  }
  private async search(q: string) {
    const request = ++this.request;
    this.venueLimit.set(3);
    this.courtLimit.set(6);
    this.peopleLimit.set(5);
    this.error.set('');
    this.result.set(null);
    if (q.length < 2) {
      this.busy.set(false);
      return;
    }
    this.busy.set(true);
    try {
      const result = await firstValueFrom(this.service.search(q, false, true));
      if (request === this.request) this.result.set(result);
    } catch {
      if (request === this.request)
        this.error.set('No pudimos completar la búsqueda. Intenta nuevamente.');
    } finally {
      if (request === this.request) this.busy.set(false);
    }
  }
  protected imageError(event: Event) {
    (event.target as HTMLImageElement).hidden = true;
  }
}
