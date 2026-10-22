import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '@core/supabase/database.service';
import { CourtFilterService } from '@core/services/court-filter.service';
import { MapsService } from '@core/services/maps.service';
import type { Venue } from '@shared/models/venue.model';

@Component({
  imports: [RouterLink],
  selector: 'app-sedes',
  styleUrl: './sedes.css',
  templateUrl: './sedes.html',
})
export class Sedes {
  private readonly router = inject(Router);
  private readonly db = inject(DatabaseService);
  protected readonly courtFilters = inject(CourtFilterService);
  private readonly mapsService = inject(MapsService);

  protected readonly isLoading = computed(() => this.db.catalogLoading());
  protected readonly fallbackVenueImg =
    '/images/venue-placeholder.svg';

  protected readonly venues = computed(() => this.db.getVenuesPublicos());

  protected readonly cities = computed(() => [...new Set(this.venues().map((v) => v.ciudad).filter(Boolean))].sort());

  protected onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && img.getAttribute('src') !== this.fallbackVenueImg) {
      img.src = this.fallbackVenueImg;
    }
  }

  protected readonly ciudad = signal('all');
  protected readonly distrito = signal('all');
  protected readonly busqueda = signal('');
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
      if (this.ciudad() !== 'all' && venue.ciudad.toLowerCase() !== this.ciudad().toLowerCase()) return false;
      if (this.distrito() !== 'all' && venue.distrito.toLowerCase() !== this.distrito().toLowerCase()) return false;
      if (this.courtFilters.hasActiveCourtFilters() && !this.courtFilters.matchesVenue(venue)) return false;
      return true;
    });
    if (this.view() === 'fav') {
      venues = venues.filter((venue) => this.favorites().has(venue.id));
    }
    const query = this.busqueda().trim().toLowerCase();
    if (query) {
      venues = venues.filter((venue) =>
        `${venue.nombre} ${venue.distrito} ${venue.ciudad} ${venue.direccion} ${venue.canchas.map(c => c.nombre).join(' ')} ${venue.amenidades.join(' ')}`
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
      this.courtFilters.hasActiveCourtFilters() ||
      this.view() === 'fav',
  );

  protected readonly pills = computed(() => ({
    all: this.view() === 'all',
    fav: this.view() === 'fav',
  }));

  private getDistritosPorCiudad(ciudad: string): string[] {
    return [...new Set(this.venues().filter((v) => v.ciudad.toLowerCase() === ciudad.toLowerCase()).map((v) => v.distrito).filter(Boolean))].sort();
  }

  protected capitalize(value: string): string {
    return value
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
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

  protected onSearch(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
  }

  protected selectView(view: 'all' | 'fav'): void {
    this.view.set(view);
  }

  protected resetFilters(): void {
    this.view.set('all');
    this.ciudad.set('all');
    this.distrito.set('all');
    this.busqueda.set('');
    this.courtFilters.resetCourtFilters();
  }

  protected goDetail(id: string): void {
    void this.router.navigate(['/sedes', id]);
  }

  protected getDirectionsUrl(venue: Venue): string {
    const lat = venue.latitud != null ? Number(venue.latitud) : -14.06778;
    const lng = venue.longitud != null ? Number(venue.longitud) : -75.72861;
    return this.mapsService.getGoogleMapsDirectionsUrl(lat, lng);
  }

  protected hasVenueCoordinates(venue: Venue): boolean {
    return venue.latitud != null && venue.longitud != null
      && Number.isFinite(Number(venue.latitud)) && Number.isFinite(Number(venue.longitud))
      && Math.abs(Number(venue.latitud)) <= 90 && Math.abs(Number(venue.longitud)) <= 180;
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
      this.showToast('Añadida a tus sedes favoritas', false);
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
