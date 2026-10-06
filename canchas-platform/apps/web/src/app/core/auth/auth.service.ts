import { Injectable, signal, computed } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { supabase } from '../supabase/client';
import type { User } from '@shared/models/user.model';

type UserRole = User['rol'];

@Injectable({ providedIn: 'root' })
export class AuthService {
  private _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());
  readonly loginError = signal<string | null>(null);
  readonly ready: Promise<void>;

  constructor() {
    this.ready = supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) {
        console.error('No se pudo restaurar la sesión de Supabase:', error);
      }
      if (data.session?.user) {
        this._user.set(await this.mapUser(data.session.user));
      }
    }).catch((error: unknown) => {
      console.error('Error al restaurar la sesión de Supabase:', error);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        this._user.set(null);
        return;
      }
      queueMicrotask(() => {
        void this.mapUser(session.user)
          .then(user => this._user.set(user))
          .catch((error: unknown) => console.error('No se pudo sincronizar el perfil autenticado:', error));
      });
    });
  }

  currentUser(): User | null { return this._user(); }

  login(email: string, password: string): Observable<User | null> {
    this.loginError.set(null);
    return from(supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.user) {
          if (error) {
            console.error('Error de autenticación de Supabase:', error);
          }
          this.loginError.set(
            error?.status && error.status < 500
              ? 'Correo o contraseña incorrectos. Verifica tus credenciales.'
              : 'No se pudo conectar con Supabase Auth. Verifica la configuración del proyecto e inténtalo de nuevo.',
          );
          return of(null);
        }

        return from(this.mapUser(data.user)).pipe(
          map(user => {
            this._user.set(user);
            return user;
          }),
        );
      }),
      catchError((error: unknown) => {
        console.error('Error al iniciar sesión con Supabase:', error);
        this.loginError.set('No se pudo conectar con Supabase Auth. Verifica la configuración del proyecto e inténtalo de nuevo.');
        return of(null);
      }),
    );
  }

  register(payload: { nombre: string; email: string; telefono: string; rol: UserRole; password: string; sedeSolicitada?: string }): Observable<User | null> {
    return from(supabase.auth.signUp({
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      options: {
        data: {
          nombre: payload.nombre.trim(),
          telefono: payload.telefono.trim(),
          rol_solicitado: payload.rol === 'OWNER' || payload.rol === 'dueno' ? 'dueno' : 'cliente',
          sede_solicitada: payload.sedeSolicitada?.trim() ?? '',
        },
      },
    })).pipe(
      switchMap(({ data, error }) => {
        if (error || !data.user) {
          if (error) {
            console.error('Error de registro de Supabase:', error);
          }
          return of(null);
        }
        return from(this.mapUser(data.user)).pipe(
          map(user => {
            this._user.set(user);
            return user;
          }),
        );
      }),
      catchError((error: unknown) => {
        console.error('Error al registrar con Supabase:', error);
        return of(null);
      }),
    );
  }

  async logout() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error al cerrar sesión en Supabase:', error);
      throw error;
    }
    this._user.set(null);
  }

  isOwner(): boolean {
    const rol = this._user()?.rol;
    return rol === 'dueno' || rol === 'admin';
  }

  private async mapUser(u: { id: string; email?: string; user_metadata?: Record<string, unknown> }): Promise<User> {
    const { data: profile, error: profileError } = await supabase
      .from('usuario')
      .select('id_rol, nombre, apellido, correo, telefono')
      .eq('id_usuario', u.id)
      .maybeSingle();

    let role: UserRole = 'cliente';
    if (profileError) {
      console.error('No se pudo leer el perfil autenticado de Supabase:', profileError);
    } else if (profile) {
      const { data: roleData, error: roleError } = await supabase
        .from('rol')
        .select('nombre')
        .eq('id_rol', profile.id_rol)
        .maybeSingle();

      if (roleError) {
        console.error('No se pudo leer el rol autenticado de Supabase:', roleError);
      } else {
        role = this.mapRoleName(roleData?.nombre);
      }
    } else {
      console.warn('No existe un perfil en public.usuario para la cuenta autenticada.');
    }

    return {
      id: u.id,
      nombre: profile
        ? `${profile.nombre} ${profile.apellido ?? ''}`.trim()
        : String(u.user_metadata?.['nombre'] ?? u.email ?? ''),
      email: profile?.correo ?? u.email ?? '',
      telefono: profile?.telefono ?? String(u.user_metadata?.['telefono'] ?? ''),
      rol: role,
    };
  }

  private mapRoleName(name?: string | null): UserRole {
    const normalized = name?.trim().toLowerCase();
    if (!normalized) return 'cliente';
    if (normalized.includes('dueno') || normalized.includes('dueño') || normalized.includes('owner') || normalized.includes('propietario')) return 'dueno';
    if (normalized.includes('admin')) return 'admin';
    if (normalized.includes('operador')) return 'operador';
    if (normalized.includes('caja')) return 'caja';
    return 'cliente';
  }
}