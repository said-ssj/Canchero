import { Component, computed, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { Router, RouterLink } from '@angular/router';
import { DatabaseService } from '@core/supabase/database.service';
import { CourtFilterService, type CourtFacet } from '@core/services/court-filter.service';
import { MapsService } from '@core/services/maps.service';
import type { Venue } from '@shared/models/venue.model';

@Component({
  imports: [
    RouterLink,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatSelectModule,
  ],
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
  protected readonly catalogError = computed(() => this.db.catalogError());
  protected readonly showSkeleton = computed(() => this.isLoading() && !this.venues().length);
  protected readonly fallbackVenueImg = '/images/venue-placeholder.svg';
  protected readonly layoutMode = signal<'grid' | 'list'>('list');
  protected readonly sortBy = signal<'recomendados' | 'precio_asc' | 'rating_desc'>('recomendados');
  private readonly brokenPhotoIds = signal<Set<string>>(new Set());

  protected readonly venues = computed(() => this.db.getVenuesPublicos());

  protected readonly cities = computed(() =>
    [
      ...new Set(
        this.venues()
          .map((v) => v.ciudad)
          .filter(Boolean),
      ),
    ].sort(),
  );

  protected onImgError(event: Event, venueId?: string): void {
    const img = event.target as HTMLImageElement;
    if (img && img.getAttribute('src') !== this.fallbackVenueImg) {
      img.src = this.fallbackVenueImg;
    }
    if (venueId) {
      this.brokenPhotoIds.update((set) => {
        const next = new Set(set);
        next.add(venueId);
        return next;
      });
    }
  }

  protected hasCustomPhoto(venue: Venue): boolean {
    const first = venue.fotos?.[0]?.trim();
    if (!first || first === this.fallbackVenueImg || first.includes('venue-placeholder')) {
      return false;
    }
    return !this.brokenPhotoIds().has(venue.id);
  }

  protected primaryFormat(venue: Venue): string {
    const formats = [
      ...new Set(venue.canchas.map((c) => (c.formato || c.tipo || '').trim()).filter(Boolean)),
    ];
    if (formats.length === 0) return 'Fútbol 7';
    if (formats.length === 1) return formats[0];
    const secondNum = formats[1].replace(/^Fútbol\s*/i, '').trim();
    return secondNum ? `${formats[0]} / ${secondNum}` : formats[0];
  }

  protected primarySurface(venue: Venue): string {
    const raw = (venue.canchas[0]?.superficie || '').toLowerCase();
    if (raw.includes('losa') || raw.includes('cemento')) return 'Losa';
    if (raw.includes('parquet') || raw.includes('madera')) return 'Parquet';
    return 'Gras';
  }

  protected getVenueBadges(venue: Venue): string[] {
    const badges: string[] = [];
    const firstCourt = venue.canchas[0];
    if (firstCourt) {
      if (firstCourt.formato || firstCourt.tipo) {
        badges.push(firstCourt.formato || firstCourt.tipo);
      }
      if (firstCourt.superficie) {
        badges.push(firstCourt.superficie);
      }
      if (firstCourt.cobertura) {
        badges.push(firstCourt.cobertura);
      }
    }
    if (Array.isArray(venue.amenidades)) {
      for (const a of venue.amenidades) {
        if (!badges.includes(a)) {
          badges.push(a);
        }
      }
    }
    return badges;
  }

  protected onSortChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value === 'precio_asc' || value === 'rating_desc' || value === 'recomendados') {
      this.sortBy.set(value);
    }
  }

  protected readonly ciudad = signal('all');
  protected readonly distrito = signal('all');
  protected readonly busqueda = signal('');
  protected readonly view = signal<'all' | 'fav'>('all');

  protected readonly favorites = signal(
    new Set(
      this.db
        .getVenuesPublicos()
        .filter((v) => v.favorita)
        .map((v) => v.id),
    ),
  );
  protected readonly alerts = signal(new Set<string>());

  protected readonly toastText = signal('');
  protected readonly toastAlert = signal(false);
  protected readonly toastVisible = signal(false);

  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly distritoOptions = computed<{
    topLabel: string;
    groups: { label: string; districts: string[] }[];
  }>(() => {
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

  private readonly scopedVenues = computed<Venue[]>(() => {
    let venues = this.venues().filter((venue) => {
      if (this.ciudad() !== 'all' && venue.ciudad.toLowerCase() !== this.ciudad().toLowerCase())
        return false;
      if (
        this.distrito() !== 'all' &&
        venue.distrito.toLowerCase() !== this.distrito().toLowerCase()
      )
        return false;
      return true;
    });
    if (this.view() === 'fav') {
      venues = venues.filter((venue) => this.favorites().has(venue.id));
    }
    const query = this.busqueda().trim().toLowerCase();
    if (query) {
      venues = venues.filter((venue) =>
        `${venue.nombre} ${venue.distrito} ${venue.ciudad} ${venue.direccion} ${venue.canchas.map((c) => c.nombre).join(' ')} ${venue.amenidades.join(' ')}`
          .toLowerCase()
          .includes(query),
      );
    }
    return venues;
  });

  private readonly scopedCourts = computed(() =>
    this.scopedVenues().flatMap((venue) => venue.canchas),
  );
  protected readonly filteredVenues = computed(() => {
    const list = this.scopedVenues().filter(
      (venue) =>
        !this.courtFilters.hasActiveCourtFilters() || this.courtFilters.matchesVenue(venue),
    );
    const sort = this.sortBy();
    if (sort === 'precio_asc') {
      return [...list].sort((a, b) => (a.precioBase || 0) - (b.precioBase || 0));
    }
    if (sort === 'rating_desc') {
      return [...list].sort((a, b) => (b.rating || 0) - (a.rating || 0));
    }
    return list;
  });
  protected readonly courtOptions = computed(() => ({
    formato: this.courtFilters.optionsFor('formato', this.scopedCourts()),
    superficie: this.courtFilters.optionsFor('superficie', this.scopedCourts()),
    cobertura: this.courtFilters.optionsFor('cobertura', this.scopedCourts()),
    equipamiento: this.courtFilters.optionsFor('equipamiento', this.scopedCourts()),
  }));

  protected changeCourtFilter(facet: CourtFacet, value: string): void {
    this.courtFilters[facet].set(value);
  }

  protected retryCatalog(): void {
    void this.db.refreshCatalogo();
  }

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
    return [
      ...new Set(
        this.venues()
          .filter((v) => v.ciudad.toLowerCase() === ciudad.toLowerCase())
          .map((v) => v.distrito)
          .filter(Boolean),
      ),
    ].sort();
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

  protected onCityChange(value: string): void {
    this.ciudad.set(value);
    this.distrito.set('all');
    if (!this.isLoading() || this.venues().length)
      this.courtFilters.clearUnavailable(this.scopedCourts());
  }

  protected onDistritoChange(value: string): void {
    this.distrito.set(value);
    if (!this.isLoading() || this.venues().length)
      this.courtFilters.clearUnavailable(this.scopedCourts());
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
    return (
      venue.latitud != null &&
      venue.longitud != null &&
      Number.isFinite(Number(venue.latitud)) &&
      Number.isFinite(Number(venue.longitud)) &&
      Math.abs(Number(venue.latitud)) <= 90 &&
      Math.abs(Number(venue.longitud)) <= 180
    );
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
