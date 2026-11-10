import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { Location } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { ThemeToggle } from '@shared/components/theme-toggle/theme-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressBarModule } from '@angular/material/progress-bar';

/** "Olvidé mi contraseña": sin token pide el enlace por correo; con ?token= fija la nueva contraseña. */
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
  selector: 'app-recuperar',
  styleUrl: '../login/login.css',
  templateUrl: './recuperar.html',
})
export class Recuperar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly token = inject(ActivatedRoute).snapshot.queryParamMap.get('token') ?? '';

  constructor() {
    // El enlace es una llave de la cuenta: se saca de la barra de direcciones para que no quede en el historial.
    if (this.token) inject(Location).replaceState('/recuperar');
  }

  protected readonly email = signal('');
  protected readonly password = signal('');
  protected readonly confirm = signal('');
  protected readonly showPassword = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal('');
  protected readonly done = signal('');

  protected async pedirEnlace(): Promise<void> {
    if (this.submitting()) return;
    if (!/^\S+@\S+\.\S+$/.test(this.email().trim())) {
      this.error.set('Escribe un correo válido.');
      return;
    }
    await this.run(() => firstValueFrom(this.auth.requestPasswordReset(this.email())));
  }

  protected async cambiarClave(): Promise<void> {
    if (this.submitting()) return;
    if (this.password().length < 8) {
      this.error.set('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (this.password() !== this.confirm()) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    await this.run(() => firstValueFrom(this.auth.resetPassword(this.token, this.password())));
  }

  protected irAlLogin(): void {
    void this.router.navigateByUrl('/login');
  }

  private async run(call: () => Promise<{ message: string }>): Promise<void> {
    this.error.set('');
    this.submitting.set(true);
    try {
      this.done.set((await call()).message);
    } catch (e) {
      this.error.set(
        (e instanceof HttpErrorResponse && e.error?.message) ||
          'No se pudo conectar con el servidor. Inténtalo de nuevo.',
      );
    } finally {
      this.submitting.set(false);
    }
  }
}
