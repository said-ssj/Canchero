import { ThemeToggle } from '@shared/components/theme-toggle/theme-toggle';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService } from '@core/auth/auth.service';
import { googleOAuthClient } from '@core/supabase/client';
import { environment } from '@env/environment';

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

  protected async startGoogle(): Promise<void> {
    if (!this.googleEnabled || this.googlePending() || this.submitting()) return;
    this.googlePending.set(true);
    this.showError.set(false);
    try {
      sessionStorage.setItem(
        'canchero-google-pending',
        JSON.stringify({
          remember: this.remember(),
          returnUrl: this.route.snapshot.queryParamMap.get('returnUrl'),
        }),
      );
      const { error } = await googleOAuthClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: new URL('/auth/google/callback', location.origin).href },
      });
      if (error) throw error;
    } catch {
      sessionStorage.removeItem('canchero-google-pending');
      this.errorMessage.set('No se pudo iniciar el acceso con Google. Inténtalo de nuevo.');
      this.showError.set(true);
      this.googlePending.set(false);
    }
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
