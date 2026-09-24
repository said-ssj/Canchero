import { Injectable, inject, signal, type WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, map, Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import type { User, UserRole } from '../models/user.model';

const STORAGE_KEY = 'canchero_user';

export interface AuthResponse {
  token?: string;
  user: {
    id: string;
    nombre: string;
    email: string;
    telefono?: string;
    rol: UserRole;
  };
}

export interface RegisterPayload {
  nombre: string;
  email: string;
  telefono: string;
  rol: UserRole;
  password: string;
}

const DEFAULT_USERS: User[] = [
  {
    id: '1',
    nombre: 'Dueño Magdalena',
    email: 'dueno@canchero.pe',
    telefono: '987 654 322',
    rol: 'OWNER',
    password: '123456',
  },
  {
    id: '2',
    nombre: 'Carlos Jugador',
    email: 'jugador@canchero.pe',
    telefono: '987 654 321',
    rol: 'PLAYER',
    password: '123456',
  },
];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly userSignal: WritableSignal<User | null> = signal<User | null>(this.loadUser());

  readonly user = this.userSignal.asReadonly();

  constructor() {}

  login(email: string, password?: string): Observable<User | null> {
    const cleanEmail = email.trim().toLowerCase();
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, { email: cleanEmail, password })
      .pipe(
        map((response) => {
          const user = response ? this.fromResponse(response) : null;
          if (user) {
            this.persist(user);
            this.userSignal.set(user);
          }
          return user;
        }),
        catchError(() => {
          const fallback = this.fallbackLogin(cleanEmail, password);
          if (fallback) {
            this.persist(fallback);
            this.userSignal.set(fallback);
          }
          return of(fallback);
        }),
      );
  }

  register(data: RegisterPayload): Observable<User | null> {
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/register`, data)
      .pipe(
        map((response) => {
          const user = response ? this.fromResponse(response) : null;
          if (user) {
            this.persist(user);
            this.userSignal.set(user);
          }
          return user;
        }),
        catchError(() => {
          const newUser: User = {
            id: `u_${Date.now()}`,
            nombre: data.nombre.trim(),
            email: data.email.trim().toLowerCase(),
            telefono: data.telefono.trim(),
            rol: data.rol,
            password: data.password,
          };
          this.saveLocalUser(newUser);
          this.persist(newUser);
          this.userSignal.set(newUser);
          return of(newUser);
        }),
      );
  }

  logout(): void {
    localStorage.removeItem(STORAGE_KEY);
    this.userSignal.set(null);
  }

  currentUser(): User | null {
    return this.userSignal();
  }

  isOwner(): boolean {
    return this.userSignal()?.rol === 'OWNER';
  }

  isLoggedIn(): boolean {
    return this.userSignal() !== null;
  }

  private fromResponse(response: AuthResponse): User {
    return {
      id: response.user.id,
      nombre: response.user.nombre,
      email: response.user.email,
      telefono: response.user.telefono,
      rol: response.user.rol,
    };
  }

  private persist(user: User): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }
  private fallbackLogin(email: string, password?: string): User | null {
    const localUsers = this.loadLocalUsers();
    const found = localUsers.find(
      (u) => u.email.toLowerCase() === email && (!password || u.password === password)
    );
    if (found) {
      return found;
    }

    return null;
  }

  private saveLocalUser(user: User): void {
    const list = this.loadLocalUsers().filter((u) => u.email.toLowerCase() !== user.email.toLowerCase());
    list.push(user);
    localStorage.setItem('canchero_local_users', JSON.stringify(list));
  }

  private loadLocalUsers(): User[] {
    try {
      const raw = localStorage.getItem('canchero_local_users');
      const list = raw ? (JSON.parse(raw) as User[]) : [];
      const emails = new Set(list.map((u) => u.email.toLowerCase()));
      for (const def of DEFAULT_USERS) {
        if (!emails.has(def.email.toLowerCase())) {
          list.push(def);
        }
      }
      return list;
    } catch {
      return [...DEFAULT_USERS];
    }
  }

  private loadUser(): User | null {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as User;
    } catch {
      return null;
    }
  }
}