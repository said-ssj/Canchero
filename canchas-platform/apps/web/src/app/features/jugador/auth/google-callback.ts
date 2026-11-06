import { Location } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';
import { googleOAuthClient } from '@core/supabase/client';
import { environment } from '@env/environment';

@Component({
  imports: [RouterLink],
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
    this.location.replaceState('/auth/google/callback');
    try {
      if (!environment.googleAuthEnabled) throw new Error();
      const pending = sessionStorage.getItem('canchero-google-pending');
      sessionStorage.removeItem('canchero-google-pending');
      if (!pending || !code || query.has('error')) throw new Error();
      const preferences = JSON.parse(pending);
      this.remember = preferences.remember === true;
      const target = preferences.returnUrl;
      this.returnUrl =
        typeof target === 'string' && /^\/(?![/\\])/.test(target) && !target.includes('\\')
          ? target
          : null;
      const { data, error } = await googleOAuthClient().auth.exchangeCodeForSession(code);
      if (this.destroyRef.destroyed) {
        await googleOAuthClient().auth.signOut({ scope: 'local' });
        return;
      }
      if (error || !data.session) throw new Error();
      this.accessToken = data.session.access_token;
      this.destroyRef.onDestroy(() => this.endExchange());
      this.exchange();
    } catch {
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
        next: () => {
          this.endExchange();
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
