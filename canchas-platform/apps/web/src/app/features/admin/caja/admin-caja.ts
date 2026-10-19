import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AdminContext } from '../admin-context.service';
import { AdminVenueRequired } from '../components/venue-required/venue-required';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MAT_RIPPLE_GLOBAL_OPTIONS } from '@angular/material/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { CajaService, DENOMINACIONES_PERU } from '@core/services/caja.service';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { ConfirmationService } from '@shared/components/confirmation/confirmation.service';
import type {
  ArqueoFila,
  ArqueoRegistro,
  DenominacionMonetaria,
  MovimientoManualCaja,
  SesionCaja,
} from '@shared/models/caja.model';

@Component({
  standalone: true,
  selector: 'app-admin-caja',
  imports: [
    AdminVenueRequired,
    CommonModule,
    DatePipe,
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatCardModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
  ],
  templateUrl: './admin-caja.html',
  providers: [{ provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } }],
  styleUrl: './admin-caja.css',
})
export class AdminCaja {
  private readonly confirmation = inject(ConfirmationService);
  private confirmingClosure = false;
  private readonly context = inject(AdminContext);
  readonly venueIdInput = input<number | null | undefined>(undefined, { alias: 'venueId' });
  readonly venueId = computed(() => this.venueIdInput() !== undefined ? this.venueIdInput()! : this.context.venue()?.id ?? null);
  readonly venueNameInput = input<string | undefined>(undefined, { alias: 'venueName' });
  readonly venueName = computed(() => this.venueNameInput() !== undefined ? this.venueNameInput()! : this.context.venue()?.nombre ?? 'Sin sede seleccionada');
  readonly loadingInput = input<boolean | undefined>(undefined, { alias: 'loading' });
  readonly loading = computed(() => this.loadingInput() !== undefined ? this.loadingInput()! : this.context.loading() || (this.cajaService.loading?.() ?? false));
  readonly errorInput = input<string | undefined>(undefined, { alias: 'error' });
  readonly error = computed(() => this.errorInput() !== undefined ? this.errorInput()! : this.context.error() || (this.cajaService.loadError?.() ?? ''));

  readonly notice = output<string>();

  protected readonly cajaService = inject(CajaService);
  protected readonly auth = inject(AuthService);
  protected readonly db = inject(DatabaseService);

  readonly denominaciones: DenominacionMonetaria[] = DENOMINACIONES_PERU;

  // Subpestañas del módulo de Caja
  readonly cajaSubTab = signal<'operacion' | 'arqueo' | 'historial'>('operacion');

  // Modal apertura de turno
  readonly modalAperturaCajaOpen = signal(false);
  readonly aperturaCajaId = signal(1);
  readonly aperturaMonto = signal(150.0);
  readonly aperturaCajero = signal('Roberto Mendoza');

  // Modal movimiento manual
  readonly modalMovimientoCajaOpen = signal(false);
  readonly movimientoTipo = signal<'ingreso' | 'egreso'>('egreso');
  readonly movimientoMonto = signal(20.0);
  readonly movimientoConcepto = signal('');
  readonly movimientoAutorizado = signal('Roberto Mendoza');

  // Conteo Físico para Arqueo
  readonly conteoCantidades = signal<Record<number, number>>({
    1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0,
  });
  readonly arqueoObservaciones = signal('');
  readonly arqueoCiegoRevelado = signal(false);
  readonly modalComprobanteArqueoOpen = signal(false);
  readonly detalleArqueoSeleccionado = signal<ArqueoRegistro | null>(null);

  // Computeds
  readonly sesionActual = computed(() => this.cajaService.sesionActiva());

  readonly arqueoFilasCalculadas = computed<ArqueoFila[]>(() => {
    const counts = this.conteoCantidades();
    return this.denominaciones.map((d) => {
      const cantidad = counts[d.id] || 0;
      return {
        denominacion: d,
        cantidad,
        subtotal: Number((cantidad * d.valor).toFixed(2)),
      };
    });
  });

  readonly totalEfectivoRecontado = computed<number>(() => {
    return Number(this.arqueoFilasCalculadas().reduce((acc, f) => acc + f.subtotal, 0).toFixed(2));
  });

  readonly montoSistemaCalculado = computed<number>(() => {
    return this.cajaService.montoSistemaEsperado();
  });

  readonly diferenciaCalculada = computed<number>(() => {
    return Number((this.totalEfectivoRecontado() - this.montoSistemaCalculado()).toFixed(2));
  });

  readonly balanceEstadoCalculado = computed<'cuadrada' | 'faltante' | 'sobrante'>(() => {
    const diff = this.diferenciaCalculada();
    if (Math.abs(diff) <= 0.05) return 'cuadrada';
    return diff < -0.05 ? 'faltante' : 'sobrante';
  });

  cambiarCajaSubTab(tab: 'operacion' | 'arqueo' | 'historial'): void {
    this.cajaSubTab.set(tab);
  }

  abrirModalAperturaCaja(): void {
    this.aperturaMonto.set(150.0);
    this.aperturaCajero.set(this.auth.currentUser()?.nombre || 'Roberto Mendoza');
    this.modalAperturaCajaOpen.set(true);
  }

  cerrarModalAperturaCaja(): void {
    this.modalAperturaCajaOpen.set(false);
  }

  async confirmarAperturaTurno(): Promise<void> {
    if (this.cajaService.processing()) return;
    const monto = Number(this.aperturaMonto());
    if (isNaN(monto) || monto < 0) {
      this.notice.emit('Ingresa un monto de apertura válido.');
      return;
    }
    const caja = this.cajaService.cajasRegistradas().find(c => c.id === this.aperturaCajaId() && Number(c.sedeId) === Number(this.venueId()));
    if (!this.venueId() || !caja) {
      this.notice.emit('Selecciona una caja registrada en esta sede.');
      return;
    }
    try {
    await this.cajaService.abrirTurno(
      caja.id,
      caja.nombre,
      this.venueId() || caja.sedeId,
      this.aperturaCajero(),
      this.auth.currentUser()?.email || 'admin@canchero.pe',
      monto
    );
    this.modalAperturaCajaOpen.set(false);
    this.limpiarConteoArqueo();
    this.cajaSubTab.set('operacion');
    this.notice.emit(`Turno aperturado en ${caja.nombre} con fondo inicial de S/ ${monto.toFixed(2)}.`);
    } catch (error: any) {
      this.notice.emit(error?.error?.message || error?.message || 'No se pudo abrir el turno.');
    }
  }

  abrirModalMovimiento(tipo: 'ingreso' | 'egreso' = 'egreso'): void {
    if (!this.cajaService.tieneSesionActiva()) {
      this.notice.emit('Debes aperturar un turno de caja antes de registrar movimientos.');
      return;
    }
    this.movimientoTipo.set(tipo);
    this.movimientoMonto.set(tipo === 'egreso' ? 25.0 : 50.0);
    this.movimientoConcepto.set('');
    this.movimientoAutorizado.set(this.auth.currentUser()?.nombre || 'Roberto Mendoza');
    this.modalMovimientoCajaOpen.set(true);
  }

  cerrarModalMovimiento(): void {
    this.modalMovimientoCajaOpen.set(false);
  }

  async confirmarRegistroMovimiento(): Promise<void> {
    if (this.cajaService.processing()) return;
    const monto = Number(this.movimientoMonto());
    const concepto = this.movimientoConcepto().trim();
    if (!concepto) {
      this.notice.emit('El concepto o motivo del movimiento es obligatorio.');
      return;
    }
    if (isNaN(monto) || monto <= 0) {
      this.notice.emit('Ingresa un monto válido mayor a 0.');
      return;
    }
    try {
    await this.cajaService.registrarMovimiento(
      this.movimientoTipo(),
      monto,
      concepto,
      this.movimientoAutorizado()
    );
    this.modalMovimientoCajaOpen.set(false);
    this.notice.emit(
      `Movimiento de ${this.movimientoTipo() === 'ingreso' ? 'Ingreso' : 'Egreso'} por S/ ${monto.toFixed(2)} registrado correctamente.`
    );
    } catch (error: any) {
      this.notice.emit(error?.error?.message || error?.message || 'No se pudo guardar el movimiento.');
    }
  }

  setCantidadDenominacion(id: number, val: any): void {
    const parsed = Math.max(0, parseInt(String(val), 10) || 0);
    this.conteoCantidades.update((prev) => ({ ...prev, [id]: parsed }));
  }

  modificarCantidadDenominacion(id: number, delta: number): void {
    this.conteoCantidades.update((prev) => {
      const actual = prev[id] || 0;
      const nuevo = Math.max(0, actual + delta);
      return { ...prev, [id]: nuevo };
    });
  }

  limpiarConteoArqueo(): void {
    this.conteoCantidades.set({
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0, 10: 0, 11: 0,
    });
    this.arqueoObservaciones.set('');
    this.arqueoCiegoRevelado.set(false);
  }

  cargarEjemploArqueoEspecificacion(): void {
    this.conteoCantidades.set({
      1: 1,  // S/ 200 -> 200
      2: 4,  // S/ 100 -> 400
      3: 3,  // S/ 50  -> 150
      4: 5,  // S/ 20  -> 100
      5: 8,  // S/ 10  -> 80
      6: 10, // S/ 5   -> 50
      7: 15, // S/ 2   -> 30
      8: 22, // S/ 1   -> 22
      9: 0,  // S/ 0.50 -> 0
      10: 0, // S/ 0.20 -> 0
      11: 0, // S/ 0.10 -> 0
    });
    this.arqueoCiegoRevelado.set(true);
    this.notice.emit('Tabla de conteo físico cargada según especificación 5.4 (Total: S/ 1,032.00).');
  }

  alternarArqueoCiego(): void {
    this.arqueoCiegoRevelado.update((v) => !v);
  }

  async ejecutarCierreDeTurno(): Promise<void> {
    if (this.confirmingClosure) return;
    if (!this.cajaService.tieneSesionActiva()) {
      this.notice.emit('No hay una sesión activa para cerrar.');
      return;
    }

    const balance = this.balanceEstadoCalculado();
    const obs = this.arqueoObservaciones().trim();
    if (balance !== 'cuadrada' && !obs) {
      this.notice.emit('Es obligatorio ingresar una justificación en las observaciones por descuadre de caja.');
      return;
    }

    const sessionId = this.cajaService.sesionActiva()?.id;
    const venueId = this.venueId();
    this.confirmingClosure = true;
    let confirmed = false;
    try {
      confirmed = await this.confirmation.confirm({
        title: '¿Cerrar este turno de caja?',
        message: 'Confirma que revisaste el conteo físico y las observaciones. El cierre finalizará el turno actual.',
        confirmLabel: 'Sí, cerrar turno',
      });
    } finally { this.confirmingClosure = false; }
    if (!confirmed || venueId !== this.venueId() || sessionId !== this.cajaService.sesionActiva()?.id) return;
    try {
    const arqueo = await this.cajaService.cerrarTurnoConArqueo(
      this.conteoCantidades(),
      obs
    );
    this.detalleArqueoSeleccionado.set(arqueo);
    this.modalComprobanteArqueoOpen.set(true);
    this.limpiarConteoArqueo();
    this.cajaSubTab.set('historial');
    this.notice.emit(`Cierre de caja completado: Balance ${arqueo.balanceEstado.toUpperCase()}.`);
    } catch (error: any) {
      this.notice.emit(error?.error?.message || error?.message || 'No se pudo cerrar el turno. Sigue abierto hasta confirmacion del servidor.');
    }
  }

  abrirComprobanteArqueo(arqueo: ArqueoRegistro): void {
    this.detalleArqueoSeleccionado.set(arqueo);
    this.modalComprobanteArqueoOpen.set(true);
  }

  cerrarModalComprobanteArqueo(): void {
    this.modalComprobanteArqueoOpen.set(false);
  }

  imprimirTicketArqueo(): void {
    window.print();
  }
}
