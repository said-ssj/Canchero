import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MAT_RIPPLE_GLOBAL_OPTIONS } from '@angular/material/core';

@Component({
  providers: [{ provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } }],
  styles: [
    ':host { --mat-button-text-hover-state-layer-opacity:0; --mat-button-filled-hover-state-layer-opacity:0; }',
  ],
  imports: [FormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `<h2 mat-dialog-title>Reportar conversación</h2>
    <mat-dialog-content
      ><p>Describe lo ocurrido. El reporte quedará registrado para revisión.</p>
      <mat-form-field appearance="outline" style="width:100%;margin-top:12px"
        ><mat-label>Motivo</mat-label>
        <textarea
          matInput
          [(ngModel)]="reason"
          maxlength="1000"
          rows="4"
          style="resize:vertical"
        ></textarea></mat-form-field
    ></mat-dialog-content>
    <mat-dialog-actions align="end"
      ><button mat-button mat-dialog-close>Cancelar</button>
      <button
        mat-flat-button
        [disabled]="reason.trim().length < 5"
        (click)="dialog.close(reason.trim())"
      >
        Enviar reporte
      </button>
    </mat-dialog-actions>`,
})
export class ChatReportDialog {
  protected reason = '';
  protected dialog = inject(MatDialogRef<ChatReportDialog>);
}
