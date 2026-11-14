import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DatabaseService } from '@core/supabase/database.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">CONTROL GLOBAL</p>
        <h1>Dashboard de plataforma</h1>
        <p>Vista general de la operación de Canchero.</p>
      </div>
      <span class="scope">Todas las sedes</span>
    </header>
    @if (db.catalogError()) {
      <div class="notice" role="status">
        No se pudieron cargar todos los datos del catálogo. Las cifras pueden estar incompletas.
      </div>
    }
    <section class="metrics" aria-label="Indicadores de plataforma">
      <article>
        <span>Sedes registradas</span><strong>{{ venues().length }}</strong>
      </article>
      <article>
        <span>Canchas registradas</span><strong>{{ courts().length }}</strong>
      </article>
      <article>
        <span>Reservas de hoy</span><strong>{{ bookingsToday() }}</strong
        ><small>Según reservas cargadas</small>
      </article>
      <article>
        <span>Reservas pendientes</span><strong>{{ pendingBookings() }}</strong
        ><small>No representa pagos pendientes</small>
      </article>
    </section>
    <section class="panel">
      <div class="panel-head">
        <div>
          <h2>Canchas con más reservas</h2>
          <p>Conteo de reservas registradas; no equivale a rentabilidad ni ocupación.</p>
        </div>
      </div>
      @for (court of topCourts(); track court.id) {
        <div class="rank">
          <span class="rank-name"
            >{{ court.nombre || 'Cancha' }}<small>{{ court.sedeNombre || 'Sede' }}</small></span
          ><strong>{{ court.count }} reservas</strong>
        </div>
      } @empty {
        <p class="empty">Aún no hay datos de reservas suficientes para mostrar un ranking.</p>
      }
    </section>
    <p class="data-note">
      Las métricas usan los datos disponibles en la sesión. Los ingresos propios de Canchero,
      ocupación por horas y auditoría requieren fuentes globales específicas; no se estiman con las
      ventas de los dueños.
    </p>
  `,
  styles: [
    `
      :host {
        display: block;
        max-width: 1440px;
        margin: auto;
      }
      .page-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }
      .eyebrow {
        margin: 0 0 5px;
        color: #27802d;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
      }
      .page-head h1 {
        margin: 0;
        font-size: clamp(24px, 3vw, 32px);
      }
      .page-head p:not(.eyebrow) {
        margin: 7px 0 0;
        color: var(--color-ink-500, #64748b);
      }
      .scope {
        padding: 8px 12px;
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 6px;
        background: var(--color-surface, #fff);
        font-size: 12px;
        font-weight: 700;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }
      .metrics article,
      .panel {
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 8px;
        background: var(--color-surface, #fff);
      }
      .metrics article {
        display: grid;
        gap: 10px;
        padding: 18px;
      }
      .metrics article span,
      .metrics small {
        color: var(--color-ink-500, #64748b);
        font-size: 13px;
      }
      .metrics strong {
        font-size: 29px;
      }
      .metrics small {
        font-size: 11px;
      }
      .panel {
        margin-top: 20px;
        padding: 20px;
      }
      .panel h2 {
        margin: 0;
        font-size: 18px;
      }
      .panel-head p,
      .data-note {
        color: var(--color-ink-500, #64748b);
        font-size: 13px;
        line-height: 1.55;
      }
      .rank {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 13px 0;
        border-top: 1px solid var(--color-border, #e2e8f0);
      }
      .rank-name {
        font-weight: 700;
      }
      .rank-name small {
        display: block;
        margin-top: 4px;
        color: var(--color-ink-500, #64748b);
        font-size: 12px;
        font-weight: 400;
      }
      .rank strong {
        font-size: 13px;
      }
      .empty,
      .notice {
        padding: 14px;
        color: var(--color-ink-500, #64748b);
      }
      .notice {
        margin-bottom: 16px;
        border: 1px solid #f5c66c;
        border-radius: 6px;
        background: #fff8e8;
      }
      .data-note {
        margin-top: 18px;
      }
      @media (max-width: 900px) {
        .metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
      }
      @media (max-width: 520px) {
        .page-head {
          align-items: flex-start;
          gap: 12px;
        }
        .scope {
          white-space: nowrap;
        }
        .metrics {
          gap: 8px;
        }
        .metrics article {
          padding: 13px;
        }
        .metrics strong {
          font-size: 24px;
        }
      }
    `,
  ],
})
export class SuperadminDashboard {
  protected readonly db = inject(DatabaseService);
  protected readonly venues = computed(() => this.db.sedes());
  protected readonly courts = computed(() => this.db.canchas());
  protected readonly bookingsToday = computed(
    () =>
      this.db
        .reservas()
        .filter((booking: any) => this.dateKey(booking.fecha_reserva) === this.dateKey(new Date()))
        .length,
  );
  protected readonly pendingBookings = computed(
    () =>
      this.db
        .reservas()
        .filter((booking: any) => String(booking.estado || '').toLowerCase() === 'pendiente')
        .length,
  );
  protected readonly topCourts = computed(() => {
    const counts = new Map<
      string,
      { id: string; nombre: string; sedeNombre: string; count: number }
    >();
    const courtById = new Map(
      this.courts().map((court: any) => [String(court.id_cancha ?? court.id), court]),
    );
    for (const booking of this.db.reservas() as any[]) {
      const id = String(booking.cancha_id ?? booking.id_cancha ?? '');
      if (!id) continue;
      const court: any = courtById.get(id);
      const entry = counts.get(id) ?? {
        id,
        nombre: court?.nombre ?? 'Cancha',
        sedeNombre: court?.sede_nombre ?? '',
        count: 0,
      };
      entry.count++;
      counts.set(id, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 5);
  });
  private dateKey(value: unknown): string {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    const date = value instanceof Date ? value : new Date(String(value ?? ''));
    return Number.isNaN(date.getTime())
      ? ''
      : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
