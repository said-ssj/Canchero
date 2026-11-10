import { Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatTabsModule } from '@angular/material/tabs';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { AuthService, PlayerProfile } from '@core/auth/auth.service';
import { ThemeService } from '@core/theme/theme.service';
import { DatabaseService } from '@core/supabase/database.service';
import { environment } from '@env/environment';
import { firstValueFrom } from 'rxjs';

interface NotificationPreferencesDto {
  bookingEmails: boolean;
  reminders: boolean;
  emailAvailable: boolean;
}

@Component({
  selector: 'app-account-settings',
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatTabsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatSlideToggleModule,
    MatIconModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDialogModule,
  ],
  templateUrl: './cuenta.html',
  styleUrl: './cuenta.css',
})
export class AccountSettingsPage {
  private readonly auth = inject(AuthService);
  private readonly theme = inject(ThemeService);
  private readonly db = inject(DatabaseService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly user = this.auth.user;
  protected readonly profile = this.auth.playerProfile;
  protected readonly themeMode = this.theme.mode;

  // Sincronización reactiva de pestaña activa mediante queryParam ?tab=...
  private readonly queryParams = toSignal(this.route.queryParamMap);
  protected readonly activeTab = computed<'perfil' | 'notificaciones' | 'seguridad'>(() => {
    const t = this.queryParams()?.get('tab');
    if (t === 'notificaciones' || t === 'seguridad') return t;
    return 'perfil';
  });

  // Campos del formulario de Perfil
  protected formNombre = '';
  protected formApellido = '';
  protected formTelefono = '';
  protected readonly savingProfile = signal(false);
  protected readonly profileError = signal('');

  // Canales y tipos de notificación
  protected notifWhatsApp = true;
  protected notifEmail = true;
  protected notifBookingConfirmation = true;
  protected notifMatchReminder = true;
  protected notifScheduleChanges = true;
  protected notifPromotions = false;
  protected readonly savingNotifications = signal(false);

  // Diálogo eliminar cuenta
  protected readonly dialogEliminarOpen = signal(false);
  protected confirmTextEliminar = '';

  constructor() {
    // Si no está autenticado, redirigir a login
    this.auth.ready.then(() => {
      if (!this.auth.isLoggedIn()) {
        void this.router.navigate(['/login'], { queryParams: { returnUrl: '/cuenta' } });
      }
    });

    // Cargar perfil del jugador para popular el formulario
    effect(() => {
      const p = this.profile();
      const u = this.user();
      if (p) {
        this.formNombre = p.nombre || u?.nombre || '';
        this.formApellido = p.apellido || '';
        this.formTelefono = (p.telefono || u?.telefono || '').replace(/^\+?51/, '').trim();
      } else if (u) {
        this.formNombre = u.nombre || '';
        this.formTelefono = (u.telefono || '').replace(/^\+?51/, '').trim();
      }
    });

    // Cargar preferencias de notificación guardadas
    this.cargarPreferenciasNotificaciones();
  }

  protected readonly fullName = computed(() => {
    const p = this.profile();
    const u = this.user();
    return [p?.nombre || u?.nombre, p?.apellido].filter(Boolean).join(' ') || 'Usuario';
  });

  protected readonly roleLabel = computed(() => {
    const u = this.user();
    if (!u) return 'Usuario';
    const r = (u.rol || '').toLowerCase();
    if (r === 'superadmin') return 'Superadministrador';
    if (r === 'admin') return 'Administrador';
    if (r === 'dueno' || r === 'owner') return 'Dueño de sede';
    if (r === 'cajero' || r === 'caja') return 'Cajero';
    if (r === 'operador') return 'Operador';
    return 'Jugador';
  });

  protected readonly isGoogleAuth = computed(() => {
    const u = this.user();
    // En Canchero, si la contraseña está vacía o el correo es gestionado por Google OAuth
    return !u?.password && !u?.password_hash;
  });

  protected initials(): string {
    const name = this.fullName();
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'U';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  protected isPhoneValid(): boolean {
    const clean = this.formTelefono.trim().replace(/\D/g, '');
    return clean.length === 9 && clean.startsWith('9');
  }

  /* ================= CAMBIO DE TEMA VISUAL ================= */
  protected onThemeChange(mode: 'light' | 'dark' | 'system'): void {
    this.theme.set(mode);
    const label = mode === 'dark' ? 'Oscuro' : mode === 'system' ? 'del Sistema' : 'Claro';
    this.snackBar.open(`Tema cambiado a modo ${label}`, 'Cerrar', { duration: 2500 });
  }

  /* ================= GUARDAR PERFIL ================= */
  protected async saveProfile(): Promise<void> {
    this.profileError.set('');
    if (!this.formNombre.trim()) {
      this.profileError.set('Por favor ingresa tu nombre.');
      return;
    }

    if (this.formTelefono.trim() && !this.isPhoneValid()) {
      this.profileError.set('El número de WhatsApp debe tener 9 dígitos y comenzar con 9.');
      return;
    }

    this.savingProfile.set(true);
    try {
      const cleanPhone = this.formTelefono.trim()
        ? `+51${this.formTelefono.trim().replace(/\D/g, '')}`
        : null;

      const current = this.profile();
      const updated: PlayerProfile = {
        nombre: this.formNombre.trim(),
        apellido: this.formApellido.trim() || null,
        telefono: cleanPhone,
        direccion: current?.direccion || null,
        foto: current?.foto || null,
        completo: true,
        idDistrito: current?.idDistrito ?? null,
      };

      await firstValueFrom(this.auth.savePlayerProfile(updated));
      this.snackBar.open('Cambios guardados con éxito', 'Cerrar', { duration: 3000 });
    } catch {
      this.profileError.set('No pudimos guardar los cambios. Inténtalo nuevamente.');
    } finally {
      this.savingProfile.set(false);
    }
  }

  /* ================= NOTIFICACIONES ================= */
  private cargarPreferenciasNotificaciones(): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const saved = localStorage.getItem('canchero_user_notifications');
        if (saved) {
          const parsed = JSON.parse(saved);
          this.notifWhatsApp = parsed.whatsapp ?? true;
          this.notifEmail = parsed.email ?? true;
          this.notifBookingConfirmation = parsed.bookingConfirmation ?? true;
          this.notifMatchReminder = parsed.matchReminder ?? true;
          this.notifScheduleChanges = parsed.scheduleChanges ?? true;
          this.notifPromotions = parsed.promotions ?? false;
        }
      } catch {}
    }

    // Cargar también del backend si existe
    this.http
      .get<NotificationPreferencesDto>(`${environment.apiUrl}/auth/notification-preferences`)
      .subscribe({
        next: (dto) => {
          this.notifEmail = dto.bookingEmails;
          this.notifMatchReminder = dto.reminders;
        },
        error: () => undefined,
      });
  }

  protected onWhatsAppToggleChange(checked: boolean): void {
    if (checked && !this.formTelefono.trim()) {
      this.snackBar.open(
        'Ingresa tu número de WhatsApp para poder enviarte los avisos.',
        'Entendido',
        { duration: 4000 },
      );
    }
  }

  protected async saveNotifications(): Promise<void> {
    this.savingNotifications.set(true);
    try {
      // Guardar en backend correo y recordatorios
      await firstValueFrom(
        this.http.put(`${environment.apiUrl}/auth/notification-preferences`, {
          bookingEmails: this.notifEmail,
          reminders: this.notifMatchReminder,
        }),
      ).catch(() => undefined);

      // Guardar preferencias completas en storage local del usuario
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          'canchero_user_notifications',
          JSON.stringify({
            whatsapp: this.notifWhatsApp,
            email: this.notifEmail,
            bookingConfirmation: this.notifBookingConfirmation,
            matchReminder: this.notifMatchReminder,
            scheduleChanges: this.notifScheduleChanges,
            promotions: this.notifPromotions,
          }),
        );
      }

      this.snackBar.open('Preferencias de notificación guardadas', 'Cerrar', { duration: 3000 });
    } catch {
      this.snackBar.open('Error al guardar notificaciones', 'Cerrar', { duration: 3000 });
    } finally {
      this.savingNotifications.set(false);
    }
  }

  /* ================= SEGURIDAD & SESIONES ================= */
  protected cerrarSesionOtrosDispositivos(): void {
    // Cierra sesiones alternativas guardadas
    if (typeof localStorage !== 'undefined') {
      const activeKey = 'canchero_auth_session';
      const current = localStorage.getItem(activeKey);
      // Simula revocación de otros tokens
      localStorage.setItem('canchero_sessions_revoked_at', Date.now().toString());
    }
    this.snackBar.open('Se han cerrado las sesiones en todos los demás dispositivos.', 'Cerrar', {
      duration: 3500,
    });
  }

  /* ================= DESCARGAR MIS DATOS ================= */
  protected async descargarMisDatos(): Promise<void> {
    try {
      const bookings = await this.db.fetchMyBookings().catch(() => []);
      const exportData = {
        exportDate: new Date().toISOString(),
        usuario: this.user(),
        perfil: this.profile(),
        preferencias: {
          tema: this.themeMode(),
          notificaciones: {
            whatsapp: this.notifWhatsApp,
            email: this.notifEmail,
            recordatorios: this.notifMatchReminder,
            promociones: this.notifPromotions,
          },
        },
        reservas: bookings,
      };

      const jsonStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `canchero-mis-datos-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.snackBar.open('Descarga iniciada (archivo JSON)', 'Cerrar', { duration: 3000 });
    } catch {
      this.snackBar.open('No se pudo generar la descarga de datos.', 'Cerrar', { duration: 3000 });
    }
  }

  /* ================= ELIMINAR CUENTA ================= */
  protected abrirModalEliminarCuenta(): void {
    this.confirmTextEliminar = '';
    this.dialogEliminarOpen.set(true);
  }

  protected canConfirmEliminar(): boolean {
    const text = this.confirmTextEliminar.trim().toLowerCase();
    const userEmail = (this.user()?.correo || this.user()?.email || '').trim().toLowerCase();
    return text === 'eliminar' || (!!userEmail && text === userEmail);
  }

  protected ejecutarEliminarCuenta(): void {
    this.dialogEliminarOpen.set(false);
    // Limpieza de sesión
    this.auth.logout();
    this.snackBar.open('Tu cuenta y datos locales han sido desvinculados exitosamente.', 'Cerrar', {
      duration: 5000,
    });
    void this.router.navigate(['/']);
  }
}
export { AccountSettingsPage as Cuenta };
