import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MAT_RIPPLE_GLOBAL_OPTIONS } from '@angular/material/core';
import { MatSelectModule } from '@angular/material/select';

@Component({
  providers: [{ provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } }],
  styles: [
    ':host { --mat-button-text-hover-state-layer-opacity:0; --mat-button-filled-hover-state-layer-opacity:0; }',
  ],
  imports: [
    FormsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
  ],
  template: `<h2 mat-dialog-title>Reportar conversación</h2>
    <mat-dialog-content
      ><p>La persona permanecerá bloqueada. Selecciona el motivo del reporte.</p>
      <mat-form-field appearance="outline" style="width:100%;margin:12px 0"
        ><mat-label>¿Qué ocurrió?</mat-label>
        <mat-select [(ngModel)]="category">
          @for (option of options; track option.value) {
            <mat-option [value]="option.value">{{ option.label }}</mat-option>
          }
        </mat-select>
      </mat-form-field>
      <mat-form-field appearance="outline" style="width:100%;margin-top:12px"
        ><mat-label>{{
          category === 'otros' ? 'Describe el problema' : 'Detalles adicionales (opcional)'
        }}</mat-label>
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
        [disabled]="!category || (category === 'otros' && reason.trim().length < 10)"
        (click)="dialog.close({ category, details: reason.trim() })"
      >
        Enviar reporte
      </button>
    </mat-dialog-actions>`,
})
export class ChatReportDialog {
  protected category = '';
  protected readonly options = [
    { value: 'acoso', label: 'Acoso o intimidación' },
    { value: 'spam', label: 'Spam o publicidad no deseada' },
    { value: 'estafa', label: 'Estafa o fraude' },
    { value: 'odio', label: 'Discriminación u odio' },
    { value: 'violencia', label: 'Amenazas o violencia' },
    { value: 'sexual', label: 'Contenido sexual no solicitado' },
    { value: 'suplantacion', label: 'Suplantación de identidad' },
    { value: 'otros', label: 'Otros' },
  ];
  protected reason = '';
  protected dialog = inject(MatDialogRef<ChatReportDialog>);
}
