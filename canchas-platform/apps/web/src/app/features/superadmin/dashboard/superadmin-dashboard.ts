import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  PlatformAdminService,
  type PlatformDashboardOverview,
  type PlatformRevenueSummary,
} from '@core/services/platform-admin.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  template: `
    <header class="page-head">
      <div>
        <p class="eyebrow">INTELIGENCIA DE PLATAFORMA</p>
        <h1>Dashboard de Canchero</h1>
        <p>Actividad, rendimiento y alertas de todas las sedes en un solo lugar.</p>
      </div>
      <div class="toolbar">
        <div class="ranges" aria-label="Periodo del dashboard">
          @for (option of rangeOptions; track option.days) {
            <button
              type="button"
              [class.selected]="rangeDays() === option.days"
              (click)="setRange(option.days)"
            >
              {{ option.label }}
            </button>
          }
        </div>
        <button
          class="refresh"
          type="button"
          (click)="load()"
          [disabled]="loading()"
          aria-label="Actualizar dashboard"
        >
          <span [class.spinning]="loading()">↻</span> Actualizar
        </button>
      </div>
    </header>

    @if (error()) {
      <div class="notice error" role="alert">{{ error() }}</div>
    }
    @if (revenueError()) {
      <div class="notice" role="status">
        {{ revenueError() }} Los datos operativos siguen disponibles.
      </div>
    }

    @if (loading() && !overview()) {
      <div class="loading-grid" aria-label="Cargando indicadores">
        @for (i of [1, 2, 3, 4]; track i) {
          <div class="skeleton"></div>
        }
      </div>
    } @else if (overview(); as data) {
      <div class="period-caption">
        {{ formatDate(data.from) }} — {{ formatDate(data.to) }}
        <span>· {{ rangeDays() }} días</span>
      </div>

      <section class="metrics" aria-label="Indicadores principales">
        <article class="metric green" style="--delay: 0ms">
          <span class="metric-icon">⌂</span><span class="metric-label">Sedes activas</span>
          <strong>{{ data.activeVenues | number }}</strong
          ><small>{{ data.venues.length }} registradas en la plataforma</small>
        </article>
        <article class="metric blue" style="--delay: 70ms">
          <span class="metric-icon">⚽</span><span class="metric-label">Canchas activas</span>
          <strong>{{ data.activeCourts | number }}</strong
          ><small>En todas las sedes registradas</small>
        </article>
        <article class="metric orange" style="--delay: 140ms">
          <span class="metric-icon">▤</span><span class="metric-label">Reservas del periodo</span>
          <strong>{{ data.bookings | number }}</strong
          ><small>{{ data.bookingsToday | number }} reservas para hoy</small>
        </article>
        <article class="metric violet" style="--delay: 210ms">
          <span class="metric-icon">$</span><span class="metric-label">Comisión neta estimada</span>
          @if (revenue()) {
            <strong>{{
              revenue()!.estimatedNetCommission | currency: 'PEN' : 'symbol-narrow' : '1.0-0'
            }}</strong>
            <small>Descontando devoluciones registradas</small>
          } @else {
            <strong class="muted-value">—</strong><small>Sin resumen financiero disponible</small>
          }
        </article>
      </section>

      <section class="secondary-metrics" aria-label="Indicadores de operación">
        <article>
          <span class="dot green-dot"></span>
          <div>
            <strong>{{ data.paidGross | currency: 'PEN' : 'symbol-narrow' : '1.0-0' }}</strong
            ><small>Cobros aprobados a los dueños</small>
          </div>
        </article>
        <article>
          <span class="dot violet-dot"></span>
          <div>
            <strong>{{
              todayRevenue()
                ? (todayRevenue()!.estimatedNetCommission
                  | currency: 'PEN' : 'symbol-narrow' : '1.0-0')
                : '—'
            }}</strong
            ><small>Comisión neta estimada de hoy</small>
          </div>
        </article>
        <article>
          <span class="dot orange-dot"></span>
          <div>
            <strong>{{ data.reservedGross | currency: 'PEN' : 'symbol-narrow' : '1.0-0' }}</strong
            ><small>Valor de reservas creadas</small>
          </div>
        </article>
        <article>
          <span class="dot red-dot"></span>
          <div>
            <strong>{{ data.pendingReports | number }}</strong
            ><small>Reportes abiertos · toda la plataforma</small>
          </div>
        </article>
      </section>

      <section class="charts" aria-label="Tendencias estadísticas">
        <article class="panel chart-panel">
          <div class="panel-heading">
            <div>
              <span class="panel-kicker">DEMANDA</span>
              <h2>Reservas por día</h2>
              <p>Reservas no canceladas, por fecha de juego.</p>
            </div>
            <div class="chart-total">
              <strong>{{ data.bookings | number }}</strong
              ><small>en el periodo</small>
            </div>
          </div>
          @if (data.daily.length) {
            <div class="bar-chart" role="img" aria-label="Gráfico de reservas diarias">
              @for (day of data.daily; track day.date; let i = $index) {
                <div
                  class="bar-column"
                  [title]="formatDate(day.date) + ': ' + day.bookings + ' reservas'"
                >
                  <span class="bar-value">{{ day.bookings || '' }}</span>
                  <div class="bar-track">
                    <span
                      class="bar bookings-bar"
                      [style.height.%]="barHeight(day.bookings, maxBookings())"
                      [style.animation-delay.ms]="i * 16"
                    ></span>
                  </div>
                  @if (showDateLabel(i, data.daily.length)) {
                    <small>{{ day.date.slice(8, 10) }}</small>
                  }
                </div>
              }
            </div>
            <div class="chart-axis">
              <span>{{ formatDate(data.daily[0].date) }}</span
              ><span>Reservas · escala diaria</span
              ><span>{{ formatDate(data.daily[data.daily.length - 1].date) }}</span>
            </div>
          } @else {
            <p class="empty">No hay reservas para graficar en este periodo.</p>
          }
        </article>

        <article class="panel chart-panel">
          <div class="panel-heading">
            <div>
              <span class="panel-kicker">COBROS</span>
              <h2>Pagos aprobados</h2>
              <p>Importes registrados y aprobados por día.</p>
            </div>
            <div class="chart-total">
              <strong>{{ data.paidGross | currency: 'PEN' : 'symbol-narrow' : '1.0-0' }}</strong
              ><small>en el periodo</small>
            </div>
          </div>
          @if (data.daily.length) {
            <div class="bar-chart" role="img" aria-label="Gráfico de pagos aprobados por día">
              @for (day of data.daily; track day.date; let i = $index) {
                <div
                  class="bar-column"
                  [title]="formatDate(day.date) + ': ' + (day.paidGross | currency: 'PEN')"
                >
                  <span class="bar-value">{{
                    day.paidGross >= 1000 ? (day.paidGross / 1000 | number: '1.0-0') + 'k' : ''
                  }}</span>
                  <div class="bar-track">
                    <span
                      class="bar payments-bar"
                      [style.height.%]="barHeight(day.paidGross, maxPayments())"
                      [style.animation-delay.ms]="i * 16"
                    ></span>
                  </div>
                  @if (showDateLabel(i, data.daily.length)) {
                    <small>{{ day.date.slice(8, 10) }}</small>
                  }
                </div>
              }
            </div>
            <div class="chart-axis">
              <span>{{ formatDate(data.daily[0].date) }}</span
              ><span>Montos en PEN</span
              ><span>{{ formatDate(data.daily[data.daily.length - 1].date) }}</span>
            </div>
          } @else {
            <p class="empty">No hay pagos para graficar en este periodo.</p>
          }
        </article>
      </section>

      <section class="rankings">
        <article class="panel ranking-panel">
          <div class="panel-heading">
            <div>
              <span class="panel-kicker">RENDIMIENTO</span>
              <h2>Sedes con más actividad</h2>
              <p>Comparativo por reservas registradas en el periodo.</p>
            </div>
            <span class="scope-chip">{{ data.venues.length }} sedes</span>
          </div>
          @for (venue of topVenues(); track venue.id; let i = $index) {
            <div class="rank-row">
              <span class="rank-number">{{ i + 1 }}</span>
              <div class="rank-info">
                <strong>{{ venue.name }}</strong
                ><small>Dueño: {{ venue.ownerName }}</small>
              </div>
              <div class="rank-track">
                <span
                  [style.width.%]="barHeight(venue.bookings, maxVenueBookings())"
                  [style.animation-delay.ms]="i * 90"
                ></span>
              </div>
              <strong class="rank-count">{{ venue.bookings }} <small>reservas</small></strong>
            </div>
          } @empty {
            <p class="empty">Aún no hay actividad para comparar.</p>
          }
        </article>

        <article class="panel ranking-panel">
          <div class="panel-heading">
            <div>
              <span class="panel-kicker">PRODUCCIÓN</span>
              <h2>Canchas con más cobros</h2>
              <p>Pagos aprobados y su ubicación en la plataforma.</p>
            </div>
          </div>
          @for (court of topCourts(); track court.id; let i = $index) {
            <div class="rank-row court-rank">
              <span class="rank-number">{{ i + 1 }}</span>
              <div class="rank-info">
                <strong>{{ court.name }}</strong
                ><small>{{ court.venueName }} · Dueño: {{ court.ownerName }}</small>
              </div>
              <div class="rank-track">
                <span
                  [style.width.%]="barHeight(court.paidGross, maxCourtPaid())"
                  [style.animation-delay.ms]="i * 90"
                ></span>
              </div>
              <strong class="rank-count"
                >{{ court.paidGross | currency: 'PEN' : 'symbol-narrow' : '1.0-0' }}
                <small>{{ court.bookings }} reservas</small></strong
              >
            </div>
          } @empty {
            <p class="empty">Aún no hay cobros aprobados por cancha.</p>
          }
        </article>
      </section>

      <section class="panel detail-panel">
        <div class="panel-heading detail-heading">
          <div>
            <span class="panel-kicker">OPERACIÓN POR TENANT</span>
            <h2>Detalle por sede, dueño y cancha</h2>
            <p>Reservas, montos cobrados y reportes asociados a cada cancha.</p>
          </div>
          <label class="search"
            ><span>⌕</span
            ><input
              type="search"
              placeholder="Buscar sede o dueño"
              [value]="venueQuery()"
              (input)="venueQuery.set($any($event.target).value)"
          /></label>
        </div>
        @for (venue of filteredVenues(); track venue.id; let i = $index) {
          <details class="venue-detail" [open]="i === 0">
            <summary>
              <span class="summary-chevron">⌄</span>
              <span class="venue-title"
                ><strong>{{ venue.name }}</strong
                ><small>Dueño: {{ venue.ownerName }} · #{{ venue.id }}</small></span
              >
              <span class="status" [class.inactive]="!venue.active">{{
                venue.active ? 'Activa' : 'Inactiva'
              }}</span>
              <span class="summary-stat"
                ><strong>{{ venue.bookings }}</strong
                ><small>reservas</small></span
              >
              <span class="summary-stat money"
                ><strong>{{ venue.paidGross | currency: 'PEN' : 'symbol-narrow' : '1.0-0' }}</strong
                ><small>cobrado</small></span
              >
              <span class="summary-stat reports" [class.has-reports]="venue.openReports > 0"
                ><strong>{{ venue.openReports }}</strong
                ><small>reportes abiertos</small></span
              >
            </summary>
            <div class="venue-meta">
              <span
                >Valor reservado
                <strong>{{
                  venue.reservedGross | currency: 'PEN' : 'symbol-narrow' : '1.0-0'
                }}</strong></span
              >
              <span
                >Comisión bruta
                <strong>{{
                  venue.platformCommission | currency: 'PEN' : 'symbol-narrow' : '1.0-0'
                }}</strong></span
              >
              <span
                >Canchas <strong>{{ venue.courts.length }}</strong></span
              >
              <span
                >Reportes del periodo <strong>{{ venue.reports }}</strong></span
              >
            </div>
            @if (venue.courts.length) {
              <div class="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Cancha</th>
                      <th>Estado</th>
                      <th>Reservas</th>
                      <th>Valor reservado</th>
                      <th>Cobrado</th>
                      <th>Comisión plataforma</th>
                      <th>Reportes</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (court of venue.courts; track court.id) {
                      <tr>
                        <td>
                          <strong>{{ court.name }}</strong
                          ><small>ID {{ court.id }}</small>
                        </td>
                        <td>
                          <span class="status" [class.inactive]="!court.active">{{
                            court.active ? 'Activa' : 'Inactiva'
                          }}</span>
                        </td>
                        <td>{{ court.bookings }}</td>
                        <td>
                          {{ court.reservedGross | currency: 'PEN' : 'symbol-narrow' : '1.0-0' }}
                        </td>
                        <td>{{ court.paidGross | currency: 'PEN' : 'symbol-narrow' : '1.0-0' }}</td>
                        <td>
                          {{
                            court.platformCommission | currency: 'PEN' : 'symbol-narrow' : '1.0-0'
                          }}
                        </td>
                        <td>
                          <span [class.report-warning]="court.openReports > 0"
                            >{{ court.reports }} total · {{ court.openReports }} abiertos</span
                          >
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="empty court-empty">Esta sede aún no tiene canchas registradas.</p>
            }
          </details>
        } @empty {
          <p class="empty">No hay sedes que coincidan con la búsqueda.</p>
        }
      </section>

      <p class="data-note">
        Los cobros corresponden a pagos aprobados registrados en la plataforma. La comisión neta se
        muestra por separado y descuenta devoluciones registradas; estos datos no representan la
        caja presencial de los dueños.
      </p>
    }
  `,
  styles: [
    `
      :host {
        display: block;
        box-sizing: border-box;
        width: 100%;
        min-width: 0;
        max-width: 1600px;
        margin: auto;
        color: var(--color-ink-900, #172033);
      }
      .page-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        gap: 20px;
        margin-bottom: 16px;
      }
      .eyebrow,
      .panel-kicker {
        margin: 0 0 6px;
        color: #27802d;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.12em;
      }
      .page-head h1 {
        margin: 0;
        font-size: clamp(25px, 3vw, 34px);
        letter-spacing: -0.035em;
      }
      .page-head p:not(.eyebrow) {
        margin: 7px 0 0;
        color: var(--color-ink-500, #64748b);
      }
      .toolbar {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .ranges {
        display: flex;
        padding: 4px;
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 9px;
        background: var(--color-surface, #fff);
      }
      button {
        cursor: pointer;
        font: inherit;
      }
      .ranges button,
      .refresh {
        border: 0;
        border-radius: 6px;
        padding: 8px 12px;
        color: var(--color-ink-500, #64748b);
        background: transparent;
        font-size: 12px;
        font-weight: 700;
      }
      .ranges button.selected {
        color: #fff;
        background: #27802d;
        box-shadow: 0 3px 9px #27802d30;
      }
      .refresh {
        border: 1px solid var(--color-border, #dbe1e8);
        color: var(--color-ink-900, #172033);
        background: var(--color-surface, #fff);
      }
      .refresh:disabled {
        opacity: 0.65;
        cursor: wait;
      }
      .refresh span {
        display: inline-block;
        margin-right: 4px;
        font-size: 16px;
      }
      .spinning {
        animation: spin 0.8s linear infinite;
      }
      .period-caption {
        margin-bottom: 11px;
        color: var(--color-ink-500, #64748b);
        font-size: 12px;
      }
      .period-caption span {
        color: #27802d;
        font-weight: 700;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
      }
      .metric,
      .panel,
      .secondary-metrics article {
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 11px;
        background: var(--color-surface, #fff);
        box-shadow: 0 5px 18px #0f172a08;
      }
      .metric {
        position: relative;
        display: grid;
        gap: 7px;
        min-height: 140px;
        padding: 17px 18px;
        overflow: hidden;
        animation: rise 0.48s both;
        animation-delay: var(--delay, 0ms);
      }
      .metric::after {
        position: absolute;
        right: -27px;
        bottom: -39px;
        width: 105px;
        height: 105px;
        border-radius: 50%;
        background: var(--tint);
        content: '';
      }
      .metric.green {
        --tint: #27802d14;
        --accent: #27802d;
      }
      .metric.blue {
        --tint: #3b82f614;
        --accent: #3b82f6;
      }
      .metric.orange {
        --tint: #f9731614;
        --accent: #f97316;
      }
      .metric.violet {
        --tint: #8b5cf614;
        --accent: #8b5cf6;
      }
      .metric-icon {
        position: absolute;
        right: 17px;
        top: 16px;
        display: grid;
        place-items: center;
        width: 36px;
        height: 36px;
        border-radius: 10px;
        color: var(--accent);
        background: var(--tint);
        font-size: 19px;
        font-weight: 800;
      }
      .metric-label {
        color: var(--color-ink-500, #64748b);
        font-size: 13px;
        font-weight: 650;
      }
      .metric strong {
        position: relative;
        z-index: 1;
        font-size: clamp(24px, 2.5vw, 32px);
        letter-spacing: -0.04em;
        animation: number-in 0.55s both;
        animation-delay: var(--delay, 0ms);
      }
      .metric small {
        color: var(--color-ink-500, #64748b);
        font-size: 11px;
      }
      .muted-value {
        color: #94a3b8;
      }
      .secondary-metrics {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
        margin-top: 12px;
      }
      .secondary-metrics article {
        display: flex;
        align-items: center;
        gap: 11px;
        padding: 13px 16px;
      }
      .secondary-metrics article div {
        display: grid;
        gap: 3px;
      }
      .secondary-metrics strong {
        font-size: 16px;
      }
      .secondary-metrics small {
        color: var(--color-ink-500, #64748b);
        font-size: 11px;
      }
      .dot {
        width: 9px;
        height: 9px;
        flex: none;
        border-radius: 50%;
        box-shadow: 0 0 0 5px color-mix(in srgb, currentColor 13%, transparent);
      }
      .green-dot {
        color: #27802d;
        background: #27802d;
      }
      .orange-dot {
        color: #f97316;
        background: #f97316;
      }
      .red-dot {
        color: #ef4444;
        background: #ef4444;
      }
      .violet-dot {
        color: #8b5cf6;
        background: #8b5cf6;
      }
      .charts {
        display: grid;
        min-width: 0;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        margin-top: 14px;
      }
      .charts > *,
      .rankings > *,
      .detail-panel {
        min-width: 0;
      }
      .panel {
        padding: 18px;
      }
      .panel-heading {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
      }
      .panel-heading h2 {
        margin: 0;
        font-size: 18px;
        letter-spacing: -0.02em;
      }
      .panel-heading p {
        margin: 5px 0 0;
        color: var(--color-ink-500, #64748b);
        font-size: 12px;
      }
      .panel-kicker {
        display: block;
        margin-bottom: 5px;
        font-size: 9px;
      }
      .chart-total {
        display: grid;
        justify-items: end;
        gap: 3px;
        text-align: right;
      }
      .chart-total strong {
        font-size: 19px;
      }
      .chart-total small {
        color: var(--color-ink-500, #64748b);
        font-size: 10px;
      }
      .bar-chart {
        display: flex;
        align-items: stretch;
        gap: 3px;
        height: 178px;
        margin-top: 16px;
        padding: 0 2px;
        border-bottom: 1px solid var(--color-border, #dbe1e8);
      }
      .bar-column {
        display: flex;
        flex: 1 1 0;
        min-width: 0;
        flex-direction: column;
        align-items: center;
        justify-content: flex-end;
        gap: 5px;
      }
      .bar-value {
        min-height: 12px;
        color: var(--color-ink-500, #64748b);
        font-size: 8px;
        white-space: nowrap;
      }
      .bar-track {
        display: flex;
        align-items: flex-end;
        justify-content: center;
        width: 100%;
        height: 140px;
      }
      .bar {
        display: block;
        width: min(70%, 22px);
        min-height: 2px;
        border-radius: 4px 4px 1px 1px;
        transform-origin: bottom;
        animation: grow-bar 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both;
        animation-delay: var(--delay, 0ms);
        transition: height 0.3s ease;
      }
      .bookings-bar {
        background: linear-gradient(0deg, #27802d, #46bb51);
      }
      .payments-bar {
        background: linear-gradient(0deg, #f97316, #fbbf24);
      }
      .bar-column small {
        height: 12px;
        color: var(--color-ink-500, #64748b);
        font-size: 9px;
      }
      .chart-axis {
        display: flex;
        justify-content: space-between;
        margin-top: 7px;
        color: var(--color-ink-500, #64748b);
        font-size: 9px;
      }
      .scope-chip,
      .status {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #27802d30;
        border-radius: 999px;
        padding: 5px 9px;
        color: #23772a;
        background: #27802d0c;
        font-size: 10px;
        font-weight: 750;
        white-space: nowrap;
      }
      .status.inactive {
        border-color: #94a3b83b;
        color: #64748b;
        background: #94a3b814;
      }
      .rankings {
        display: grid;
        min-width: 0;
        grid-template-columns: 1fr 1fr;
        gap: 14px;
        margin-top: 14px;
      }
      .detail-panel {
        margin-top: 14px;
      }
      .rank-row {
        display: grid;
        grid-template-columns: 26px minmax(150px, 1fr) minmax(90px, 1.3fr) auto;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
        border-top: 1px solid var(--color-border, #e2e8f0);
      }
      .rank-row:first-of-type {
        margin-top: 13px;
      }
      .rank-number {
        display: grid;
        place-items: center;
        width: 24px;
        height: 24px;
        border-radius: 7px;
        color: #27802d;
        background: #27802d12;
        font-size: 11px;
        font-weight: 800;
      }
      .rank-info {
        display: grid;
        gap: 3px;
        min-width: 0;
      }
      .rank-info strong {
        overflow: hidden;
        font-size: 13px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .rank-info small,
      .rank-count small {
        color: var(--color-ink-500, #64748b);
        font-size: 10px;
        font-weight: 500;
      }
      .rank-track {
        height: 7px;
        overflow: hidden;
        border-radius: 99px;
        background: var(--color-border, #e2e8f0);
      }
      .rank-track span {
        display: block;
        height: 100%;
        border-radius: inherit;
        background: linear-gradient(90deg, #27802d, #59c764);
        animation: grow-width 0.7s both;
        transform-origin: left;
      }
      .rank-count {
        min-width: 88px;
        text-align: right;
        font-size: 13px;
      }
      .detail-heading {
        margin-bottom: 14px;
      }
      .search {
        display: flex;
        align-items: center;
        gap: 7px;
        width: min(280px, 42%);
        border: 1px solid var(--color-border, #dbe1e8);
        border-radius: 7px;
        padding: 0 10px;
        background: var(--color-surface, #fff);
      }
      .search span {
        color: var(--color-ink-500, #64748b);
        font-size: 21px;
      }
      .search input {
        width: 100%;
        border: 0;
        outline: 0;
        padding: 9px 0;
        color: inherit;
        background: transparent;
        font: inherit;
        font-size: 12px;
      }
      .venue-detail {
        min-width: 0;
        border-top: 1px solid var(--color-border, #e2e8f0);
      }
      .venue-detail summary {
        display: grid;
        min-width: 0;
        grid-template-columns: 20px minmax(0, 1fr) auto repeat(3, minmax(85px, auto));
        align-items: center;
        gap: 12px;
        min-height: 64px;
        cursor: pointer;
        list-style: none;
      }
      .venue-detail summary::-webkit-details-marker {
        display: none;
      }
      .summary-chevron {
        color: #27802d;
        font-size: 17px;
        transition: transform 0.2s;
      }
      .venue-detail[open] .summary-chevron {
        transform: rotate(180deg);
      }
      .venue-title {
        display: grid;
        gap: 4px;
        min-width: 0;
      }
      .venue-title strong {
        overflow: hidden;
        font-size: 13px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .venue-title small,
      .summary-stat small {
        color: var(--color-ink-500, #64748b);
        font-size: 10px;
      }
      .summary-stat {
        display: grid;
        justify-items: end;
        gap: 3px;
      }
      .summary-stat strong {
        font-size: 12px;
      }
      .summary-stat.has-reports strong,
      .report-warning {
        color: #dc2626;
      }
      .venue-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 10px 24px;
        padding: 10px 12px;
        border-radius: 7px;
        background: var(--color-slate-50, #f5f7fa);
      }
      .venue-meta span {
        color: var(--color-ink-500, #64748b);
        font-size: 10px;
      }
      .venue-meta strong {
        display: block;
        margin-top: 3px;
        color: var(--color-ink-900, #172033);
        font-size: 11px;
      }
      .table-scroll {
        width: 100%;
        max-width: 100%;
        min-width: 0;
        overflow-x: auto;
        overscroll-behavior-x: contain;
        margin-top: 9px;
      }
      table {
        width: 100%;
        min-width: 760px;
        border-collapse: collapse;
        font-size: 11px;
        text-align: left;
        white-space: nowrap;
      }
      th {
        padding: 10px 9px;
        color: var(--color-ink-500, #64748b);
        background: var(--color-slate-50, #f5f7fa);
        font-size: 9px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }
      td {
        padding: 10px 9px;
        border-bottom: 1px solid var(--color-border, #e2e8f0);
      }
      td:first-child strong,
      td:first-child small {
        display: block;
      }
      td:first-child small {
        margin-top: 3px;
        color: var(--color-ink-500, #64748b);
        font-size: 9px;
      }
      .empty {
        padding: 18px 0;
        color: var(--color-ink-500, #64748b);
        font-size: 12px;
      }
      .court-empty {
        padding: 12px;
      }
      .data-note {
        margin: 12px 0 0;
        color: var(--color-ink-500, #64748b);
        font-size: 10px;
        line-height: 1.55;
      }
      .notice {
        margin: 0 0 12px;
        padding: 11px 13px;
        border: 1px solid #f5c66c;
        border-radius: 8px;
        color: #854d0e;
        background: #fff8e8;
        font-size: 12px;
      }
      .notice.error {
        border-color: #fca5a5;
        color: #b91c1c;
        background: #fef2f2;
      }
      .loading-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px;
      }
      .skeleton {
        height: 140px;
        border-radius: 11px;
        background: linear-gradient(
          100deg,
          var(--color-border, #e2e8f0) 20%,
          var(--color-surface, #fff) 42%,
          var(--color-border, #e2e8f0) 64%
        );
        background-size: 200% 100%;
        animation: shimmer 1.25s linear infinite;
      }
      @keyframes rise {
        from {
          opacity: 0;
          transform: translateY(12px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      @keyframes number-in {
        from {
          opacity: 0.2;
          transform: translateY(6px) scale(0.97);
        }
        to {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
      }
      @keyframes grow-bar {
        from {
          transform: scaleY(0.02);
          opacity: 0.3;
        }
        to {
          transform: scaleY(1);
          opacity: 1;
        }
      }
      @keyframes grow-width {
        from {
          transform: scaleX(0);
        }
        to {
          transform: scaleX(1);
        }
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
      @keyframes shimmer {
        to {
          background-position-x: -200%;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        *,
        *::before,
        *::after {
          animation-duration: 0.01ms !important;
          animation-iteration-count: 1 !important;
          scroll-behavior: auto !important;
          transition-duration: 0.01ms !important;
        }
      }
      @media (max-width: 1050px) {
        .metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .charts,
        .rankings {
          grid-template-columns: 1fr;
        }
        .venue-detail summary {
          grid-template-columns: 18px minmax(0, 1fr) auto repeat(2, minmax(64px, auto));
          gap: 8px;
        }
        .summary-stat.money {
          display: none;
        }
      }
      @media (max-width: 760px) {
        .page-head {
          align-items: flex-start;
          flex-direction: column;
        }
        .toolbar {
          width: 100%;
          justify-content: space-between;
        }
        .secondary-metrics {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .venue-detail summary {
          grid-template-columns: 18px minmax(0, 1fr) auto auto;
          gap: 8px;
          padding: 9px 0;
        }
        .summary-stat.money,
        .summary-stat.reports {
          display: none;
        }
      }
      @media (max-width: 480px) {
        .metrics {
          gap: 8px;
        }
        .metric {
          min-height: 127px;
          padding: 13px;
        }
        .metric strong {
          font-size: 23px;
        }
        .metric-icon {
          top: 12px;
          right: 12px;
          width: 29px;
          height: 29px;
          font-size: 15px;
        }
        .ranges button {
          padding: 7px 8px;
        }
        .refresh {
          padding: 7px;
        }
        .panel {
          padding: 14px;
        }
        .bar-chart {
          gap: 1px;
          height: 150px;
        }
        .bar-track {
          height: 115px;
        }
        .bar-value {
          font-size: 7px;
        }
        .rank-row {
          grid-template-columns: 24px minmax(100px, 1fr) auto;
          gap: 8px;
        }
        .rank-track {
          display: none;
        }
        .rank-count {
          min-width: 72px;
        }
        .search {
          width: 100%;
        }
        .detail-heading {
          align-items: flex-start;
          flex-direction: column;
        }
      }
    `,
  ],
})
export class SuperadminDashboard {
  private readonly platform = inject(PlatformAdminService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly overview = signal<PlatformDashboardOverview | null>(null);
  protected readonly revenue = signal<PlatformRevenueSummary | null>(null);
  protected readonly todayRevenue = signal<PlatformRevenueSummary | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly revenueError = signal('');
  protected readonly rangeDays = signal(30);
  protected readonly venueQuery = signal('');
  protected readonly rangeOptions = [
    { days: 7, label: '7 días' },
    { days: 30, label: '30 días' },
    { days: 90, label: '90 días' },
  ];
  protected readonly filteredVenues = computed(() => {
    const query = this.venueQuery().trim().toLocaleLowerCase();
    const venues = this.overview()?.venues ?? [];
    return query
      ? venues.filter((v) => `${v.name} ${v.ownerName}`.toLocaleLowerCase().includes(query))
      : venues;
  });
  protected readonly topVenues = computed(() => (this.overview()?.venues ?? []).slice(0, 5));
  protected readonly topCourts = computed(() =>
    (this.overview()?.venues ?? [])
      .flatMap((venue) =>
        venue.courts.map((court) => ({
          ...court,
          venueName: venue.name,
          ownerName: venue.ownerName,
        })),
      )
      .sort((a, b) => b.paidGross - a.paidGross || b.bookings - a.bookings)
      .slice(0, 5),
  );
  protected readonly maxBookings = computed(() =>
    Math.max(1, ...(this.overview()?.daily ?? []).map((d) => d.bookings)),
  );
  protected readonly maxPayments = computed(() =>
    Math.max(1, ...(this.overview()?.daily ?? []).map((d) => d.paidGross)),
  );
  protected readonly maxVenueBookings = computed(() =>
    Math.max(1, ...this.topVenues().map((v) => v.bookings)),
  );
  protected readonly maxCourtPaid = computed(() =>
    Math.max(1, ...this.topCourts().map((c) => c.paidGross)),
  );

  constructor() {
    this.load();
  }

  protected setRange(days: number): void {
    this.rangeDays.set(days);
    this.load();
  }

  protected load(): void {
    const to = this.dateKey(new Date());
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - this.rangeDays() + 1);
    const from = this.dateKey(fromDate);
    this.loading.set(true);
    this.error.set('');
    this.revenueError.set('');
    this.platform
      .dashboard(from, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.overview.set(data);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(this.platform.describeError(err, 'dashboard'));
          this.loading.set(false);
        },
      });
    this.platform
      .revenue(from, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.revenue.set(data),
        error: (err) => {
          this.revenue.set(null);
          this.revenueError.set(this.platform.describeError(err, 'finance'));
        },
      });
    this.platform
      .revenue(to, to)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.todayRevenue.set(data),
        error: () => this.todayRevenue.set(null),
      });
  }

  protected barHeight(value: number, maximum: number): number {
    return value <= 0 ? 2 : Math.max(5, Math.round((value / maximum) * 100));
  }

  protected showDateLabel(index: number, length: number): boolean {
    const step = length <= 7 ? 1 : length <= 14 ? 2 : 5;
    return index % step === 0 || index === length - 1;
  }

  protected formatDate(value: string): string {
    const [year, month, day] = value.slice(0, 10).split('-').map(Number);
    return new Intl.DateTimeFormat('es-PE', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)));
  }

  private dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
}
