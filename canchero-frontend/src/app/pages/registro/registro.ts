import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import type { UserRole } from '../../models/user.model';

@Component({
  imports: [FormsModule, RouterLink],
  selector: 'app-registro',
  styleUrl: './registro.css',
  templateUrl: './registro.html',
})
export class Registro {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly rol = signal<'jugador' | 'dueno'>('jugador');
  protected readonly rolQuery = inject(ActivatedRoute);

  constructor() {
    const rol = this.rolQuery.snapshot.queryParamMap.get('rol');
    if (rol === 'dueno') {
      this.rol.set('dueno');
    }
  }

  protected readonly nombre = signal('');
  protected readonly email = signal('');
  protected readonly telefono = signal('');
  protected readonly sede = signal('');
  protected readonly password = signal('');
  protected readonly passwordConfirm = signal('');
  protected readonly terminos = signal(false);

  protected readonly showPass = signal(false);
  protected readonly showPassConfirm = signal(false);

  protected readonly feedbackVisible = signal(false);
  protected readonly feedbackText = signal('Revisa los campos obligatorios.');
  protected readonly submitting = signal(false);
  protected readonly success = signal(false);

  protected readonly passMatch = computed(
    () => !!this.password() && this.password() === this.passwordConfirm(),
  );

  protected readonly terminosModalOpen = signal(false);
  protected readonly modalTitulo = signal('Términos y Condiciones');
  protected readonly modalContenido = signal('');

  protected verTerminos(e: Event): void {
    e.preventDefault();
    this.modalTitulo.set('Términos y Condiciones del Servicio');
    this.modalContenido.set('Canchero.MVP facilita la reserva de canchas deportivas. Al utilizar la plataforma aceptas respetar los horarios confirmados y las normas internas de cada complejo.');
    this.terminosModalOpen.set(true);
  }

  protected verPrivacidad(e: Event): void {
    e.preventDefault();
    this.modalTitulo.set('Política de Privacidad');
    this.modalContenido.set('Tus datos personales y de contacto se utilizan exclusivamente para la gestión de reservas, emisión de pases QR y contacto de emergencia con la sede.');
    this.terminosModalOpen.set(true);
  }

  protected readonly roleText = computed(() =>
    this.rol() === 'jugador'
      ? 'Reserva turnos al instante, divide pagos y únete a convocatorias.'
      : 'Digitaliza tus canchas, automatiza cobros y llena tus horarios valle.',
  );

  protected selectRol(rol: 'jugador' | 'dueno'): void {
    this.rol.set(rol);
  }

  protected onSubmit(): void {
    const nombre = this.nombre().trim();
    const email = this.email().trim();
    const telefono = this.telefono().trim();
    const pass = this.password();
    const confirm = this.passwordConfirm();

    if (!nombre || !email || !telefono) {
      this.feedbackText.set('Por favor completa todos los campos requeridos.');
      this.feedbackVisible.set(true);
      return;
    }

    if (this.rol() === 'dueno' && !this.sede().trim()) {
      this.feedbackText.set('Por favor ingresa el nombre de tu sede o complejo.');
      this.feedbackVisible.set(true);
      return;
    }

    if (!this.terminos()) {
      this.feedbackText.set('Debes aceptar los Términos y Condiciones.');
      this.feedbackVisible.set(true);
      return;
    }

    if (pass.length < 8) {
      this.feedbackText.set('La contraseña debe contener al menos 8 caracteres.');
      this.feedbackVisible.set(true);
      return;
    }

    if (pass !== confirm) {
      this.feedbackText.set('Las contraseñas no coinciden. Verifícalas.');
      this.feedbackVisible.set(true);
      return;
    }

    this.feedbackVisible.set(false);
    this.submitting.set(true);

    const userRole: UserRole = this.rol() === 'dueno' ? 'OWNER' : 'PLAYER';
    this.auth
      .register({ nombre, email, telefono, rol: userRole, password: pass })
      .subscribe((user) => {
        if (!user) {
          this.submitting.set(false);
          this.feedbackText.set('No se pudo crear la cuenta. Inténtalo nuevamente.');
          this.feedbackVisible.set(true);
          this.success.set(false);
          return;
        }
        setTimeout(() => {
          this.submitting.set(false);
          this.success.set(true);
          setTimeout(() => {
            if (user.rol === 'OWNER') {
              void this.router.navigate(['/admin']);
            } else {
              void this.router.navigate(['/itinerario']);
            }
          }, 900);
        }, 1000);
      });
  }
}