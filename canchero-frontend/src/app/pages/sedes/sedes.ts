import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import type { Venue } from '../../models/venue.model';

@Component({
  imports: [RouterLink],
  selector: 'app-sedes',
  styleUrl: './sedes.css',
  templateUrl: './sedes.html',
})
export class Sedes {
  private readonly router = inject(Router);
  private readonly db = inject(DatabaseService);

  protected readonly venues = computed(() => this.db.getVenuesPublicos());

  protected readonly cities = computed(() => [...new Set(this.venues().map((v) => v.ciudad))]);

  protected readonly ciudad = signal('all');
  protected readonly distrito = signal('all');
  protected readonly busqueda = signal('');
  protected readonly deporte = signal('all');
  protected readonly view = signal<'all' | 'fav'>('all');

  protected readonly favorites = signal(new Set(this.db.getVenuesPublicos().filter((v) => v.favorita).map((v) => v.id)));
  protected readonly alerts = signal(new Set<string>());

  protected readonly toastText = signal('');
  protected readonly toastAlert = signal(false);
  protected readonly toastVisible = signal(false);

  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly distritoOptions = computed<{ topLabel: string; groups: { label: string; districts: string[] }[] }>(() => {
    const ciudad = this.ciudad();
    if (ciudad === 'all') {
      return {
        topLabel: 'Todos los distritos',
        groups: this.cities().map((city) => ({
          label: this.capitalize(city),
          districts: this.getDistritosPorCiudad(city),
        })),
      };
    }
    return {
      topLabel: `Todos los distritos de ${this.capitalize(ciudad)}`,
      groups: [{ label: this.capitalize(ciudad), districts: this.getDistritosPorCiudad(ciudad) }],
    };
  });

  protected readonly filteredVenues = computed<Venue[]>(() => {
    let venues = this.venues().filter((venue) => {
      if (this.ciudad() !== 'all' && venue.ciudad !== this.ciudad()) return false;
      if (this.distrito() !== 'all' && venue.distrito !== this.distrito()) return false;
      if (this.deporte() !== 'all' && !this.matchesDeporte(venue, this.deporte())) return false;
      return true;
    });
    if (this.view() === 'fav') {
      venues = venues.filter((venue) => this.favorites().has(venue.id));
    }
    const query = this.busqueda().trim().toLowerCase();
    if (query) {
      venues = venues.filter((venue) =>
        `${venue.nombre} ${venue.distrito} ${venue.ciudad} ${venue.amenidades.join(' ')}`
          .toLowerCase()
          .includes(query),
      );
    }
    return venues;
  });

  protected readonly countFav = computed(() => this.favorites().size);

  protected readonly isFiltered = computed(
    () =>
      this.ciudad() !== 'all' ||
      this.distrito() !== 'all' ||
      this.busqueda().trim() !== '' ||
      this.deporte() !== 'all' ||
      this.view() === 'fav',
  );

  protected readonly pills = computed(() => ({
    all: this.view() !== 'fav' && this.ciudad() === 'all',
    fav: this.view() === 'fav',
  }));

  private getDistritosPorCiudad(ciudad: string): string[] {
    return [...new Set(this.venues().filter((v) => v.ciudad === ciudad).map((v) => v.distrito))];
  }

  private matchesDeporte(venue: Venue, deporte: string): boolean {
    const courtTypes = venue.canchas.map((c) => c.tipo.toLowerCase());
    switch (deporte) {
      case 'futbol-5':
        return courtTypes.some((t) => t.includes('grass 5'));
      case 'futbol-7':
        return courtTypes.some((t) => t.includes('grass 7'));
      case 'futbol-11':
        return venue.amenidades.join(' ').toLowerCase().includes('fútbol 11');
      case 'techado':
        return courtTypes.some((t) => t.includes('techada'));
      default:
        return true;
    }
  }

  protected capitalize(value: string): string {
    return value
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  protected countPorCiudad(city: string): number {
    return this.venues().filter((v) => v.ciudad === city).length;
  }

  protected disponibleCount(venue: Venue): number {
    return venue.canchas.filter((cancha) => cancha.disponible).length;
  }

  protected onCityChange(event: Event): void {
    this.ciudad.set((event.target as HTMLSelectElement).value);
    this.distrito.set('all');
  }

  protected onDistritoChange(event: Event): void {
    this.distrito.set((event.target as HTMLSelectElement).value);
  }

  protected onDeporteChange(event: Event): void {
    this.deporte.set((event.target as HTMLSelectElement).value);
  }

  protected onSearch(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  protected selectCityQuick(city: string): void {
    this.view.set('all');
    this.ciudad.set(city);
    this.distrito.set('all');
  }

  protected setActiveFav(): void {
    this.view.set('fav');
  }

  protected resetFilters(): void {
    this.view.set('all');
    this.ciudad.set('all');
    this.distrito.set('all');
    this.busqueda.set('');
    this.deporte.set('all');
  }

  protected goDetail(id: string): void {
    void this.router.navigate(['/sedes', id]);
  }

  protected stop(event: Event): void {
    event.stopPropagation();
  }

  protected toggleFav(event: Event, id: string): void {
    event.stopPropagation();
    const next = new Set(this.favorites());
    if (next.has(id)) {
      next.delete(id);
      this.showToast('Eliminada de tus sedes favoritas', false);
    } else {
      next.add(id);
      this.showToast('¡Añadida a tus sedes favoritas!', false);
    }
    this.favorites.set(next);
  }

  protected toggleAlert(event: Event, id: string): void {
    event.stopPropagation();
    const next = new Set(this.alerts());
    if (next.has(id)) {
      next.delete(id);
      this.showToast('Notificaciones de cancha desactivadas', false);
    } else {
      next.add(id);
      this.showToast('Alertas activadas para nuevos horarios en esta sede', true);
    }
    this.alerts.set(next);
  }

  private showToast(message: string, isAlert: boolean): void {
    this.toastText.set(message);
    this.toastAlert.set(isAlert);
    this.toastVisible.set(true);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.toastVisible.set(false), 2600);
  }
}