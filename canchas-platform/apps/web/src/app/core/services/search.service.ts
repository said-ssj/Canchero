import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
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

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly db = inject(DatabaseService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  /**
   * Ejecuta la búsqueda agrupada de sedes, canchas y personas.
   */
  search(query: string): Observable<SearchResults> {
    const q = (query || '').trim();
    if (q.length < 2) {
      return of({
        query: q,
        sedes: [],
        canchas: [],
        personas: [],
        totalCount: 0,
      });
    }

    const normQ = normalizeText(q);

    // 1. Búsqueda de Sedes
    const venues = this.db.getVenuesPublicos();
    const sedesMatched: Array<{ item: SedeResult; score: number }> = [];

    for (const v of venues) {
      const normNombre = normalizeText(v.nombre);
      const normDistrito = normalizeText(v.distrito);
      const normCiudad = normalizeText(v.ciudad);
      const normDireccion = normalizeText(v.direccion);

      let score = 0;
      if (normNombre === normQ) score = 4;
      else if (normNombre.startsWith(normQ)) score = 3;
      else if (normNombre.includes(normQ)) score = 2;
      else if (normDistrito.includes(normQ) || normCiudad.includes(normQ)) score = 1.5;
      else if (normDireccion.includes(normQ)) score = 1;

      if (score > 0) {
        sedesMatched.push({
          score,
          item: {
            id: v.id,
            nombre: v.nombre,
            ciudad: v.ciudad,
            distrito: v.distrito,
            direccion: v.direccion,
            foto: v.fotos?.[0],
            rating: v.rating,
            canchasCount: v.canchas?.length || 0,
            precioMin: v.precioBase,
          },
        });
      }
    }

    // Ordenar sedes por relevancia y limitar a 5
    const sedes = sedesMatched
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.item);

    // 2. Búsqueda de Canchas
    const canchasMatched: Array<{ item: CanchaResult; score: number }> = [];
    for (const v of venues) {
      if (!v.canchas) continue;
      for (const c of v.canchas) {
        const normCancha = normalizeText(c.nombre);
        const normFormato = normalizeText(c.formato || c.tipo || '');
        const normSuperficie = normalizeText(c.superficie || '');
        const normSede = normalizeText(v.nombre);

        let score = 0;
        if (normCancha.startsWith(normQ)) score = 3;
        else if (normCancha.includes(normQ)) score = 2;
        else if (normFormato.includes(normQ)) score = 2;
        else if (normSuperficie.includes(normQ)) score = 1.5;
        else if (normSede.includes(normQ)) score = 1;

        if (score > 0) {
          canchasMatched.push({
            score,
            item: {
              id: c.id,
              nombre: c.nombre,
              formato: c.formato || c.tipo || 'Cancha',
              superficie: c.superficie || 'Gras sintético',
              venueId: v.id,
              venueNombre: v.nombre,
              distrito: v.distrito,
              precio: c.precioHora,
            },
          });
        }
      }
    }

    const canchas = canchasMatched
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((entry) => entry.item);

    // 3. Búsqueda de Personas (solo si el usuario tiene sesión activa o mediante endpoint público)
    return this.searchPersonas(q).pipe(
      map((personas) => {
        const totalCount = sedes.length + canchas.length + personas.length;
        return {
          query: q,
          sedes,
          canchas,
          personas: personas.slice(0, 5),
          totalCount,
        };
      }),
      catchError(() => {
        return of({
          query: q,
          sedes,
          canchas,
          personas: [],
          totalCount: sedes.length + canchas.length,
        });
      }),
    );
  }

  private searchPersonas(query: string): Observable<PersonaResult[]> {
    return this.http
      .get<Array<{ id: string; name: string; photo?: string; role?: string }>>(
        `${environment.apiUrl}/community/profiles/search?q=${encodeURIComponent(query)}`,
      )
      .pipe(
        map((list) =>
          list.map((u) => {
            const cleanName = u.name.trim();
            const username = `@${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jugador'}`;
            return {
              id: u.id,
              nombre: cleanName,
              username,
              foto: u.photo || undefined,
              rol: u.role || 'Jugador',
            };
          }),
        ),
        catchError(() => of([])),
      );
  }
}
