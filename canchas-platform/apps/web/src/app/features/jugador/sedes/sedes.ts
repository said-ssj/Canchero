import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatabaseService } from '@core/supabase/database.service';
import { CourtFilterService, type CourtFacet } from '@core/services/court-filter.service';
import { MapsService } from '@core/services/maps.service';
import { normalizeText } from '@core/models/search.model';
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
    MatTooltipModule,
  ],
  selector: 'app-sedes',
  styleUrl: './sedes.css',
  templateUrl: './sedes.html',
})
export class Sedes {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly db = inject(DatabaseService);
  protected readonly courtFilters = inject(CourtFilterService);
  private readonly mapsService = inject(MapsService);

  private readonly queryParams = toSignal(this.route.queryParamMap);

  constructor() {
    effect(() => {
      const qp = this.queryParams();
      if (!qp) return;

      const qVal = (qp.get('q') || qp.get('buscar') || '').trim();
      if (qVal !== this.busqueda()) {
        this.busqueda.set(qVal);
      }

      const ciudadVal = qp.get('ciudad');
      if (ciudadVal && ciudadVal !== this.ciudad()) {
        this.ciudad.set(ciudadVal);
      }

      const distritoVal = qp.get('distrito');
      if (distritoVal && distritoVal !== this.distrito()) {
        this.distrito.set(distritoVal);
      }

      const formatoVal = qp.get('formato');
      if (formatoVal) {
        let mapped = formatoVal.toLowerCase();
        if (mapped === 'futbol-7' || mapped === 'futbol 7') mapped = 'f7';
        else if (mapped === 'futbol-5' || mapped === 'futbol 5') mapped = 'f5';
        else if (mapped === 'futbol-6' || mapped === 'futbol 6') mapped = 'f6';
        else if (mapped === 'futbol-8' || mapped === 'futbol 8') mapped = 'f8';
        else if (mapped === 'futbol-9' || mapped === 'futbol 9') mapped = 'f9';
        else if (mapped === 'futbol-11' || mapped === 'futbol 11') mapped = 'f11';
        this.courtFilters.setFormato(mapped);
      }

      const superficieVal = qp.get('superficie');
      if (superficieVal) {
        let mapped = superficieVal.toLowerCase();
        if (mapped.includes('sintetico') || mapped.includes('gras')) mapped = 'sintetico';
        else if (mapped.includes('natural')) mapped = 'natural';
        else if (mapped.includes('losa') || mapped.includes('cemento')) mapped = 'losa';
        this.courtFilters.setSuperficie(mapped);
      }

      const coberturaVal = qp.get('cobertura');
      if (coberturaVal) {
        this.courtFilters.setCobertura(coberturaVal.toLowerCase());
      }

      const equipamientoVal = qp.get('equipamiento');
      if (equipamientoVal) {
        this.courtFilters.setEquipamiento(equipamientoVal.toLowerCase());
      }
    });
  }

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
    const query = normalizeText(this.busqueda());
    if (query) {
      venues = venues.filter((venue) => {
        const courtNames = venue.canchas
          .map((c) => `${c.nombre} ${c.formato || c.tipo || ''} ${c.superficie || ''}`)
          .join(' ');
        const fullText = normalizeText(
          `${venue.nombre} ${venue.distrito} ${venue.ciudad} ${venue.direccion || ''} ${courtNames} ${(venue.amenidades || []).join(' ')}`,
        );
        return fullText.includes(query);
      });
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
    this.updateUrlParams();
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
    this.updateUrlParams();
  }

  protected onDistritoChange(value: string): void {
    this.distrito.set(value);
    if (!this.isLoading() || this.venues().length)
      this.courtFilters.clearUnavailable(this.scopedCourts());
    this.updateUrlParams();
  }

  protected onSearch(event: Event): void {
    this.busqueda.set((event.target as HTMLInputElement).value);
    this.updateUrlParams();
  }

  protected clearSearchTerm(): void {
    this.busqueda.set('');
    this.updateUrlParams();
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
    this.updateUrlParams();
  }

  private updateUrlParams(): void {
    const params: Record<string, string | null> = {};
    const q = this.busqueda().trim();
    params['q'] = q ? q : null;
    params['buscar'] = null;
    params['ciudad'] = this.ciudad() !== 'all' ? this.ciudad() : null;
    params['distrito'] = this.distrito() !== 'all' ? this.distrito() : null;
    params['formato'] = this.courtFilters.formato() !== 'all' ? this.courtFilters.formato() : null;
    params['superficie'] =
      this.courtFilters.superficie() !== 'all' ? this.courtFilters.superficie() : null;
    params['cobertura'] =
      this.courtFilters.cobertura() !== 'all' ? this.courtFilters.cobertura() : null;
    params['equipamiento'] =
      this.courtFilters.equipamiento() !== 'all' ? this.courtFilters.equipamiento() : null;

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
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
