import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PlatformAdminService, PlatformAuditEvent } from '@core/services/platform-admin.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <header>
      <div>
        <p class="eyebrow">TRAZABILIDAD</p>
        <h1>Auditoría y actividad</h1>
        <p>Registro de cambios hechos por superadministradores en la API.</p>
      </div>
      <button (click)="load()" [disabled]="loading()">Actualizar</button>
    </header>
    <section class="filters">
      <label>Desde <input type="date" [(ngModel)]="from" /></label
      ><label>Hasta <input type="date" [(ngModel)]="to" /></label
      ><label class="search"
        >Buscar actor, rol o ruta
        <input type="search" [(ngModel)]="query" (keyup.enter)="load()" /></label
      ><button (click)="load()" [disabled]="loading()">Filtrar</button>
    </section>
    @if (error()) {
      <p class="error" role="alert">{{ error() }}</p>
    }
    @if (loading()) {
      <p role="status">Cargando actividad…</p>
    }
    <section class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Fecha</th>
            <th>Superadmin</th>
            <th>Acción API</th>
            <th>Resultado</th>
          </tr>
        </thead>
        <tbody>
          @for (event of events(); track event.id) {
            <tr>
              <td>{{ event.occurredAt | date: 'd MMM y, HH:mm' : 'America/Lima' }}</td>
              <td>
                {{ event.actorName }}<small>{{ event.actorRole }}</small>
              </td>
              <td>
                <code>{{ event.method }}</code> <code>{{ event.path }}</code>
              </td>
              <td>
                <span [class.fail]="event.status >= 400" class="status">{{ event.status }}</span>
              </td>
            </tr>
          } @empty {
            @if (!loading()) {
              <tr>
                <td colspan="4" class="empty">No hay eventos en este rango.</td>
              </tr>
            }
          }
        </tbody>
      </table>
    </section>
    <p class="note">
      Se guardan método, ruta, resultado y actor. No se registran cuerpos de solicitudes ni
      credenciales. Esta bitácora empieza desde que se instala la migración; no contiene actividad
      histórica.
    </p>
  `,
  styles: [
    `
      :host {
        display: block;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        max-width: 1450px;
        margin: auto;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: end;
        margin-bottom: 18px;
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
      .note {
        color: var(--color-ink-500, #64748b);
      }
      button {
        padding: 10px 14px;
        border: 0;
        border-radius: 5px;
        background: #27802d;
        color: white;
        font-weight: 700;
        cursor: pointer;
      }
      .filters {
        display: flex;
        align-items: end;
        gap: 10px;
        margin-bottom: 14px;
        padding: 14px;
        background: var(--color-surface, #fff);
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 7px;
      }
      .filters label {
        display: grid;
        gap: 5px;
        font-size: 11px;
        color: var(--color-ink-500, #64748b);
      }
      .filters input {
        padding: 9px;
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 5px;
        background: var(--color-surface, #fff);
        color: inherit;
      }
      .filters .search {
        flex: 1;
      }
      .table-wrap {
        max-width: 100%;
        min-width: 0;
        overflow: auto;
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 7px;
        background: var(--color-surface, #fff);
      }
      table {
        width: 100%;
        min-width: 640px;
        border-collapse: collapse;
        text-align: left;
        font-size: 13px;
      }
      th,
      td {
        padding: 12px;
        border-bottom: 1px solid var(--color-border, #e2e8f0);
        vertical-align: top;
      }
      th {
        font-size: 11px;
        color: var(--color-ink-500, #64748b);
      }
      td small {
        display: block;
        margin-top: 4px;
        color: var(--color-ink-500, #64748b);
      }
      code {
        overflow-wrap: anywhere;
      }
      .status {
        color: #15803d;
        font-weight: 800;
      }
      .status.fail {
        color: #b91c1c;
      }
      .empty {
        text-align: center;
        padding: 30px;
        color: var(--color-ink-500, #64748b);
      }
      .note {
        font-size: 12px;
        line-height: 1.5;
      }
      .error {
        color: #b91c1c;
      }
      @media (max-width: 700px) {
        header {
          align-items: flex-start;
          flex-direction: column;
          gap: 10px;
        }
        .filters {
          flex-wrap: wrap;
        }
        .filters label {
          flex: 1 1 130px;
        }
        .filters .search {
          flex-basis: 100%;
        }
      }
    `,
  ],
})
export class PlatformAudit {
  private readonly service = inject(PlatformAdminService);
  protected readonly events = signal<PlatformAuditEvent[]>([]);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected from = this.dateOffset(-29);
  protected to = this.dateOffset(0);
  protected query = '';
  constructor() {
    this.load();
  }
  protected load(): void {
    this.loading.set(true);
    this.error.set('');
    this.service.audit(this.from, this.to, this.query).subscribe({
      next: (events) => {
        this.events.set(events);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(this.service.describeError(err, 'audit'));
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
