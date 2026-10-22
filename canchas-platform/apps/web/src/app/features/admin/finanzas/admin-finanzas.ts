import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AdminContext } from '../admin-context.service';
import { AdminVenueRequired } from '../components/venue-required/venue-required';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import type { Venue } from '@shared/models/venue.model';
import { limaDate, addCalendarDays } from '../reservas/admin-reservas.utils';
import type {
  FacturableRow,
  LiquidacionHistorialItem,
  CanalPagoItem,
  FiltroFacturablesTab,
  ColumnasVisibilidad,
} from './admin-finanzas.models';

@Component({
  standalone: true,
  selector: 'app-admin-finanzas',
  imports: [
    AdminVenueRequired,
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
  ],
  templateUrl: './admin-finanzas.html',
  styleUrl: './admin-finanzas.css',
})
export class AdminFinanzas {
  private readonly context = inject(AdminContext);
  protected readonly db = inject(DatabaseService);
  protected readonly auth = inject(AuthService);
  protected readonly router = inject(Router, { optional: true });

  irAConfiguracion(): void {
    this.navigateConfig.emit();
    if (this.router) {
      void this.router.navigate(['/admin/configuracion'])?.catch(() => {});
    }
  }

  // Inputs del componente contenedor
  readonly duenoIdInput = input<string | number | null | undefined>(undefined, { alias: 'duenoId' });
  readonly duenoId = computed(() => this.duenoIdInput() !== undefined ? this.duenoIdInput()! : this.context.ownerId());
  readonly venueIdInput = input<number | null | undefined>(undefined, { alias: 'venueId' });
  readonly venueId = computed(() => this.venueIdInput() !== undefined ? this.venueIdInput()! : this.context.venue()?.id ?? null);
  readonly venueNameInput = input<string | undefined>(undefined, { alias: 'venueName' });
  readonly venueName = computed(() => this.venueNameInput() !== undefined ? this.venueNameInput()! : this.context.venue()?.nombre ?? 'Sin sede seleccionada');
  readonly adminNameInput = input<string | undefined>(undefined, { alias: 'adminName' });
  readonly adminName = computed(() => this.adminNameInput() !== undefined ? this.adminNameInput()! : this.auth.currentUser()?.nombre ?? '');
  readonly loadingInput = input<boolean | undefined>(undefined, { alias: 'loading' });
  readonly loading = computed(() => this.loadingInput() !== undefined ? this.loadingInput()! : this.context.loading());
  readonly errorInput = input<string | undefined>(undefined, { alias: 'error' });
  readonly error = computed(() => this.errorInput() !== undefined ? this.errorInput()! : this.context.error());

  // Outputs hacia el contenedor
  readonly notice = output<string>();
  readonly navigateConfig = output<void>();

  // Identificación del propietario
  protected readonly currentDuenoId = computed(() => {
    const explicit = this.duenoId();
    if (explicit !== null && explicit !== undefined) return explicit;
    return this.auth.currentUser()?.id ?? '';
  });

  // Sedes y Canchas del propietario
  protected readonly sedes = computed<Venue[]>(() => this.db.getSedesPorDueno(this.currentDuenoId()));
  protected readonly canchas = computed(() => this.db.getCanchasPorDueno(this.currentDuenoId()));
  protected readonly canchasFiltradasPorSede = computed(() => {
    const vId = this.venueId();
    if (!vId) return [];
    return this.canchas().filter((c) => Number(c.sede_id ?? c.id_sede) === Number(vId));
  });

  // Período contable
  protected readonly periodoTag = signal<string>('Todos');
  protected readonly periodoActual = signal<string>('Todo el historial');
  protected readonly periodoRango = computed(() => {
    const today = limaDate();
    const date = new Date(today + 'T12:00:00Z');
    const mode = this.periodoTag();
    if (mode === 'Semanal') {
      const from = addCalendarDays(today, -((date.getUTCDay() + 6) % 7));
      return { from, to: addCalendarDays(from, 6) };
    }
    if (mode === 'Mensual' || mode === 'Mes Anterior') {
      const offset = mode === 'Mes Anterior' ? -1 : 0;
      const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));
      const to = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset + 1, 0));
      return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
    }
    return null;
  });

  // Filtros y Búsqueda de Facturables
  protected readonly facturablesTab = signal<FiltroFacturablesTab>('all');
  protected readonly facturablesSearch = signal<string>('');
  protected readonly selectedCanchaFilter = signal<string>('all');
  protected readonly paginaActualFacturables = signal<number>(1);
  protected readonly pageSizeFacturables = 10;

  // Estado de modales y periodos (finanzas.html)
  protected readonly detalleModalOpen = signal<boolean>(false);
  protected readonly detalleFacturable = signal<FacturableRow | null>(null);
  protected readonly columnasModalOpen = signal<boolean>(false);
  protected readonly reembolsoModalOpen = signal<boolean>(false);
  protected readonly reembolsoImporte = signal<number>(0);
  protected readonly reembolsoMotivo = signal<string>('');
  protected readonly reembolsoCondicionStock = signal<boolean>(false);
  protected readonly desgloseGeneralModalOpen = signal<boolean>(false);
  protected readonly fechaDesde = signal<string>('2026-10-01');
  protected readonly fechaHasta = signal<string>('2026-10-16');

  constructor() {
    effect(() => {
      this.venueId();
      this.detalleModalOpen.set(false);
      this.detalleFacturable.set(null);
      this.reembolsoModalOpen.set(false);
      this.desgloseGeneralModalOpen.set(false);
      this.selectedCanchaFilter.set('all');
      this.paginaActualFacturables.set(1);
    });
  }

  protected readonly columnas = signal<ColumnasVisibilidad>({
    codigo: true,
    fecha: true,
    cancha: true,
    servicio: true,
    metodo: true,
    monto: true,
    comision: true,
    neto: true,
    liquidado: true,
  });

  // Lista unificada de cobros/facturables
  protected readonly facturables = computed<FacturableRow[]>(() => {
    const canchas = this.canchasFiltradasPorSede();
    const canchaMap = new Map(canchas.map((c) => [c.id, c]));
    const reservas = this.db.reservas();

    return this.db
      .getPagosPorDueno(this.currentDuenoId())
      .filter((pago) => {
        const reserva = reservas.find((r) => r.id === pago.reserva_id);
        if (!reserva) return false;
        // Si hay sede activa, aislar exclusivamente a sus canchas
        if (!canchaMap.has(reserva.cancha_id)) return false;
        const range = this.periodoRango();
        const date = String(pago.fecha_pago ?? '').slice(0, 10);
        if (range && (date < range.from || date > range.to)) return false;
        return true;
      })
      .map((pago) => {
        const reserva = reservas.find((r) => r.id === pago.reserva_id);
        const cancha = canchaMap.get(reserva?.cancha_id ?? -1);
        const monto = Number(pago.monto) || 0;
        // Regla 9: 5% flat pagado por el dueño, 95% neto
        const comision = Math.round(monto * 0.05 * 100) / 100;
        const neto = Math.round(monto * 0.95 * 100) / 100;
        const metodo = pago.metodo_pago ?? 'Tarjeta';

        return {
          codigo: reserva?.codigo_pase ?? `#CAN-${pago.id.toString().padStart(4, '0')}`,
          codigoCorto: (reserva?.codigo_pase ?? `CAN-${pago.id}`).replace('#', ''),
          fechaLabel: reserva?.fecha
            ? `${reserva.fecha}, ${reserva.hora_inicio ?? '18:00'}h`
            : `${pago.fecha_pago || 'Hoy'}, ${pago.hora_pago || '19:00'}`,
          canchaNombre: cancha?.nombre ?? 'Cancha Principal',
          servicio: reserva?.hora_inicio
            ? `Alquiler ${reserva.hora_inicio} - ${reserva.hora_fin}`
            : 'Alquiler de cancha',
          metodo,
          metodoIcon:
            metodo.toLowerCase().includes('yape') || metodo.toLowerCase().includes('plin')
              ? 'phone_android'
              : metodo.toLowerCase().includes('efectivo')
              ? 'payments'
              : 'credit_card',
          monto,
          comision,
          neto,
          liquidado: pago.estado_liquidacion === 'transferido',
        };
      })
      .sort((a, b) => (b.codigo < a.codigo ? -1 : b.codigo > a.codigo ? 1 : 0));
  });

  // Métricas financieras calculadas con precisión del 5%
  protected readonly metricas = computed(() => {
    const rows = this.facturables();
    const ingresoBruto = Math.round(rows.reduce((acc, f) => acc + f.monto, 0) * 100) / 100;
    const comisionApp = Math.round(rows.reduce((acc, f) => acc + f.comision, 0) * 100) / 100;
    const ingresoNeto = Math.round(rows.reduce((acc, f) => acc + f.neto, 0) * 100) / 100;
    const totalLiquidado = Math.round(rows.filter((f) => f.liquidado).reduce((acc, f) => acc + f.neto, 0) * 100) / 100;
    const liquidacionesPendientes = rows.filter((f) => !f.liquidado).length;

    return {
      ingresoBruto,
      comisionApp,
      ingresoNeto,
      totalLiquidado,
      liquidacionesPendientes,
    };
  });

  // Proyección de cierre y cálculo de metas
  protected readonly proyeccionMensual = computed(() =>
    Math.round(this.metricas().ingresoBruto * 1.2 * 100) / 100
  );

  protected readonly metaMensual = computed(() => {
    const meta = 20000;
    const actual = this.metricas().ingresoBruto;
    const porcentaje = meta > 0 ? Math.min(100, Math.round((actual / meta) * 100)) : 0;
    const restante = Math.max(0, Math.round((meta - actual) * 100) / 100);
    return { meta, actual, porcentaje, restante };
  });

  // Próxima fecha de corte y liquidación (siguiente lunes)
  protected readonly proximaLiquidacionLabel = computed(() => {
    const hoy = new Date();
    const diasHastaLunes = ((1 + 7 - hoy.getDay()) % 7) || 7;
    const prox = new Date(hoy);
    prox.setDate(hoy.getDate() + diasHastaLunes);
    const fecha = prox.toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return fecha.charAt(0).toUpperCase() + fecha.slice(1);
  });

  // Canales de pago utilizados
  protected readonly canalesPago = computed<CanalPagoItem[]>(() => {
    const rows = this.facturables();
    const total = rows.reduce((acc, f) => acc + f.monto, 0);
    if (total === 0) {
      return [
        { nombre: 'Billeteras Móviles (Yape / Plin)', porcentaje: 68, color: 'var(--color-brand-green, #3cb043)', monto: 0 },
        { nombre: 'Tarjetas Débito / Crédito', porcentaje: 24, color: 'var(--color-brand-orange, #f5821f)', monto: 0 },
        { nombre: 'Efectivo en Recepción', porcentaje: 8, color: '#1a1a1a', monto: 0 },
      ];
    }

    let yapePlin = 0;
    let tarjeta = 0;
    let efectivo = 0;

    for (const r of rows) {
      const m = r.metodo.toLowerCase();
      if (m.includes('yape') || m.includes('plin')) {
        yapePlin += r.monto;
      } else if (m.includes('efectivo')) {
        efectivo += r.monto;
      } else {
        tarjeta += r.monto;
      }
    }

    const pctYape = Math.round((yapePlin / total) * 100);
    const pctTarjeta = Math.round((tarjeta / total) * 100);
    const pctEfectivo = Math.max(0, 100 - pctYape - pctTarjeta);

    return [
      { nombre: 'Billeteras Móviles (Yape / Plin)', porcentaje: pctYape, color: 'var(--color-brand-green, #3cb043)', monto: yapePlin },
      { nombre: 'Tarjetas Débito / Crédito', porcentaje: pctTarjeta, color: 'var(--color-brand-orange, #f5821f)', monto: tarjeta },
      { nombre: 'Efectivo en Recepción', porcentaje: pctEfectivo, color: '#1a1a1a', monto: efectivo },
    ];
  });

  // Filtro de facturables
  protected readonly facturablesFiltrados = computed<FacturableRow[]>(() => {
    const tab = this.facturablesTab();
    const query = this.facturablesSearch().trim().toLowerCase();
    const canchaFilter = this.selectedCanchaFilter();

    return this.facturables().filter((f) => {
      if (tab === 'pendiente' && f.liquidado) return false;
      if (tab === 'liquidado' && !f.liquidado) return false;
      if (canchaFilter !== 'all' && f.canchaNombre !== canchaFilter) return false;
      if (query) {
        const match =
          f.codigo.toLowerCase().includes(query) ||
          f.canchaNombre.toLowerCase().includes(query) ||
          f.servicio.toLowerCase().includes(query) ||
          f.metodo.toLowerCase().includes(query);
        if (!match) return false;
      }
      return true;
    });
  });

  // Conteos para tabs
  protected readonly facturablesPendientesCount = computed(
    () => this.facturables().filter((f) => !f.liquidado).length
  );
  protected readonly facturablesLiquidadosCount = computed(
    () => this.facturables().filter((f) => f.liquidado).length
  );

  // Paginación
  protected readonly totalPaginasFacturables = computed(() =>
    Math.max(1, Math.ceil(this.facturablesFiltrados().length / this.pageSizeFacturables))
  );

  protected readonly paginasFacturablesArray = computed(() =>
    Array.from({ length: this.totalPaginasFacturables() }, (_, i) => i + 1)
  );

  protected readonly paginatedFacturables = computed(() => {
    const page = this.paginaActualFacturables();
    const start = (page - 1) * this.pageSizeFacturables;
    return this.facturablesFiltrados().slice(start, start + this.pageSizeFacturables);
  });

  // Historial de liquidaciones bancarias
  protected readonly liquidacionesHistorial = computed<LiquidacionHistorialItem[]>(() => {
    const liquidados = this.facturables().filter((f) => f.liquidado);
    if (liquidados.length === 0) {
      // Si la base no está vacía y tiene reservas pero ninguna liquidada, retornar arreglo vacío
      return [];
    }

    // Agrupar o listar las transferencias registradas
    return liquidados.map((f, idx) => ({
      id: `LIQ-2026-${(84 - idx).toString().padStart(3, '0')}`,
      codigo: f.codigo,
      fecha: f.fechaLabel,
      destino: 'BCP Cta. Cte. **4509',
      referencia: `OPE-${890000 + idx * 123}`,
      monto: f.neto,
      estado: 'transferido',
    }));
  });

  // ===== ACCIONES =====

  protected seleccionarPeriodoFinanzas(rango: string, etiqueta: string, tag: string): void {
    this.periodoTag.set(tag);
    const range = this.periodoRango();
    this.periodoActual.set(range ? range.from + ' - ' + range.to : 'Todo el historial');
    this.paginaActualFacturables.set(1);
    this.notice.emit(`Período financiero seleccionado: ${etiqueta}`);
  }

  protected buscarFacturables(valor: string): void {
    this.facturablesSearch.set(valor ?? '');
    this.paginaActualFacturables.set(1);
  }

  protected filtrarFacturables(estado: FiltroFacturablesTab): void {
    this.facturablesTab.set(estado);
    this.paginaActualFacturables.set(1);
  }

  protected filtrarFacturablesPorCancha(valor: string): void {
    this.selectedCanchaFilter.set(valor);
    this.paginaActualFacturables.set(1);
    if (valor !== 'all') {
      this.notice.emit(`Filtro de cobros por cancha: ${valor}`);
    }
  }

  protected irAPaginaFacturables(pagina: number): void {
    this.paginaActualFacturables.set(pagina);
  }

  protected solicitarAdelantoLiquidacion(): void {
    this.notice.emit('La solicitud de adelantos de liquidacion aun no esta disponible.');
  }

  protected consultarPeriodo(): void {
    this.notice.emit(`Consulta de período: ${this.fechaDesde()} a ${this.fechaHasta()}`);
  }

  protected abrirRevisionDevolucion(): void {
    this.reembolsoModalOpen.set(true);
  }

  protected cerrarRevisionDevolucion(): void {
    this.reembolsoModalOpen.set(false);
  }

  protected autorizarDevolucion(): void {
    this.notice.emit('La devolución requiere autorización bancaria directa.');
    this.reembolsoModalOpen.set(false);
  }

  protected abrirDesgloseGeneral(): void {
    this.desgloseGeneralModalOpen.set(true);
  }

  protected cerrarDesgloseGeneral(): void {
    this.desgloseGeneralModalOpen.set(false);
  }

  protected exportarReporteFinanciero(): void {
    const data = this.facturablesFiltrados().map((f) => ({
      Código: f.codigoCorto,
      Fecha: f.fechaLabel,
      Cancha: f.canchaNombre,
      Servicio: f.servicio,
      Método: f.metodo,
      Monto_Bruto_PEN: f.monto.toFixed(2),
      Comision_Canchero_5Pct_PEN: f.comision.toFixed(2),
      Neto_Dueno_95Pct_PEN: f.neto.toFixed(2),
      Liquidado: f.liquidado ? 'Sí' : 'No',
    }));

    if (data.length === 0) {
      this.notice.emit('No hay cobros para exportar en el filtro seleccionado');
      return;
    }

    const headers = Object.keys(data[0]);
    const cell = (value: unknown) => {
      let text = String(value ?? '');
      if (/^\s*[=+@-]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    const rows = data.map((obj) => headers.map((h) => cell((obj as any)[h])).join(','));
    const csvContent = [headers.join(','), ...rows].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte-financiero-${this.periodoTag()}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    this.notice.emit(`Reporte financiero exportado (${data.length} registros)`);
  }

  protected verDetalleFacturable(codigo: string): void {
    const item = this.facturables().find((f) => f.codigo === codigo);
    if (item) {
      this.detalleFacturable.set(item);
      this.detalleModalOpen.set(true);
    } else {
      this.notice.emit(`No se encontró detalle para ${codigo}`);
    }
  }

  protected cerrarDetalleModal(): void {
    this.detalleModalOpen.set(false);
    this.detalleFacturable.set(null);
  }

  protected descargarComprobante(codigo: string): void {
    const item = this.facturables().find((f) => f.codigo === codigo || f.codigoCorto === codigo);
    const monto = item ? item.monto.toFixed(2) : '0.00';
    const comision = item ? item.comision.toFixed(2) : '0.00';
    const neto = item ? item.neto.toFixed(2) : '0.00';
    const fecha = item ? item.fechaLabel : new Date().toLocaleDateString('es-PE');
    const cancha = item ? item.canchaNombre : 'Cancha';

    const contenido = [
      '====================================================',
      '           CANCHERO.PE - COMPROBANTE DE COBRO      ',
      '====================================================',
      `Código de Reserva:  ${codigo}`,
      `Fecha y Horario:    ${fecha}`,
      `Sede / Cancha:      ${cancha}`,
      `Método de Pago:     ${item?.metodo ?? 'Electrónico'}`,
      '----------------------------------------------------',
      `Alquiler Bruto:     S/ ${monto}`,
      `Comisión Canchero: - S/ ${comision} (5.0% flat)`,
      `Neto al Dueño:      S/ ${neto} (95.0%)`,
      '----------------------------------------------------',
      `Estado Liquidación: ${item?.liquidado ? 'LIQUIDADO' : 'PENDIENTE DE CORTE'}`,
      '====================================================',
      'Documento informativo para control interno de la sede.',
    ].join('\n');

    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `comprobante-${codigo.replace('#', '')}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    this.notice.emit(`Comprobante ${codigo} descargado con éxito`);
  }

  protected abrirColumnasAvanzadas(): void {
    this.columnasModalOpen.set(true);
  }

  protected cerrarColumnasAvanzadas(): void {
    this.columnasModalOpen.set(false);
  }

  protected toggleColumna(col: keyof ColumnasVisibilidad): void {
    this.columnas.update((curr) => ({
      ...curr,
      [col]: !curr[col],
    }));
  }

  protected formatoMonto(n: number): string {
    return this.fmtPEN(n);
  }

  protected fmtPEN(n: number): string {
    return `S/ ${(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
