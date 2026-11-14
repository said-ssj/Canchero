import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  PlatformAdminService,
  PlatformRevenueSummary,
} from '@core/services/platform-admin.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header>
      <div>
        <p class="eyebrow">SUPERVISIÓN FINANCIERA</p>
        <h1>Pagos e ingresos de plataforma</h1>
        <p>Comisiones de reservas aprobadas, ajustadas por devoluciones registradas.</p>
      </div>
      <div class="filters">
        <label>Desde <input type="date" [(ngModel)]="from" /></label
        ><label>Hasta <input type="date" [(ngModel)]="to" /></label
        ><button (click)="load()" [disabled]="loading()">Consultar</button>
      </div>
    </header>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (summary(); as data) {
      <section class="cards">
        <article>
          <span>Comisión neta estimada</span
          ><strong>{{ data.estimatedNetCommission | currency: 'PEN' : 'symbol' : '1.2-2' }}</strong>
        </article>
        <article>
          <span>Comisiones antes de devoluciones</span
          ><strong>{{
            data.commissionBeforeRefunds | currency: 'PEN' : 'symbol' : '1.2-2'
          }}</strong>
        </article>
        <article>
          <span>Devoluciones registradas</span
          ><strong>{{ data.registeredRefunds | currency: 'PEN' : 'symbol' : '1.2-2' }}</strong>
        </article>
        <article>
          <span>Pagos aprobados</span><strong>{{ data.paymentCount }}</strong>
        </article>
      </section>
      <section class="panel">
        <h2>Volumen procesado</h2>
        <p>
          {{ data.grossProcessed | currency: 'PEN' : 'symbol' : '1.2-2' }} en
          {{ data.paymentCount }} pagos aprobados, del {{ data.from | date: 'd MMM y' }} al
          {{ data.to | date: 'd MMM y' }}.
        </p>
      </section>
    } @else if (loading()) {
      <p role="status">Cargando resumen…</p>
    }
    <p class="note">
      La comisión neta es una estimación basada en <code>comision_plataforma</code> y devoluciones
      marcadas como registradas. No equivale a caja conciliada ni a utilidad contable; los pagos
      presenciales o comisiones aún no liquidadas pueden no estar representados.
    </p>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 1400px;
        margin: auto;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        gap: 20px;
        margin-bottom: 22px;
      }
      .eyebrow {
        margin: 0;
        color: #27802d;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.1em;
      }
      h1 {
        margin: 5px 0;
        font-size: 28px;
      }
      header p:last-child,
      .panel p,
      .note {
        color: var(--color-ink-500, #64748b);
        line-height: 1.5;
      }
      .filters {
        display: flex;
        align-items: end;
        gap: 8px;
      }
      .filters label {
        display: grid;
        gap: 5px;
        font-size: 11px;
        color: var(--color-ink-500, #64748b);
      }
      input {
        padding: 9px;
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 5px;
        background: var(--color-surface, #fff);
        color: inherit;
      }
      .filters button {
        padding: 10px 14px;
        border: 0;
        border-radius: 5px;
        background: #27802d;
        color: white;
        font-weight: 700;
        cursor: pointer;
      }
      .cards {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .cards article,
      .panel {
        padding: 18px;
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 7px;
        background: var(--color-surface, #fff);
      }
      .cards article {
        display: grid;
        gap: 14px;
      }
      .cards span {
        font-size: 12px;
        color: var(--color-ink-500, #64748b);
      }
      .cards strong {
        font-size: 22px;
      }
      .panel {
        margin-top: 16px;
      }
      .panel h2 {
        margin: 0;
      }
      .note {
        margin-top: 18px;
        font-size: 12px;
      }
      .error {
        color: #b91c1c;
      }
      @media (max-width: 850px) {
        header {
          align-items: start;
          flex-direction: column;
        }
        .cards {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 480px) {
        .filters {
          width: 100%;
          flex-wrap: wrap;
        }
        .filters label {
          flex: 1;
        }
        .cards {
          grid-template-columns: 1fr 1fr;
        }
        .cards article {
          padding: 13px;
        }
        .cards strong {
          font-size: 18px;
        }
      }
    `,
  ],
})
export class PlatformFinance {
  private readonly service = inject(PlatformAdminService);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly summary = signal<PlatformRevenueSummary | null>(null);
  protected from = this.dateOffset(-29);
  protected to = this.dateOffset(0);
  constructor() {
    this.load();
  }
  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.summary.set(null);
    this.service.revenue(this.from, this.to).subscribe({
      next: (value) => {
        this.summary.set(value);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'No se pudo cargar el resumen financiero.');
        this.loading.set(false);
      },
    });
  }
  private dateOffset(offset: number): string {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
