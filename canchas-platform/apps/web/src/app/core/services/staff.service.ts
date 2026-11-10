import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { environment } from '@env/environment';

/** Rol operativo que un dueño (o un admin asignado) da en una sede. */
export type StaffRole = 'admin' | 'cajero' | 'almacen' | 'ayudante';

export interface StaffAssignment {
  id: number;
  sedeId: number;
  sedeNombre: string;
  usuarioId: string;
  nombre: string;
  email: string;
  rol: StaffRole;
  permisos: string[];
}

@Injectable({ providedIn: 'root' })
export class StaffService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  /** Asignaciones de la persona autenticada (vacío para dueños y superadmin). */
  readonly mine = signal<StaffAssignment[]>([]);
  readonly mineLoaded = signal(false);

  loadMine(): Observable<StaffAssignment[]> {
    return this.http.get<StaffAssignment[]>(`${this.apiUrl}/staff/me`).pipe(
      tap({
        next: (list) => {
          this.mine.set(list);
          this.mineLoaded.set(true);
        },
        error: () => this.mineLoaded.set(true),
      }),
    );
  }

  clearMine(): void {
    this.mine.set([]);
    this.mineLoaded.set(false);
  }

  listForVenue(sedeId: number | string): Observable<StaffAssignment[]> {
    return this.http.get<StaffAssignment[]>(`${this.apiUrl}/staff`, { params: { sedeId } });
  }

  assign(sedeId: number | string, email: string, rol: StaffRole): Observable<StaffAssignment> {
    return this.http.post<StaffAssignment>(`${this.apiUrl}/staff`, {
      sedeId: Number(sedeId),
      email,
      rol,
    });
  }

  remove(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/staff/${id}`);
  }
}
