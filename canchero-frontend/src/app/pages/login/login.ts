import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-login',
  styleUrl: './login.css',
  templateUrl: './login.html',
})
export class Login {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly remember = signal(true);
  protected readonly showError = signal(false);
  protected readonly submitting = signal(false);
  protected readonly showPassword = signal(false);

  protected onSubmit(): void {
    this.auth.login(this.email(), this.password()).subscribe((user) => {
      if (!user) {
        this.showError.set(true);
        this.password.set('');
        return;
      }
      this.showError.set(false);
      this.submitting.set(true);
      setTimeout(() => {
        if (user.rol === 'OWNER') {
          void this.router.navigate(['/admin']);
        } else {
          void this.router.navigate(['/itinerario']);
        }
      }, 600);
    });
  }

  protected forgotPassword(): void {
    alert('Se ha enviado un enlace de recuperación a tu correo registrado.');
  }
}