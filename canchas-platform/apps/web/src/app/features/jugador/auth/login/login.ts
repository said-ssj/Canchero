import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly remember = signal(true);
  protected readonly showError = signal(false);
  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);
  protected readonly errorMessage = this.auth.loginError;

  protected onSubmit(): void {
    if (this.submitting()) return;
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
      if (user.rol === 'OWNER' || user.rol === 'dueno' || user.rol === 'admin') {
        void this.router.navigate(['/admin']);
      } else {
        const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
        if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
          void this.router.navigateByUrl(returnUrl);
        } else {
          void this.router.navigate(['/itinerario']);
        }
      }
    });
  }
}
