import { Injectable, computed, inject } from '@angular/core';
import { DatabaseService } from './database.service';
import type { Venue } from '../models/venue.model';

@Injectable({ providedIn: 'root' })
export class VenueService {
  private readonly db = inject(DatabaseService);

  /** Catálogo público: consume las sedes/canchas activas de DatabaseService. */
  readonly venues = computed<Venue[]>(() => this.db.getVenuesPublicos());

  getVenues(ciudad?: string, distrito?: string, deporte?: string): Venue[] {
    return this.db.getVenuesPublicos().filter((venue) => {
      if (ciudad && ciudad !== 'all' && venue.ciudad !== ciudad) {
        return false;
      }
      if (distrito && distrito !== 'all' && venue.distrito !== distrito) {
        return false;
      }
      if (deporte && deporte !== 'all' && !this.matchesDeporte(venue, deporte)) {
        return false;
      }
      return true;
    });
  }

  getVenueById(id: string): Venue | undefined {
    return this.db.getVenueDetalle(id);
  }

  getCities(): string[] {
    return [...new Set(this.db.getVenuesPublicos().map((venue) => venue.ciudad))];
  }

  getDistritosByCiudad(ciudad: string): string[] {
    return this.db
      .getVenuesPublicos()
      .filter((venue) => venue.ciudad === ciudad)
      .map((venue) => venue.distrito);
  }

  private matchesDeporte(venue: Venue, deporte: string): boolean {
    const tagNames = venue.amenidades.join(' ').toLowerCase();
    const courtTypes = venue.canchas.map((c) => c.tipo.toLowerCase());
    switch (deporte) {
      case 'futbol-5':
        return courtTypes.includes('grass 5');
      case 'futbol-7':
        return courtTypes.includes('grass 7');
      case 'futbol-11':
        return tagNames.includes('fútbol 11');
      case 'techado':
        return courtTypes.includes('techada') || tagNames.includes('techado');
      case 'sintetico':
        return tagNames.includes('sintético');
      case 'natural':
        return tagNames.includes('natural');
      default:
        return true;
    }
  }
}