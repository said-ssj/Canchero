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

interface IndexedPersona {
  raw: PersonaResult;
  normNombre: string;
  normUsername: string;
}

@Injectable({ providedIn: 'root' })
export class SearchService {
  private readonly db = inject(DatabaseService);
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  // Índices precalculados para evitar re-normalizar en cada pulsación
  private sedesIndex: IndexedSede[] | null = null;
  private canchasIndex: IndexedCancha[] | null = null;
  private lastVenuesCount = 0;

  /**
   * Construye o refresca el índice de búsqueda en memoria una sola vez.
   */
  private ensureIndex(): void {
    const venues = this.db.getVenuesPublicos();
    if (this.sedesIndex && this.canchasIndex && venues.length === this.lastVenuesCount) {
      return;
    }

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
            superficie: c.superficie || 'Césped sintético',
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
    this.lastVenuesCount = venues.length;
  }

  /**
   * Ejecuta la búsqueda agrupada de sedes, canchas y personas.
   */
  search(query: string, onlyPersons = false): Observable<SearchResults> {
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
      .slice(0, 5)
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
      .slice(0, 5)
      .map((entry) => entry.item);

    // 3. Búsqueda en Personas (jugadores, usuarios y dueños)
    return this.searchPersonas(normQ).pipe(
      map((allPersonas) => {
        const totalPersonas = allPersonas.length;
        const personas = allPersonas.slice(0, 5);
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
        });
      }),
    );
  }

  /**
   * Resuelve personas reales combinando el usuario en sesión actual, dueños de complejos
   * y llamada al backend (con adaptador resiliente).
   */
  private searchPersonas(normQ: string): Observable<PersonaResult[]> {
    const localPersonas: PersonaResult[] = [];
    const seenUserIds = new Set<string>();

    // A. Usuario autenticado actual
    const currentAuthUser = this.auth.user();
    const currentProfile = this.auth.playerProfile();
    if (currentAuthUser) {
      const uId = String(currentAuthUser.id);
      seenUserIds.add(uId);

      const fullName =
        [currentProfile?.nombre, currentProfile?.apellido].filter(Boolean).join(' ') ||
        currentAuthUser.nombre ||
        'Alejandro A-H';

      // Handle personalizado o generado
      let username = '@' + (fullName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'alejandroah');
      if (typeof localStorage !== 'undefined') {
        const savedHandle = localStorage.getItem(`canchero_user_handle_${uId}`);
        if (savedHandle) username = savedHandle.startsWith('@') ? savedHandle : `@${savedHandle}`;
      }

      const rolStr = (currentAuthUser.rol || 'Jugador').toLowerCase();
      const rolDisplay =
        rolStr === 'admin' || rolStr === 'dueno' || rolStr === 'owner' ? 'Dueño' : 'Jugador';

      const normName = normalizeText(fullName);
      const normHandle = normalizeText(username);

      if (normName.includes(normQ) || normHandle.includes(normQ)) {
        localPersonas.push({
          id: uId,
          nombre: fullName,
          username,
          foto:
            currentProfile?.foto ||
            (currentAuthUser as any)?.foto ||
            (currentAuthUser as any)?.avatar,
          rol: rolDisplay,
          isCurrentUser: true,
        });
      }
    }

    // B. Dueños de sedes del catálogo
    const venues = this.db.getVenuesPublicos();
    for (const v of venues) {
      const rawV = v as any;
      if (!rawV.ownerId && !rawV.id_dueno) continue;
      const ownerId = String(rawV.ownerId || rawV.id_dueno);
      if (seenUserIds.has(ownerId)) continue;
      seenUserIds.add(ownerId);

      const ownerName = rawV.ownerNombre || rawV.dueno || `Dueño de ${v.nombre}`;
      const username = '@' + normalizeText(ownerName).replace(/[^a-z0-9]/g, '');
      const normName = normalizeText(ownerName);
      const normHandle = normalizeText(username);

      if (normName.includes(normQ) || normHandle.includes(normQ)) {
        localPersonas.push({
          id: ownerId,
          nombre: ownerName,
          username,
          rol: 'Dueño',
          sedePrincipal: v.nombre,
          isCurrentUser: false,
        });
      }
    }

    // C. Petición HTTP al backend para enriquecer con otros usuarios de la comunidad
    return this.http
      .get<Array<{ id: string; name: string; photo?: string; role?: string }>>(
        `${environment.apiUrl}/community/profiles/search?q=${encodeURIComponent(normQ)}&limit=10`,
      )
      .pipe(
        map((backendList) => {
          const list = [...localPersonas];
          for (const u of backendList) {
            const uId = String(u.id);
            if (seenUserIds.has(uId)) continue;
            seenUserIds.add(uId);

            const cleanName = (u.name || 'Jugador').trim();
            const username = `@${cleanName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jugador'}`;
            const rolStr = (u.role || 'Jugador').toLowerCase();
            const rolDisplay =
              rolStr.includes('dueno') || rolStr.includes('admin') || rolStr.includes('owner')
                ? 'Dueño'
                : 'Jugador';

            list.push({
              id: uId,
              nombre: cleanName,
              username,
              foto: u.photo || undefined,
              rol: rolDisplay,
              isCurrentUser: currentAuthUser ? String(currentAuthUser.id) === uId : false,
            });
          }
          return list;
        }),
        catchError(() => of(localPersonas)),
      );
  }
}
