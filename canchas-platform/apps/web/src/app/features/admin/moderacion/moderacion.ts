import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MAT_RIPPLE_GLOBAL_OPTIONS } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
interface Case {
  id: string;
  nombre: string;
  reportes: number;
  calificados: number;
  suspendida_hasta: string | null;
}
interface Evidence {
  id: string;
  categoria: string;
  motivo: string;
  mensaje: string;
  calificado: boolean;
  creado_en: string;
}
@Component({
  providers: [{ provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } }],
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  template: ` <main>
    <h1>Revisión de reportes</h1>
    <p>
      Solo reportes de personas distintas. Las cuentas nuevas no producen una suspensión automática.
    </p>
    @if (error()) {
      <p role="alert">{{ error() }}</p>
    }
    @if (loading()) {
      <p role="status">Cargando revisiones…</p>
    }
    @if (allowed()) {
      <button mat-stroked-button (click)="load()" [disabled]="loading()">Actualizar</button>
      <div class="cases">
        @for (item of cases(); track item.id) {
          <section>
            <h2>{{ item.nombre }}</h2>
            <p>
              {{ item.reportes }} reportes · {{ item.calificados }} cumplen los requisitos del
              umbral
            </p>
            <p>
              {{
                item.suspendida_hasta
                  ? 'Restricción hasta ' + (item.suspendida_hasta | date: 'd MMM, HH:mm')
                  : 'Revisión sin suspensión automática'
              }}
            </p>
            <button mat-stroked-button (click)="select(item)">Revisar evidencia</button>
          </section>
        } @empty {
          @if (!loading()) {
            <p>No hay revisiones pendientes.</p>
          }
        }
      </div>
      @if (selected(); as item) {
        <section>
          <h2>Revisar {{ item.nombre }}</h2>
          <p>Los reportes no prueban una infracción. Revisa la evidencia antes de decidir.</p>
          @for (report of evidence(); track report.id) {
            <article>
              <strong>{{ report.categoria }}</strong>
              <p>{{ report.motivo }}</p>
              <blockquote>{{ report.mensaje }}</blockquote>
              <small
                >{{
                  report.calificado
                    ? 'Cuenta con antigüedad y perfil completo'
                    : 'No cuenta para suspensión automática'
                }}
                · {{ report.creado_en | date: 'd MMM, HH:mm' }}</small
              >
            </article>
          }
          <form (ngSubmit)="resolve()">
            <mat-form-field appearance="outline"
              ><mat-label>Decisión</mat-label
              ><mat-select name="decision" [(ngModel)]="decision"
                ><mat-option value="descartar">Descartar reportes y levantar restricción</mat-option
                ><mat-option value="mantener"
                  >Mantener restricción por 24 horas</mat-option
                ></mat-select
              ></mat-form-field
            >
            <mat-form-field appearance="outline"
              ><mat-label>Justificación de la revisión</mat-label
              ><textarea
                matInput
                name="reason"
                [(ngModel)]="reason"
                rows="3"
                maxlength="1000"
                required
                style="resize:vertical"
              ></textarea>
            </mat-form-field>
            <div>
              <button mat-stroked-button type="button" (click)="selected.set(null)">Cancelar</button
              ><button
                mat-flat-button
                type="submit"
                [disabled]="saving() || reason.trim().length < 10 || !decision"
              >
                Confirmar decisión
              </button>
            </div>
          </form>
        </section>
      }
    }
  </main>`,
  styles: [
    `
      main {
        max-width: 1000px;
        margin: auto;
        padding: 24px;
        color: var(--color-ink-900);
      }
      h1 {
        font-size: 26px;
      }
      h2 {
        font-size: 17px;
      }
      p {
        color: var(--color-ink-600);
        line-height: 1.5;
      }
      .cases {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr));
        gap: 14px;
        margin: 20px 0;
      }
      section {
        padding: 18px;
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 6px;
      }
      article {
        padding: 12px 0;
        border-bottom: 1px solid var(--color-border);
        overflow-wrap: anywhere;
      }
      blockquote {
        margin: 10px 0;
        padding-left: 12px;
        border-left: 2px solid var(--color-border);
        white-space: pre-wrap;
      }
      form {
        display: grid;
        gap: 16px;
        margin-top: 24px;
      }
      form > div {
        display: flex;
        gap: 10px;
        justify-content: flex-end;
      }
      mat-form-field {
        width: 100%;
      }
      :host {
        --mat-button-outlined-hover-state-layer-opacity: 0;
        --mat-button-filled-hover-state-layer-opacity: 0;
      }
    `,
  ],
})
export class Moderacion {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = environment.apiUrl + '/community/moderation/cases';
  protected readonly allowed = signal(false);
  protected readonly cases = signal<Case[]>([]);
  protected readonly evidence = signal<Evidence[]>([]);
  protected readonly selected = signal<Case | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected reason = '';
  protected decision = '';
  async ngOnInit() {
    await this.auth.ready;
    this.allowed.set(this.auth.isSuperAdmin());
    if (!this.allowed()) {
      this.error.set('Solo el superadministrador puede acceder a las revisiones.');
      return;
    }
    await this.load();
  }
  protected async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      this.cases.set(await firstValueFrom(this.http.get<Case[]>(this.url)));
    } catch {
      this.error.set('No se pudieron cargar las revisiones.');
    } finally {
      this.loading.set(false);
    }
  }
  protected async select(item: Case) {
    this.selected.set(null);
    this.error.set('');
    try {
      this.evidence.set(await firstValueFrom(this.http.get<Evidence[]>(this.url + '/' + item.id)));
      this.reason = '';
      this.decision = '';
      this.selected.set(item);
    } catch {
      this.error.set('No se pudo cargar la evidencia.');
    }
  }
  protected async resolve() {
    const item = this.selected();
    if (!item || this.saving() || this.reason.trim().length < 10 || !this.decision) return;
    this.saving.set(true);
    try {
      await firstValueFrom(
        this.http.post(this.url + '/' + item.id, {
          decision: this.decision,
          reason: this.reason.trim(),
        }),
      );
      this.selected.set(null);
      await this.load();
    } catch {
      this.error.set('No se guardó la decisión. Actualiza y vuelve a revisar.');
    } finally {
      this.saving.set(false);
    }
  }
}
