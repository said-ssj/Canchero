import { ThemeToggle } from '@shared/components/theme-toggle/theme-toggle';
import {
  Component,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '@core/auth/auth.service';
import { googleOAuthClient } from '@core/supabase/client';
import { createNonce, loadGoogleIdentity } from '@core/auth/google-identity';
import { environment } from '@env/environment';
import { ThemeService } from '@core/theme/theme.service';

@Component({
  imports: [
    FormsModule,
    RouterLink,
    ThemeToggle,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatProgressBarModule,
  ],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly theme = inject(ThemeService);

  protected get backUrl(): string {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');
    return target && /^\/(?![/\\])/.test(target) && !target.includes('\\') ? target : '/';
  }

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly remember = signal(true);
  protected readonly showError = signal(false);
  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly errorMessage = this.auth.loginError;
  protected readonly googleEnabled = environment.googleAuthEnabled;
  protected readonly googlePending = signal(false);
  /** Con GOOGLE_CLIENT_ID se usa el botón oficial de Google; sin él, la redirección por Supabase. */
  protected readonly googleButtonReady = signal(false);
  private readonly googleButton = viewChild<ElementRef<HTMLElement>>('googleButton');
  private readonly renderGoogleButton = signal<((dark: boolean) => void) | null>(null);

  constructor() {
    afterNextRender(() => void this.mountGoogleButton());
    // El iframe de Google no acepta CSS: se vuelve a pintar con el tema de Google que toque.
    effect(() => this.renderGoogleButton()?.(this.theme.isDark()));
  }

  private async mountGoogleButton(): Promise<void> {
    const host = this.googleButton()?.nativeElement;
    if (!this.googleEnabled || !environment.googleClientId || !host) return;
    try {
      const [gis, nonce] = await Promise.all([loadGoogleIdentity(), createNonce()]);
      gis.initialize({
        client_id: environment.googleClientId,
        ux_mode: 'popup',
        use_fedcm_for_button: true,
        nonce: nonce.hashed,
        callback: ({ credential }) => void this.finishGoogle(credential, nonce.raw),
      });
      const width = Math.min(Math.max(host.parentElement?.clientWidth || 320, 200), 400);
      this.renderGoogleButton.set((dark) => {
        host.replaceChildren();
        gis.renderButton(host, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          shape: 'rectangular',
          text: 'continue_with',
          locale: 'es',
          width,
        });
      });
      this.googleButtonReady.set(true);
    } catch {
      // Sin Google Identity Services queda el botón propio con redirección.
    }
  }

  private async finishGoogle(credential: string, nonce: string): Promise<void> {
    if (this.googlePending() || this.submitting()) return;
    this.googlePending.set(true);
    this.showError.set(false);
    try {
      this.saveGooglePending();
      const { error } = await googleOAuthClient().auth.signInWithIdToken({
        provider: 'google',
        token: credential,
        nonce,
      });
      if (error) throw error;
      await this.router.navigate(['/auth/google/callback'], { replaceUrl: true });
    } catch {
      this.failGoogle();
    }
  }

  protected async startGoogle(): Promise<void> {
    if (!this.googleEnabled || this.googlePending() || this.submitting()) return;
    this.googlePending.set(true);
    this.showError.set(false);
    try {
      this.saveGooglePending();
      const { error } = await googleOAuthClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL('/auth/google/callback', location.origin).href },
      });
      if (error) throw error;
    } catch {
      this.failGoogle();
    }
  }

  private saveGooglePending(): void {
    sessionStorage.setItem(
      'canchero-google-pending',
      JSON.stringify({
        remember: this.remember(),
        returnUrl: this.route.snapshot.queryParamMap.get('returnUrl'),
      }),
    );
  }

  private failGoogle(): void {
    sessionStorage.removeItem('canchero-google-pending');
    this.errorMessage.set('No se pudo iniciar el acceso con Google. Inténtalo de nuevo.');
    this.showError.set(true);
    this.googlePending.set(false);
  }

  protected onSubmit(): void {
    if (this.submitting() || this.googlePending()) return;
    this.submitting.set(true);
    this.auth.login(this.email(), this.password(), this.remember()).subscribe((user) => {
      if (!user) {
        this.showError.set(true);
        this.password.set('');
        this.submitting.set(false);
        return;
      }
      this.showError.set(false);
      this.submitting.set(false);
      if (user.rol === 'superadmin') {
        void this.router.navigateByUrl('/admin', { replaceUrl: true });
        return;
      }
      const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
      const regreso =
        returnUrl && /^\/(?![/\\])/.test(returnUrl) && !returnUrl.includes('\\')
          ? returnUrl
          : this.auth.isOwner()
            ? '/admin'
            : '/itinerario';
      void this.router.navigate(['/perfil'], {
        queryParams: { acceso: 'inicio', regreso },
        replaceUrl: true,
      });
    });
  }
}
