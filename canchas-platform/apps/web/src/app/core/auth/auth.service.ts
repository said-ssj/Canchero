import { HttpBackend, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { DestroyRef, Injectable, NgZone, inject, signal, computed } from '@angular/core';
import { Observable, firstValueFrom, of } from 'rxjs';
import { catchError, map, timeout } from 'rxjs/operators';
import { supabase } from '../supabase/client';
import type { User } from '@shared/models/user.model';
import { environment } from '../../../environments/environment';

type UserRole = User['rol'];
interface BackendAuthResponse {
  token: string;
  user: { id: string; nombre: string; email: string; telefono?: string; rol: string };
}
interface StoredSession extends BackendAuthResponse {
  rememberMe?: boolean;
  lastActivityAt?: number;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  // Restoration runs during construction: do not re-enter AuthService through its interceptor.
  private readonly sessionHttp = new HttpClient(inject(HttpBackend));
  private readonly destroyRef = inject(DestroyRef);
  private readonly zone = inject(NgZone);
  private readonly apiUrl = environment.apiUrl;
  private readonly AUTH_CACHE_KEY = 'canchero_auth_session';
  private readonly _user = signal<User | null>(null);
  private validation?: Promise<boolean>;
  private renewal?: Promise<void>;
  private idleTimer?: ReturnType<typeof setTimeout>;
  private lastRenewalAt = 0;
  private readonly idleMs = 15 * 60 * 1000;
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly loginError = signal<string | null>(null);
  readonly restoring = signal(false);
  readonly ready: Promise<void>;

  constructor() {
    // Retirar solo la sesion ficticia; conservar los borradores de negocio.
    if (typeof localStorage !== 'undefined') localStorage.removeItem('canchero_demo_user');
    this.ready = this.validateSession().then(() => undefined);
    if (typeof window !== 'undefined') {
      const activity = () => {
        if (document.visibilityState !== 'hidden') this.zone.run(() => this.recordActivity());
      };
      const changed = (event: StorageEvent) => {
        if (event.key !== this.AUTH_CACHE_KEY) return;
        this.zone.run(() => {
          if (!this.authToken()) this.clearSession();
          else {
            const previous = event.oldValue ? JSON.parse(event.oldValue) as StoredSession : null;
            const current = event.newValue ? JSON.parse(event.newValue) as StoredSession : null;
            if (previous?.token === current?.token) this.scheduleExpiry();
            else {
              if (current?.user?.id !== this._user()?.id) this._user.set(null);
              void this.validateSession();
            }
          }
        });
      };
      this.zone.runOutsideAngular(() => {
        for (const event of ['pointerdown', 'keydown', 'wheel', 'focus']) window.addEventListener(event, activity, { passive: true });
        document.addEventListener('visibilitychange', activity);
        window.addEventListener('storage', changed);
      });
      this.destroyRef.onDestroy(() => {
        clearTimeout(this.idleTimer);
        for (const event of ['pointerdown', 'keydown', 'wheel', 'focus']) window.removeEventListener(event, activity);
        document.removeEventListener('visibilitychange', activity);
        window.removeEventListener('storage', changed);
      });
    }
  }

  currentUser(): User | null { return this._user(); }

  authToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const saved = localStorage.getItem(this.AUTH_CACHE_KEY);
      if (!saved) return null;
      const session: StoredSession = JSON.parse(saved);
      if (session.rememberMe === false && (!Number.isFinite(session.lastActivityAt)
        || Date.now() - session.lastActivityAt! >= this.idleMs)) {
        this.clearSession();
        return null;
      }
      const token: unknown = session.token;
      return typeof token === 'string' && token.length > 0 ? token : null;
    } catch {
      this.clearSession();
      return null;
    }
  }

  clearSession(): void {
    clearTimeout(this.idleTimer);
    this._user.set(null);
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.AUTH_CACHE_KEY);
      localStorage.removeItem('canchero_demo_user');
    }
  }

  validateSession(): Promise<boolean> {
    if (this.validation) return this.validation;
    const token = this.authToken();
    if (!token) {
      this.clearSession();
      this.restoring.set(false);
      return Promise.resolve(false);
    }
    this.restoring.set(true);
    this.validation = firstValueFrom(this.sessionHttp.get<BackendAuthResponse['user']>(`${this.apiUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(timeout(10000)))
      .then(user => {
        if (this.authToken() !== token) return false;
        this._user.set(this.mapBackendUser(user));
        this.scheduleExpiry();
        this.recordActivity();
        return true;
      })
      .catch((error: unknown) => {
        if (this.authToken() === token) {
          this._user.set(null);
          if (error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) this.clearSession();
          else this.loginError.set('No se pudo comprobar tu sesión. Comprueba la conexión e inténtalo de nuevo.');
        }
        return false;
      })
      .finally(() => { this.validation = undefined; this.restoring.set(false); });
    return this.validation;
  }

  login(email: string, password: string, rememberMe = true): Observable<User | null> {
    this.loginError.set(null);
    this.clearSession();
    return this.http.post<BackendAuthResponse>(`${this.apiUrl}/auth/login`, {
      email: email.trim().toLowerCase(), password, rememberMe,
    }).pipe(
      timeout(10000),
      map(response => this.persistBackendAuth(response, rememberMe)),
      catchError((error: unknown) => {
        this.clearSession();
        this.loginError.set(error instanceof HttpErrorResponse && (error.status === 400 || error.status === 401)
          ? 'Correo o contraseña incorrectos. Verifica tus credenciales.'
          : 'No se pudo validar la cuenta con el servidor. Comprueba la conexión e inténtalo de nuevo.');
        return of(null);
      }),
    );
  }

  register(payload: { nombre: string; email: string; telefono: string; rol: UserRole; password: string; sedeSolicitada?: string }): Observable<User | null> {
    this.loginError.set(null);
    return this.http.post<BackendAuthResponse>(`${this.apiUrl}/auth/register`, {
      nombre: payload.nombre.trim(), email: payload.email.trim().toLowerCase(),
      telefono: payload.telefono.trim(), password: payload.password,
      rol: payload.rol === 'OWNER' || payload.rol === 'dueno' ? 'dueno' : 'cliente',
    }).pipe(
      timeout(10000),
      map(response => this.persistBackendAuth(response)),
      catchError(() => {
        this.loginError.set('No se pudo crear la cuenta. Verifica los datos y la conexión con el servidor.');
        return of(null);
      }),
    );
  }

  async logout(): Promise<void> {
    this.clearSession();
    // Cerrar tambien sesiones Supabase antiguas, sin usarlas como acceso alternativo.
    try { await supabase.auth.signOut(); } catch { /* La sesion local ya esta cerrada. */ }
  }

  isOwner(): boolean {
    const role = this._user()?.rol;
    return role === 'dueno' || role === 'admin' || role === 'OWNER';
  }

  private mapRoleName(name: string): UserRole {
    switch (name.trim().toLowerCase()) {
      case 'dueno': case 'dueño': case 'owner': case 'propietario': return 'dueno';
      case 'admin': case 'administrador': return 'admin';
      case 'operador': return 'operador';
      case 'caja': return 'caja';
      default: return 'cliente';
    }
  }

  private mapBackendUser(user: BackendAuthResponse['user']): User {
    if (!user?.id || user.id === 'owner-1' || !user.rol) throw new Error('Perfil autenticado invalido');
    return { id: user.id, nombre: user.nombre, email: user.email, telefono: user.telefono ?? '', rol: this.mapRoleName(user.rol) };
  }

  private persistBackendAuth(response: BackendAuthResponse, rememberMe = true, lastActivityAt = Date.now()): User {
    if (!response.token) throw new Error('Falta token autenticado');
    const user = this.mapBackendUser(response.user);
    if (typeof localStorage !== 'undefined') localStorage.setItem(this.AUTH_CACHE_KEY, JSON.stringify({ ...response, rememberMe, lastActivityAt }));
    this._user.set(user);
    this.loginError.set(null);
    this.lastRenewalAt = Date.now();
    this.scheduleExpiry();
    return user;
  }

  private scheduleExpiry(): void {
    clearTimeout(this.idleTimer);
    if (typeof localStorage === 'undefined') return;
    const saved = localStorage.getItem(this.AUTH_CACHE_KEY);
    if (!saved) return;
    const session: StoredSession = JSON.parse(saved);
    if (session.rememberMe !== false) return;
    const delay = Math.max(0, this.idleMs - (Date.now() - (session.lastActivityAt ?? 0)));
    this.zone.runOutsideAngular(() => {
      this.idleTimer = setTimeout(() => this.zone.run(() => {
        if (!this.authToken()) this.clearSession();
        else this.scheduleExpiry();
      }), delay);
    });
  }

  private recordActivity(): void {
    const token = this.authToken();
    if (!token || !this._user()) return;
    const session: StoredSession = JSON.parse(localStorage.getItem(this.AUTH_CACHE_KEY)!);
    if (session.rememberMe !== false) return;
    const now = Date.now();
    if (now - (session.lastActivityAt ?? 0) >= 1000) {
      localStorage.setItem(this.AUTH_CACHE_KEY, JSON.stringify({ ...session, lastActivityAt: now }));
      this.scheduleExpiry();
    }
    if (this.renewal || now - this.lastRenewalAt < 60_000) return;
    this.lastRenewalAt = now;
    this.renewal = firstValueFrom(this.sessionHttp.post<BackendAuthResponse>(`${this.apiUrl}/auth/refresh`, {}, {
      headers: { Authorization: `Bearer ${token}` },
    }).pipe(timeout(10000))).then(response => {
      if (this.authToken() !== token || !this._user()) return;
      const current: StoredSession = JSON.parse(localStorage.getItem(this.AUTH_CACHE_KEY)!);
      this.persistBackendAuth(response, false, current.lastActivityAt);
    }).catch((error: unknown) => {
      if (this.authToken() === token && error instanceof HttpErrorResponse && (error.status === 401 || error.status === 403)) this.clearSession();
    }).finally(() => { this.renewal = undefined; });
  }
}
