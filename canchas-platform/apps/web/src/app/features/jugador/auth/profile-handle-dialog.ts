import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';
import { CommunityProfileService, HandleState } from '@core/services/community-profile.service';
@Component({
  selector: 'app-profile-handle-dialog',
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Cambiar identificador</h2>
    <mat-dialog-content>
      <p>Al guardar, tendrás que esperar <strong>tres meses</strong> para volver a cambiarlo.</p>
      @if (loading()) {
        <p role="status">Consultando disponibilidad…</p>
      }
      @if (state(); as s) {
        @if (!s.canChange) {
          <p role="status">Podrás cambiarlo desde {{ date(s.nextChangeAt) }}.</p>
        }
        <mat-form-field
          appearance="outline"
          subscriptSizing="dynamic"
          class="cn-field"
          style="width:100%;margin-top:16px"
        >
          <mat-label>Identificador público</mat-label><span matTextPrefix>@</span>
          <input
            matInput
            [(ngModel)]="handle"
            [disabled]="!s.canChange || saving()"
            maxlength="30"
            autocomplete="off"
          />
          <mat-hint>De 3 a 30 letras, números, puntos o guiones.</mat-hint>
        </mat-form-field>
      }
      @if (error()) {
        <p role="alert">{{ error() }}</p>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end"
      ><button mat-button [disabled]="saving()" (click)="ref.close()">Cancelar</button
      ><button mat-flat-button [disabled]="!valid()" (click)="save()">
        {{ saving() ? 'Guardando…' : 'Guardar identificador' }}
      </button></mat-dialog-actions
    >
  `,
})
export class ProfileHandleDialog {
  protected readonly api = inject(CommunityProfileService);
  protected readonly ref = inject(MatDialogRef<ProfileHandleDialog>);
  private readonly data = inject(MAT_DIALOG_DATA);
  protected handle = this.data.handle || '';
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly state = signal<HandleState | null>(null);
  protected readonly error = signal('');
  constructor() {
    void this.load();
  }
  private async load() {
    try {
      this.state.set(await firstValueFrom(this.api.handleState()));
    } catch {
      this.error.set('No pudimos consultar el plazo. Cierra e intenta nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }
  protected date(value: string | null) {
    return value
      ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'long', timeZone: 'America/Lima' }).format(
          new Date(value),
        )
      : '';
  }
  protected valid() {
    return (
      this.state()?.canChange &&
      !this.loading() &&
      !this.saving() &&
      /^[a-z0-9_.-]{3,30}$/.test(this.handle.trim().toLowerCase().replace(/^@/, '')) &&
      this.handle.trim().replace(/^@/, '').toLowerCase() !== this.state()?.handle
    );
  }
  protected async save() {
    if (!this.valid()) return;
    this.saving.set(true);
    this.ref.disableClose = true;
    this.error.set('');
    try {
      const result = await firstValueFrom(this.api.changeHandle(this.handle));
      this.ref.close(result);
    } catch (e: any) {
      this.error.set(
        e?.error?.message ||
          'No se pudo guardar. El identificador puede estar ocupado o dentro del plazo de tres meses.',
      );
    } finally {
      this.saving.set(false);
      this.ref.disableClose = false;
    }
  }
}
