import {
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MAT_RIPPLE_GLOBAL_OPTIONS, MatNativeDateModule } from '@angular/material/core';
import { applyDateMaskToInput, isoToLocalDate, localDateToIso } from '@shared/utils/date-mask.util';

import { AdminContext } from '../admin-context.service';
import { CreditService } from '@core/services/credit.service';
import { CajaService } from '@core/services/caja.service';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import type {
  CuentaPorCobrar,
  AbonoCredito,
  EstadoCuentaCredito,
} from '@shared/models/credit.model';

@Component({
  standalone: true,
  selector: 'app-admin-creditos',
  imports: [
    CommonModule,
    DatePipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonToggleModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatTableModule,
    MatPaginatorModule,
    MatDatepickerModule,
    MatNativeDateModule,
  ],
  providers: [{ provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } }],
  templateUrl: './admin-creditos.html',
  styleUrl: './admin-creditos.css',
})
export class AdminCreditos {
  private readonly context = inject(AdminContext);
  readonly creditService = inject(CreditService);
  readonly cajaService = inject(CajaService);
  protected readonly auth = inject(AuthService);
  protected readonly db = inject(DatabaseService);

  readonly venueIdInput = input<number | null | undefined>(undefined, { alias: 'venueId' });
  readonly venueId = computed(() =>
    this.venueIdInput() !== undefined ? this.venueIdInput()! : (this.context.venue()?.id ?? null),
  );
  readonly venueNameInput = input<string | undefined>(undefined, { alias: 'venueName' });
  readonly venueName = computed(() =>
    this.venueNameInput() !== undefined
      ? this.venueNameInput()!
      : (this.context.venue()?.nombre ?? 'Sin sede seleccionada'),
  );

  readonly notice = output<string>();

  // Modales
  readonly modalAbonoOpen = signal(false);
  readonly cuentaSeleccionada = signal<CuentaPorCobrar | null>(null);
  readonly abonoMonto = signal<number>(0);
  readonly abonoMedio = signal<'efectivo' | 'yape' | 'plin' | 'tarjeta'>('yape');
  readonly abonoOperacion = signal<string>('');
  readonly abonoObservacion = signal<string>('');

  readonly modalNuevaCuentaOpen = signal(false);
  readonly nuevoCliente = signal<string>('');
  readonly nuevoDocumento = signal<string>('');
  readonly nuevoTelefono = signal<string>('');
  readonly nuevoEquipo = signal<string>('');
  readonly nuevoMonto = signal<number>(0);
  readonly nuevoConcepto = signal<string>('Consumo en cantina / alquiler');
  readonly nuevoFechaVencimiento = signal<string>('');

  readonly modalDetalleOpen = signal(false);
  readonly cuentaDetalle = signal<CuentaPorCobrar | null>(null);

  readonly cuentasColumns = [
    'cliente',
    'concepto',
    'original',
    'abonado',
    'saldo',
    'vencimiento',
    'estado',
    'acciones',
  ] as const;
  readonly abonosColumns = [
    'fecha',
    'medio',
    'operacion',
    'cajero',
    'monto',
    'comprobante',
  ] as const;
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly cuentasPaginadas = computed(() => {
    const all = this.creditService.cuentasFiltradas();
    const start = this.pageIndex() * this.pageSize();
    return all.slice(start, start + this.pageSize());
  });
  readonly nuevoFechaVencimientoDate = computed(() => isoToLocalDate(this.nuevoFechaVencimiento()));

  onPageChange(event: PageEvent): void {
    this.pageIndex.set(event.pageIndex);
    this.pageSize.set(event.pageSize);
  }

  onVencimientoDateChange(date: Date | null): void {
    const iso = localDateToIso(date);
    if (iso) this.nuevoFechaVencimiento.set(iso);
  }

  onVencimientoMaskInput(event: Event): void {
    const { iso } = applyDateMaskToInput(event);
    if (iso) this.nuevoFechaVencimiento.set(iso);
  }

  constructor() {
    effect(() => {
      const vId = this.venueId();
      untracked(() => {
        if (vId) {
          this.creditService.cargarCuentas(vId);
        }
      });
    });
  }

  setFiltro(estado: EstadoCuentaCredito): void {
    this.creditService.filtroEstado.set(estado);
  }

  onBuscar(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.creditService.busqueda.set(input?.value || '');
  }

  // --- Modal Abono ---
  abrirModalAbono(cuenta: CuentaPorCobrar): void {
    this.cuentaSeleccionada.set(cuenta);
    this.abonoMonto.set(cuenta.saldo);
    this.abonoMedio.set('yape');
    this.abonoOperacion.set('');
    this.abonoObservacion.set('');
    this.modalAbonoOpen.set(true);
  }

  cerrarModalAbono(): void {
    this.modalAbonoOpen.set(false);
    this.cuentaSeleccionada.set(null);
  }

  setPorcentajeAbono(pct: number): void {
    const cuenta = this.cuentaSeleccionada();
    if (!cuenta) return;
    const monto = Number(((cuenta.saldo * pct) / 100).toFixed(2));
    this.abonoMonto.set(monto);
  }

  async confirmarAbono(): Promise<void> {
    const cuenta = this.cuentaSeleccionada();
    if (!cuenta) return;
    const monto = Number(this.abonoMonto());

    if (monto <= 0) {
      this.notice.emit('El monto del abono debe ser mayor a 0');
      return;
    }
    if (monto > cuenta.saldo + 0.01) {
      this.notice.emit(
        `El abono (S/ ${monto.toFixed(2)}) no puede exceder el saldo (S/ ${cuenta.saldo.toFixed(2)})`,
      );
      return;
    }

    const sesionActiva = this.cajaService.sesionActiva();
    try {
      const updated = await this.creditService.registrarAbono(cuenta.id, {
        cuentaId: cuenta.id,
        monto,
        medioPago: this.abonoMedio(),
        nroOperacion: this.abonoOperacion().trim() || undefined,
        sesionCajaId: sesionActiva?.id,
        observacion: this.abonoObservacion().trim() || undefined,
      });

      this.modalAbonoOpen.set(false);
      this.cuentaSeleccionada.set(null);
      this.notice.emit(
        `Abono de S/ ${monto.toFixed(2)} registrado para ${updated.clienteNombre}. Saldo restante: S/ ${updated.saldo.toFixed(2)}`,
      );
    } catch (err: any) {
      this.notice.emit(err?.message || 'Error al registrar el abono');
    }
  }

  // --- Modal Nueva Cuenta ---
  abrirModalNuevaCuenta(): void {
    const en7Dias = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    this.nuevoCliente.set('');
    this.nuevoDocumento.set('');
    this.nuevoTelefono.set('');
    this.nuevoEquipo.set('');
    this.nuevoMonto.set(0);
    this.nuevoConcepto.set('Consumo en cantina / alquiler');
    this.nuevoFechaVencimiento.set(en7Dias);
    this.modalNuevaCuentaOpen.set(true);
  }

  cerrarModalNuevaCuenta(): void {
    this.modalNuevaCuentaOpen.set(false);
  }

  async confirmarNuevaCuenta(): Promise<void> {
    const vId = this.venueId();
    if (!vId) {
      this.notice.emit('Selecciona una sede para registrar la cuenta');
      return;
    }
    const cliente = this.nuevoCliente().trim();
    const monto = Number(this.nuevoMonto());

    if (!cliente) {
      this.notice.emit('Ingresa el nombre del cliente o equipo');
      return;
    }
    if (monto <= 0) {
      this.notice.emit('El monto inicial del fiado debe ser mayor a 0');
      return;
    }

    try {
      const created = await this.creditService.crearCuenta({
        sedeId: vId,
        clienteNombre: cliente,
        clienteDocumento: this.nuevoDocumento().trim() || undefined,
        telefono: this.nuevoTelefono().trim() || undefined,
        equipo: this.nuevoEquipo().trim() || undefined,
        montoOriginal: monto,
        concepto: this.nuevoConcepto().trim(),
        fechaVencimiento: this.nuevoFechaVencimiento() || undefined,
      });

      this.modalNuevaCuentaOpen.set(false);
      this.notice.emit(
        `Cuenta creada exitosamente para ${created.clienteNombre} (S/ ${monto.toFixed(2)})`,
      );
    } catch (err: any) {
      this.notice.emit(err?.message || 'Error al crear la cuenta de crédito');
    }
  }

  // --- Detalle y Ticket de Abono ---
  verDetalle(cuenta: CuentaPorCobrar): void {
    this.cuentaDetalle.set(cuenta);
    this.modalDetalleOpen.set(true);
  }

  cerrarModalDetalle(): void {
    this.modalDetalleOpen.set(false);
    this.cuentaDetalle.set(null);
  }

  imprimirVoucherAbono(abono: AbonoCredito, cuenta: CuentaPorCobrar): void {
    const ventana = window.open('', '_blank', 'width=420,height=600');
    if (!ventana) {
      this.notice.emit('El navegador bloqueó la ventana de impresión.');
      return;
    }

    const fechaAbono = new Date(abono.fecha).toLocaleString('es-PE');
    ventana.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Constancia de Abono #AB-${abono.id}</title>
          <style>
            @page { size: 80mm auto; margin: 3mm; }
            body { font-family: "Courier New", monospace; font-size: 11px; margin: 0; padding: 10px; color: #000; }
            .center { text-align: center; }
            .divider { border-bottom: 1px dashed #000; margin: 6px 0; }
            .double-divider { border-bottom: 1px solid #000; margin: 6px 0; }
            .row { display: flex; justify-content: space-between; margin-bottom: 3px; }
            .bold { font-weight: bold; }
            .big { font-size: 13px; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="center bold big">CANCHERO SPORT CLUB</div>
          <div class="center">${this.venueName()}</div>
          <div class="divider"></div>
          <div class="center bold">CONSTANCIA DE ABONO A CUENTA</div>
          <div class="center">Recibo N° AB-${abono.id}</div>
          <div class="divider"></div>
          <div class="row"><span>Fecha:</span><span>${fechaAbono}</span></div>
          <div class="row"><span>Cajero:</span><span>${abono.cajeroNombre}</span></div>
          <div class="row"><span>Cliente:</span><span class="bold">${cuenta.clienteNombre}</span></div>
          ${cuenta.equipo ? `<div class="row"><span>Equipo:</span><span>${cuenta.equipo}</span></div>` : ''}
          <div class="divider"></div>
          <div class="row"><span>Medio Pago:</span><span class="bold">${abono.medioPago.toUpperCase()}</span></div>
          ${abono.nroOperacion ? `<div class="row"><span>N° Operación:</span><span>${abono.nroOperacion}</span></div>` : ''}
          <div class="row big"><span>MONTO ABONADO:</span><span>S/ ${abono.monto.toFixed(2)}</span></div>
          <div class="double-divider"></div>
          <div class="row"><span>Deuda Inicial:</span><span>S/ ${cuenta.montoOriginal.toFixed(2)}</span></div>
          <div class="row"><span>Saldo Restante:</span><span class="bold">S/ ${cuenta.saldo.toFixed(2)}</span></div>
          <div class="divider"></div>
          <div class="center">CONTROL INTERNO - GRACIAS POR SU PAGO</div>
        </body>
      </html>
    `);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => {
      ventana.print();
      ventana.close();
    }, 200);
  }
}
