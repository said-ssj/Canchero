import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import {
  CanchaResult,
  PersonaResult,
  SearchResults,
  SedeResult,
  normalizeText,
} from '@core/models/search.model';

interface IndexedSede {
  raw: SedeResult;
  normNombre: string;
  normDistrito: string;
  normCiudad: string;
  normDireccion: string;
}

interface IndexedCancha {
  raw: CanchaResult;
  normNombre: string;
  normFormato: string;
  normSuperficie: string;
  normVenue: string;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly db = inject(DatabaseService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  // Índices reconstruidos desde el catálogo actual; no se reutilizan por tamaño.
  private sedesIndex: IndexedSede[] | null = null;
  private canchasIndex: IndexedCancha[] | null = null;

  /**
   * Construye el índice de búsqueda a partir del catálogo actual.
   */
  private ensureIndex(): void {
    const venues = this.db.getVenuesPublicos();

    const sedesList: IndexedSede[] = [];
    const canchasList: IndexedCancha[] = [];
    const seenVenues = new Set<string>();
    const seenCourts = new Set<string>();

    for (const v of venues) {
      if (seenVenues.has(v.id)) continue;
      seenVenues.add(v.id);

      const sedeRaw: SedeResult = {
        id: v.id,
        nombre: v.nombre,
        ciudad: v.ciudad,
        distrito: v.distrito,
        direccion: v.direccion,
        foto: v.fotos?.[0],
        rating: v.rating,
        canchasCount: v.canchas?.length || 0,
        precioMin: v.precioBase,
        atributos: [
          ...new Set(
            (v.canchas || [])
              .flatMap((c) => [c.formato || c.tipo, c.superficie])
              .filter((s): s is string => !!s),
          ),
        ].slice(0, 4),
      };

      sedesList.push({
        raw: sedeRaw,
        normNombre: normalizeText(v.nombre),
        normDistrito: normalizeText(v.distrito),
        normCiudad: normalizeText(v.ciudad),
        normDireccion: normalizeText(v.direccion),
      });

      if (v.canchas) {
        for (const c of v.canchas) {
          const courtId = String(c.id);
          // Deduplicar canchas en la fuente
          if (seenCourts.has(courtId)) continue;
          seenCourts.add(courtId);

          const canchaRaw: CanchaResult = {
            id: courtId,
            nombre: c.nombre,
            formato: c.formato || c.tipo || 'Cancha',
            superficie: c.superficie || '',
            venueId: v.id,
            venueNombre: v.nombre,
            distrito: v.distrito,
            precio: c.precioHora,
          };

          canchasList.push({
            raw: canchaRaw,
            normNombre: normalizeText(c.nombre),
            normFormato: normalizeText(c.formato || c.tipo || ''),
            normSuperficie: normalizeText(c.superficie || ''),
            normVenue: normalizeText(v.nombre),
          });
        }
      }
    }

    this.sedesIndex = sedesList;
    this.canchasIndex = canchasList;
  }

  /**
   * Ejecuta la búsqueda agrupada de sedes, canchas y personas.
   */
  search(query: string, onlyPersons = false, full = false): Observable<SearchResults> {
    const q = (query || '').trim();
    if (q.length < 2) {
      return of({
        query: q,
        sedes: [],
        canchas: [],
        personas: [],
        totalSedes: 0,
        totalCanchas: 0,
        totalPersonas: 0,
        totalCount: 0,
      });
    }

    const normQ = normalizeText(q);
    this.ensureIndex();

    // 1. Búsqueda en Sedes
    const sedesMatched: Array<{ item: SedeResult; score: number }> = [];
    if (!onlyPersons && this.sedesIndex) {
      for (const s of this.sedesIndex) {
        let score = 0;
        if (s.normNombre === normQ) score = 4;
        else if (s.normNombre.startsWith(normQ)) score = 3;
        else if (s.normNombre.includes(normQ)) score = 2;
        else if (s.normDistrito.includes(normQ) || s.normCiudad.includes(normQ)) score = 1.5;
        else if (s.normDireccion.includes(normQ)) score = 1;

        if (score > 0) {
          sedesMatched.push({ score, item: s.raw });
        }
      }
    }

    const totalSedes = sedesMatched.length;
    const sedes = sedesMatched
      .sort((a, b) => b.score - a.score)
      .slice(0, full ? undefined : 5)
      .map((entry) => entry.item);

    // 2. Búsqueda en Canchas
    const canchasMatched: Array<{ item: CanchaResult; score: number }> = [];
    if (!onlyPersons && this.canchasIndex) {
      for (const c of this.canchasIndex) {
        let score = 0;
        if (c.normNombre === normQ) score = 4;
        else if (c.normNombre.startsWith(normQ)) score = 3;
        else if (c.normNombre.includes(normQ)) score = 2;
        else if (c.normFormato.includes(normQ)) score = 2;
        else if (c.normSuperficie.includes(normQ)) score = 1.5;
        else if (c.normVenue.includes(normQ)) score = 1;

        if (score > 0) {
          canchasMatched.push({ score, item: c.raw });
        }
      }
    }

    const totalCanchas = canchasMatched.length;
    const canchas = canchasMatched
      .sort((a, b) => b.score - a.score)
      .slice(0, full ? undefined : 5)
      .map((entry) => entry.item);

    // 3. Búsqueda en Personas (jugadores, usuarios y dueños)
    return this.searchPersonas(normQ).pipe(
      map((allPersonas) => {
        const totalPersonas = allPersonas.length;
        const personas = allPersonas.slice(0, full ? undefined : 5);
        const totalCount = totalSedes + totalCanchas + totalPersonas;

        return {
          query: q,
          sedes,
          canchas,
          personas,
          totalSedes,
          totalCanchas,
          totalPersonas,
          totalCount,
        };
      }),
      catchError(() => {
        return of({
          query: q,
          sedes,
          canchas,
          personas: [],
          totalSedes,
          totalCanchas,
          totalPersonas: 0,
          totalCount: totalSedes + totalCanchas,
          personasError: true,
        });
      }),
    );
  }

  /**
   * Resuelve únicamente perfiles devueltos por la API pública; no deriva identidades de sedes.
   */
  private searchPersonas(query: string): Observable<PersonaResult[]> {
    return this.http
      .get<Array<{ id: string; name: string; photo?: string; role?: string; handle?: string }>>(
        `${environment.apiUrl}/community/profiles/search`,
        { params: { q: query } },
      )
      .pipe(
        timeout(12000),
        map((users) =>
          users
            .filter((u) => u.id && u.name)
            .map((u) => ({
              id: String(u.id),
              nombre: u.name,
              username: u.handle ? '@' + u.handle : '',
              foto: u.photo || undefined,
              rol: u.role,
              isCurrentUser: String(this.auth.user()?.id) === String(u.id),
            })),
        ),
      );
  }
}
