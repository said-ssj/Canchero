import { Injectable, computed, signal } from '@angular/core';
import type { Court } from '@shared/models/court.model';
import type { Venue } from '@shared/models/venue.model';

export interface FilterOption {
  value: string;
  label: string;
}

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

  matchesCourt(cancha: Court): boolean {
    const f = this.formato();
    const s = this.superficie();
    const c = this.cobertura();
    const e = this.equipamiento();

    if (f !== 'all' && !this.checkFormato(cancha, f)) return false;
    if (s !== 'all' && !this.checkSuperficie(cancha, s)) return false;
    if (c !== 'all' && !this.checkCobertura(cancha, c)) return false;
    if (e !== 'all' && !this.checkEquipamiento(cancha, e)) return false;

    return true;
  }

  matchesVenue(venue: Venue): boolean {
    if (!venue.canchas || venue.canchas.length === 0) return false;
    return venue.canchas.some((cancha) => this.matchesCourt(cancha));
  }

  private checkFormato(cancha: Court, f: string): boolean {
    const tipo = (cancha.tipo || '').toLowerCase();
    const formato = ((cancha as any).formato || '').toLowerCase();
    const nombre = (cancha.nombre || '').toLowerCase();
    const text = `${tipo} ${formato} ${nombre}`;

    switch (f) {
      case 'f5':
        return text.includes('5');
      case 'f6':
        return text.includes('6');
      case 'f7':
        return text.includes('7');
      case 'f8':
        return text.includes('8');
      case 'f9':
        return text.includes('9');
      case 'f11':
        return text.includes('11');
      default:
        return true;
    }
  }

  private checkSuperficie(cancha: Court, s: string): boolean {
    const sup = ((cancha as any).superficie || '').toLowerCase();
    const tipo = (cancha.tipo || '').toLowerCase();
    const text = `${sup} ${(cancha.nombre || '').toLowerCase()}`;

    switch (s) {
      case 'sintetico':
        return text.includes('sintétic') || text.includes('sintetic');
      case 'natural':
        return text.includes('natural');
      case 'losa':
        return text.includes('losa') || text.includes('loza') || text.includes('concreto') || text.includes('cemento');
      case 'madera':
        return text.includes('madera') || text.includes('parquet');
      case 'goma':
        return text.includes('goma') || text.includes('caucho');
      case 'arena':
        return text.includes('arena') || tipo.includes('playa');
      default:
        return true;
    }
  }

  private checkCobertura(cancha: Court, c: string): boolean {
    const cob = ((cancha as any).cobertura || '').toLowerCase();
    const techada = !!(cancha as any).techada;
    const isTechada = techada || cob.includes('techada');

    switch (c) {
      case 'aire-libre':
        return cob.includes('aire libre') || !isTechada;
      case 'techada':
        return isTechada;
      case 'lona':
        return cob.includes('lona');
      case 'cerrada':
        return cob.includes('cerrada') || cob.includes('integral');
      default:
        return true;
    }
  }

  private checkEquipamiento(cancha: Court, e: string): boolean {
    const equip = Array.isArray((cancha as any).equipamiento)
      ? (cancha as any).equipamiento.map((x: string) => x.toLowerCase()).join(' ')
      : '';
    const text = `${equip} ${(cancha.nombre || '').toLowerCase()}`;

    switch (e) {
      case 'iluminacion':
        return text.includes('iluminac') || text.includes('luz') || text.includes('led');
      case 'muros':
        return text.includes('muro') || text.includes('pared');
      case 'oficial':
        return text.includes('oficial') || text.includes('reglamentar') || text.includes('arcos reglamentarios');
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
