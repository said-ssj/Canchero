import { Component, Injectable, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { firstValueFrom } from 'rxjs';

export interface ConfirmationData {
  title: string;
  message: string;
  confirmLabel: string;
}

@Component({
  selector: 'app-danger-confirmation',
  standalone: true,
  imports: [MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content><p>{{ data.message }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button type="button" mat-button disableRipple data-cancel [mat-dialog-close]="false">Volver</button>
      <button type="button" mat-button disableRipple class="danger" [mat-dialog-close]="true">{{ data.confirmLabel }}</button>
    </mat-dialog-actions>
  `,
  styles: [`:host { display:block; } h2 { font-size:20px; } p { line-height:1.6; margin:0; } .danger { color:#b91c1c; }`],
})
export class DangerConfirmation {
  readonly data = inject<ConfirmationData>(MAT_DIALOG_DATA);
}

@Injectable({ providedIn: 'root' })
export class ConfirmationService {
  private readonly dialog = inject(MatDialog);

  async confirm(data: ConfirmationData): Promise<boolean> {
    const ref = this.dialog.open(DangerConfirmation, {
      data, width: '440px', maxWidth: 'calc(100vw - 32px)',
      autoFocus: '[data-cancel]', restoreFocus: true,
    });
    return (await firstValueFrom(ref.afterClosed())) === true;
  }
}
