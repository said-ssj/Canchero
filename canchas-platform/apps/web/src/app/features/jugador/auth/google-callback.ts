import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '@core/auth/auth.service';
import { googleOAuthClient } from '@core/supabase/client';
import { environment } from '@env/environment';

@Component({
  imports: [
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './google-callback.html',
  styleUrl: './google-callback.css',
})
export class GoogleCallback {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);
  private accessToken = '';
  private remember = true;
  private returnUrl: string | null = null;
  protected readonly busy = signal(true);
  protected readonly needsPassword = signal(false);
  protected readonly error = signal('');
  protected readonly showPassword = signal(false);
  protected readonly showConfirmation = signal(false);
  protected readonly mismatch = signal(false);

  ngOnInit(): void {
    void this.completeCallback();
  }

  private async completeCallback(): Promise<void> {
    const query = this.route.snapshot.queryParamMap;
    const code = query.get('code');
    try {
      if (!environment.googleAuthEnabled) {
        throw new Error('La autenticación con Google está deshabilitada en la configuración');
      }

      const pending = sessionStorage.getItem('canchero-google-pending');
      sessionStorage.removeItem('canchero-google-pending');

      if (pending) {
        try {
          const preferences = JSON.parse(pending);
          this.remember = preferences.remember === true;
          const target = preferences.returnUrl;
          this.returnUrl =
            typeof target === 'string' && /^\/(?![/\\])/.test(target) && !target.includes('\\')
              ? target
              : null;
        } catch {
          this.remember = true;
          this.returnUrl = null;
        }
      }

      if (query.has('error')) {
        const desc = query.get('error_description') || query.get('error');
        console.error('[GoogleCallback] OAuth error en query:', desc);
        throw new Error(desc || 'Error reportado por el proveedor de autenticación');
      }

      let token = '';
      if (code) {
        const { data, error } = await googleOAuthClient().auth.exchangeCodeForSession(code);
        if (this.destroyRef.destroyed) {
          await googleOAuthClient().auth.signOut({ scope: 'local' });
          return;
        }
        if (error || !data?.session) {
          console.error('[GoogleCallback] Error en exchangeCodeForSession:', error);
          throw new Error(error?.message || 'No se pudo intercambiar el código por una sesión');
        }
        token = data.session.access_token;
        const meta = data.session.user?.user_metadata;
        const photo = meta?.['avatar_url'] || meta?.['picture'] || null;
        if (photo && typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem('canchero_oauth_avatar', photo);
            if (data.session.user?.id) {
              localStorage.setItem(`canchero_user_avatar_${data.session.user.id}`, photo);
            }
          } catch {}
        }
      } else {
        // Fallback: verificar fragmento hash (#access_token=... o #error=...)
        const hash = window.location.hash.startsWith('#')
          ? window.location.hash.substring(1)
          : window.location.hash;
        const hashParams = new URLSearchParams(hash);
        const hashError = hashParams.get('error_description') || hashParams.get('error');
        if (hashError) {
          console.error('[GoogleCallback] OAuth error en hash:', hashError);
          throw new Error(hashError);
        }
        const hashToken = hashParams.get('access_token');
        if (hashToken) {
          token = hashToken;
        } else {
          throw new Error('No se recibió código de autorización ni token de Google');
        }
      }

      this.location.replaceState('/auth/google/callback');
      this.accessToken = token;
      this.destroyRef.onDestroy(() => this.endExchange());
      this.exchange();
    } catch (err: any) {
      console.error('[GoogleCallback] Falló completeCallback:', err);
      this.location.replaceState('/auth/google/callback');
      this.busy.set(false);
      this.error.set(
        'No se completó el acceso con Google. Vuelve al inicio de sesión e inténtalo de nuevo.',
      );
    }
  }

  protected confirm(event: Event, field: HTMLInputElement, confirmation: HTMLInputElement): void {
    event.preventDefault();
    if (this.busy() || !field.value || !confirmation.value) return;
    if (field.value !== confirmation.value) {
      this.error.set('');
      this.mismatch.set(true);
      confirmation.focus();
      return;
    }

    const password = field.value;
    field.value = '';
    confirmation.value = '';
    this.showPassword.set(false);
    this.showConfirmation.set(false);
    this.mismatch.set(false);
    this.exchange(password);
  }

  private exchange(password?: string): void {
    this.busy.set(true);
    this.error.set('');
    this.auth
      .exchangeGoogle(this.accessToken, this.remember, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (user) => {
          this.endExchange();
          if (typeof localStorage !== 'undefined') {
            const pendingAvatar = localStorage.getItem('canchero_oauth_avatar');
            if (pendingAvatar && user?.id) {
              localStorage.setItem(`canchero_user_avatar_${user.id}`, pendingAvatar);
            }
          }
          if (this.auth.isOwner()) void this.router.navigateByUrl('/admin');
          else
            void this.router.navigate(['/perfil'], {
              queryParams: { acceso: 'google', regreso: this.returnUrl },
              replaceUrl: true,
            });
        },
        error: (failure: unknown) => {
          this.busy.set(false);
          const status = failure instanceof HttpErrorResponse ? failure.status : 0;
          if (status === 428) this.needsPassword.set(true);
          else if (status === 401 && password)
            this.error.set(
              'No se pudo confirmar tu cuenta. Revisa la contraseña o vuelve a ingresar con Google.',
            );
          else
            this.error.set(
              'No se pudo completar el acceso con Google. Vuelve al inicio de sesión e inténtalo de nuevo.',
            );
        },
      });
  }

  private endExchange(): void {
    if (!this.accessToken) return;
    this.accessToken = '';
    void googleOAuthClient()
      .auth.signOut({ scope: 'local' })
      .catch(() => undefined);
  }
}
