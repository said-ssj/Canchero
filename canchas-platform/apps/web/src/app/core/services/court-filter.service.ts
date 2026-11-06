import { Injectable, computed, signal } from '@angular/core';
import type { Court } from '@shared/models/court.model';
import type { Venue } from '@shared/models/venue.model';

export interface FilterOption {
  value: string;
  label: string;
}

export type CourtFacet = 'formato' | 'superficie' | 'cobertura' | 'equipamiento';

@Injectable({
  providedIn: 'root',
})
export class CourtFilterService {
  readonly formato = signal<string>('all');
  readonly superficie = signal<string>('all');
  readonly cobertura = signal<string>('all');
  readonly equipamiento = signal<string>('all');

  readonly formatoOptions: FilterOption[] = [
    { value: 'all', label: 'Todos los formatos' },
    { value: 'f5', label: 'Fútbol 5' },
    { value: 'f6', label: 'Fútbol 6' },
    { value: 'f7', label: 'Fútbol 7' },
    { value: 'f8', label: 'Fútbol 8' },
    { value: 'f9', label: 'Fútbol 9' },
    { value: 'f11', label: 'Fútbol 11' },
    { value: 'playa', label: 'Fútbol Playa' },
  ];

  readonly superficieOptions: FilterOption[] = [
    { value: 'all', label: 'Todas las superficies' },
    { value: 'sintetico', label: 'Grass Sintético' },
    { value: 'natural', label: 'Césped Natural' },
    { value: 'losa', label: 'Losa Deportiva' },
    { value: 'madera', label: 'Piso de Madera' },
    { value: 'goma', label: 'Piso de Goma' },
    { value: 'arena', label: 'Arena' },
  ];

  readonly coberturaOptions: FilterOption[] = [
    { value: 'all', label: 'Todas las coberturas' },
    { value: 'aire-libre', label: 'Al Aire Libre' },
    { value: 'techada', label: 'Techada' },
    { value: 'lona', label: 'Techada con Lona' },
    { value: 'cerrada', label: 'Completamente Cerrada' },
  ];

  readonly equipamientoOptions: FilterOption[] = [
    { value: 'all', label: 'Todo el equipamiento' },
    { value: 'iluminacion', label: 'Con Iluminación' },
    { value: 'muros', label: 'Con Paredes / Muros' },
    { value: 'oficial', label: 'Medidas Oficiales' },
    { value: 'rejas', label: 'Con Rejas' },
    { value: 'malla', label: 'Con Malla' },
    { value: 'multiuso', label: 'Cancha Multiuso' },
  ];

  readonly hasActiveCourtFilters = computed<boolean>(() => {
    return (
      this.formato() !== 'all' ||
      this.superficie() !== 'all' ||
      this.cobertura() !== 'all' ||
      this.equipamiento() !== 'all'
    );
  });

  setFormato(value: string): void {
    this.formato.set(value);
  }

  setSuperficie(value: string): void {
    this.superficie.set(value);
  }

  setCobertura(value: string): void {
    this.cobertura.set(value);
  }

  setEquipamiento(value: string): void {
    this.equipamiento.set(value);
  }

  resetCourtFilters(): void {
    this.formato.set('all');
    this.superficie.set('all');
    this.cobertura.set('all');
    this.equipamiento.set('all');
  }

  optionsFor(facet: CourtFacet, courts: Court[]): FilterOption[] {
    const candidates = courts.filter((court) => this.matchesCourt(court, facet));
    return this[`${facet}Options`].filter(
      (option) =>
        option.value === 'all' ||
        candidates.some((court) => this.matchesOption(court, facet, option.value)),
    );
  }

  clearUnavailable(courts: Court[]): void {
    const facets: CourtFacet[] = ['formato', 'superficie', 'cobertura', 'equipamiento'];
    // Keep earlier selections when the remaining options no longer coexist.
    let candidates = courts;
    for (const facet of facets) {
      if (this[facet]() === 'all') continue;
      const matching = candidates.filter((court) =>
        this.matchesOption(court, facet, this[facet]()),
      );
      if (matching.length) candidates = matching;
      else this[facet].set('all');
    }
  }

  private matchesOption(court: Court, facet: CourtFacet, value: string): boolean {
    switch (facet) {
      case 'formato':
        return this.checkFormato(court, value);
      case 'superficie':
        return this.checkSuperficie(court, value);
      case 'cobertura':
        return this.checkCobertura(court, value);
      case 'equipamiento':
        return this.checkEquipamiento(court, value);
    }
  }

  matchesCourt(cancha: Court, except?: CourtFacet): boolean {
    const f = this.formato();
    const s = this.superficie();
    const c = this.cobertura();
    const e = this.equipamiento();

    if (except !== 'formato' && f !== 'all' && !this.checkFormato(cancha, f)) return false;
    if (except !== 'superficie' && s !== 'all' && !this.checkSuperficie(cancha, s)) return false;
    if (except !== 'cobertura' && c !== 'all' && !this.checkCobertura(cancha, c)) return false;
    if (except !== 'equipamiento' && e !== 'all' && !this.checkEquipamiento(cancha, e))
      return false;

    return true;
  }

  matchesVenue(venue: Venue): boolean {
    if (!venue.canchas || venue.canchas.length === 0) return false;
    return venue.canchas.some((cancha) => this.matchesCourt(cancha));
  }

  private checkFormato(cancha: Court, f: string): boolean {
    const text = (cancha.formato || cancha.tipo || '').trim().toLowerCase();
    return f === 'playa' ? /\bplaya\b/.test(text) : text.match(/\b\d+\b/)?.[0] === f.slice(1);
  }

  private checkSuperficie(cancha: Court, s: string): boolean {
    const text = (cancha.superficie || '').toLowerCase();

    switch (s) {
      case 'sintetico':
        return text.includes('sintétic') || text.includes('sintetic');
      case 'natural':
        return text.includes('natural');
      case 'losa':
        return (
          text.includes('losa') ||
          text.includes('loza') ||
          text.includes('concreto') ||
          text.includes('cemento')
        );
      case 'madera':
        return text.includes('madera') || text.includes('parquet');
      case 'goma':
        return text.includes('goma') || text.includes('caucho');
      case 'arena':
        return text.includes('arena');
      default:
        return true;
    }
  }

  private checkCobertura(cancha: Court, c: string): boolean {
    const cob = (cancha.cobertura || '').toLowerCase();

    switch (c) {
      case 'aire-libre':
        return cob.includes('aire libre') || (!cob && cancha.techada === false);
      case 'techada':
        return cob === 'techada' || (!cob && cancha.techada === true);
      case 'lona':
        return cob.includes('lona');
      case 'cerrada':
        return cob.includes('cerrada') || cob.includes('integral');
      default:
        return true;
    }
  }

  private checkEquipamiento(cancha: Court, e: string): boolean {
    const text = (cancha.equipamiento ?? []).join(' ').toLowerCase();

    switch (e) {
      case 'iluminacion':
        return text.includes('iluminac') || text.includes('luz') || text.includes('led');
      case 'muros':
        return text.includes('muro') || text.includes('pared');
      case 'oficial':
        return (
          text.includes('oficial') ||
          text.includes('reglamentar') ||
          text.includes('arcos reglamentarios')
        );
      case 'rejas':
        return text.includes('reja');
      case 'malla':
        return text.includes('malla');
      case 'multiuso':
        return text.includes('multiuso') || text.includes('multideport');
      default:
        return true;
    }
  }
}
