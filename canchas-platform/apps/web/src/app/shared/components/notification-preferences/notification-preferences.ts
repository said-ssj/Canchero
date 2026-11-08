import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';

interface Preferences {
  bookingEmails: boolean;
  reminders: boolean;
  emailAvailable: boolean;
}
@Component({
  selector: 'app-notification-preferences',
  imports: [FormsModule],
  template: `
    <section aria-labelledby="notification-preferences-title">
      <h2 id="notification-preferences-title">Notificaciones</h2>
      <p>Elige qué avisos de tus reservas quieres recibir por correo.</p>
      @if (preferences(); as p) {
        <form (ngSubmit)="save()">
          <fieldset [disabled]="saving()">
            <label
              ><input type="checkbox" name="bookingEmails" [(ngModel)]="p.bookingEmails" />
              Confirmaciones, cancelaciones y cambios de horario</label
            >
            <label
              ><input
                type="checkbox"
                name="reminders"
                [(ngModel)]="p.reminders"
                [disabled]="!p.bookingEmails"
              />
              Recordatorio antes del partido</label
            >
          </fieldset>
          @if (!p.emailAvailable) {
            <p class="hint">
              El envío de correos aún no está activado. Puedes guardar tus preferencias.
            </p>
          }
          <button class="btn" type="submit" [disabled]="saving()">
            {{ saving() ? 'Guardando…' : 'Guardar notificaciones' }}
          </button>
        </form>
      } @else if (!error()) {
        <p class="hint">Cargando preferencias…</p>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
        <button type="button" class="btn" (click)="load()">Reintentar</button>
      }
      @if (saved()) {
        <p role="status">Preferencias guardadas.</p>
      }
    </section>
  `,
  styles: `
    section {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--line);
    }
    h2 {
      font-size: 18px;
      margin-bottom: 8px;
    }
    p {
      font-size: 13px;
      color: var(--muted);
      margin-bottom: 12px;
    }
    fieldset {
      display: grid;
      gap: 14px;
      padding: 0;
      border: 0;
      margin-bottom: 16px;
    }
    label {
      display: flex;
      gap: 10px;
      align-items: start;
      font-size: 13px;
    }
    input {
      flex: none;
      margin-top: 3px;
      accent-color: var(--primary);
    }
    .hint {
      font-size: 12px;
    }
  `,
})
export class NotificationPreferences {
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiUrl + '/auth/notification-preferences';
  readonly preferences = signal<Preferences | null>(null);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly saved = signal(false);
  ngOnInit(): void {
    void this.load();
  }
  async load(): Promise<void> {
    this.error.set('');
    try {
      this.preferences.set(await firstValueFrom(this.http.get<Preferences>(this.url)));
    } catch {
      this.error.set('No se pudieron cargar las preferencias de notificaciones.');
    }
  }
  async save(): Promise<void> {
    const preferences = this.preferences();
    if (!preferences || this.saving()) return;
    this.saving.set(true);
    this.saved.set(false);
    this.error.set('');
    try {
      this.preferences.set(
        await firstValueFrom(
          this.http.put<Preferences>(this.url, {
            bookingEmails: preferences.bookingEmails,
            reminders: preferences.reminders,
          }),
        ),
      );
      this.saved.set(true);
    } catch {
      this.error.set('No se pudieron guardar tus preferencias.');
    } finally {
      this.saving.set(false);
    }
  }
}
