import {
  Component,
  DestroyRef,
  TemplateRef,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { CurrencyPipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatabaseService } from '@core/supabase/database.service';
import { AdminContext } from '../admin-context.service';
import { AuthService } from '@core/auth/auth.service';
import { CajaService } from '@core/services/caja.service';
import type {
  AdminReservationRow,
  ReservationFilter,
  ReservationAction,
  CourtOption,
  NuevaReservaPresencialInput,
} from './admin-reservas.models';
import {
  reservationCsv,
  limaDate,
  addCalendarDays,
  addHoursToTime,
  calculateBookingPrice,
  isTimeOverlap,
} from './admin-reservas.utils';

export const HORAS_INICIO_DISPONIBLES = [
  '06:00',
  '07:00',
  '08:00',
  '09:00',
  '10:00',
  '11:00',
  '12:00',
  '13:00',
  '14:00',
  '15:00',
  '16:00',
  '17:00',
  '18:00',
  '19:00',
  '20:00',
  '21:00',
  '22:00',
  '23:00',
] as const;

export const DURACIONES_DISPONIBLES = [
  { horas: 1, label: '1 hora' },
  { horas: 2, label: '2 horas consecutivas' },
  { horas: 3, label: '3 horas consecutivas' },
  { horas: 4, label: '4 horas consecutivas' },
] as const;

export const METODOS_PAGO_PRESENCIAL = ['Efectivo', 'Tarjeta', 'Yape', 'Plin'] as const;

@Component({
  standalone: true,
  selector: 'app-admin-reservas',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatPaginatorModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  templateUrl: './admin-reservas.html',
  styleUrl: './admin-reservas.css',
})
export class AdminReservas {
  readonly presentialOperationsAvailable = false;
  private readonly context = inject(AdminContext);
  private readonly db = inject(DatabaseService);
  private readonly auth = inject(AuthService, { optional: true });
  private readonly cajaService = inject(CajaService, { optional: true });

  readonly rowsInput = input<readonly AdminReservationRow[]>(undefined, { alias: 'rows' });
  readonly rows = computed<readonly AdminReservationRow[]>(() => {
    const custom = this.rowsInput();
    if (custom !== undefined) return custom;
    return this.fallbackReservasDelDueno();
  });

  readonly courtsInput = input<readonly CourtOption[]>(undefined, { alias: 'courts' });
  readonly courts = computed<readonly CourtOption[]>(() => {
    const custom = this.courtsInput();
    if (custom !== undefined) return custom;
    return this.fallbackCourts();
  });

  readonly venueIdInput = input<number | null>(undefined, { alias: 'venueId' });
  readonly venueId = computed<number | null>(() => {
    const custom = this.venueIdInput();
    if (custom !== undefined) return custom;
    return this.context.venue()?.id ?? null;
  });

  readonly venueNameInput = input<string>(undefined, { alias: 'venueName' });
  readonly venueName = computed<string>(() => {
    const custom = this.venueNameInput();
    if (custom !== undefined) return custom;
    const vId = this.venueId();
    if (vId && this.db.sedes) {
      const s = this.db.sedes().find((v) => Number(v.id) === Number(vId));
      if (s) return s.nombre;
    }
    return 'Sin sede seleccionada';
  });

  readonly minimumDepositPercentInput = input<number>(undefined, { alias: 'minimumDepositPercent' });
  readonly minimumDepositPercent = computed<number>(() => {
    const custom = this.minimumDepositPercentInput();
    if (custom !== undefined) return custom;
    const vId = this.venueId();
    if (vId && this.db.sedes) {
      const s = this.db.sedes().find((v) => Number(v.id) === Number(vId));
      if (s?.porcentaje_adelanto_minimo != null) return s.porcentaje_adelanto_minimo;
    }
    return 50;
  });

  readonly loadingInput = input<boolean | undefined>(undefined, { alias: 'loading' });
  readonly loading = computed(() => this.loadingInput() ?? this.context.loading());
  readonly errorInput = input<string | undefined>(undefined, { alias: 'error' });
  readonly error = computed(() => this.errorInput() ?? this.context.error());

  private readonly duenoId = computed(() => this.auth?.currentUser()?.id ?? '');

  protected readonly fallbackCourts = computed<readonly CourtOption[]>(() => {
    const vId = this.venueId();
    if (!vId || !this.db.getCanchasPorSede) return [];
    return this.db.getCanchasPorSede(vId).map((c) => ({
      id: c.id,
      nombre: c.nombre,
      precio_hora: c.precio_hora,
      precio_hora_noche: c.precio_hora_noche,
      hora_inicio_noche: c.hora_inicio_noche,
    }));
  });

  protected readonly fallbackReservasDelDueno = computed<readonly AdminReservationRow[]>(() => {
    if (!this.db.getReservasPorDueno || !this.db.usuarios || !this.db.pagos) return [];
    const dueno = this.duenoId();
    const canchas = this.fallbackCourts();
    const canchaIds = new Set(canchas.map((c) => c.id));
    const usuarios = this.db.usuarios();
    const pagos = this.db.pagos();

    return this.db
      .getReservasPorDueno(dueno)
      .filter((reserva) => canchaIds.has(reserva.cancha_id))
      .map((reserva) => {
        const cancha = canchas.find((c) => c.id === reserva.cancha_id);
        const jugador = usuarios.find((u) => u.id === reserva.usuario_id);
        const pago = pagos.find((p) => p.reserva_id === reserva.id);
        const metodo = pago ? pago.metodo_pago : 'Sin pago registrado';
        const esClienteSinCuenta = !!reserva.es_cliente_sin_cuenta;
        const jugadorNombre = esClienteSinCuenta
          ? (reserva.nombre_cliente || 'Cliente sin cuenta')
          : (jugador?.nombre ?? (reserva.usuario_id ? reserva.usuario_id.toString() : 'Jugador'));
        const telefono = esClienteSinCuenta
          ? (reserva.telefono_cliente || '')
          : (jugador?.telefono ?? '');
        const montoTotal = Number(reserva.monto_total ?? pago?.monto ?? 0);
        const adelanto = Number(reserva.adelanto ?? pago?.monto ?? 0);
        const saldo = Number(reserva.saldo ?? Math.max(0, montoTotal - adelanto));

        return {
          reserva,
          codigoPase: reserva.codigo_pase ?? `#CAN-${1000 + reserva.id}`,
          codigoCorto: (reserva.codigo_pase ?? `#CAN-${1000 + reserva.id}`).replace('#', ''),
          horario: `${reserva.hora_inicio} - ${reserva.hora_fin}`,
          fechaLabel: reserva.fecha,
          canchaNombre: cancha?.nombre ?? 'Cancha sin nombre',
          canchaTag1: 'Fútbol',
          canchaTag2: 'Césped sintético',
          jugadorNombre,
          telefono,
          iniciales: jugadorNombre.slice(0, 2).toUpperCase(),
          estado: reserva.estado,
          monto: adelanto,
          montoTotal,
          adelanto,
          saldo,
          esClienteSinCuenta,
          checkInRealizado: !!reserva.check_in_realizado,
          metodo,
          metodoIcon: 'payments',
          operacion: pago?.numero_operacion ?? pago?.codigo_operacion ?? '',
          waLink: telefono ? `https://wa.me/${telefono.replace(/[^0-9]/g, '')}` : '',
        };
      })
      .sort((a, b) => {
        const ka = `${a.reserva.fecha}_${a.reserva.hora_inicio}`;
        const kb = `${b.reserva.fecha}_${b.reserva.hora_inicio}`;
        return kb < ka ? -1 : kb > ka ? 1 : 0;
      });
  });

  readonly refresh = output<void>();
  readonly action = output<ReservationAction>();
  readonly createBooking = output<NuevaReservaPresencialInput>();
  readonly updateDepositPercent = output<number>();
  readonly notice = output<string>();

  readonly filter = signal<ReservationFilter>('pendientes');
  readonly query = signal('');
  readonly courtId = signal<number | null>(null);
  readonly pageIndex = signal(0);
  readonly pageSize = signal(10);
  readonly today = signal(limaDate());
  readonly selected = signal<AdminReservationRow | null>(null);

  // Form state for Nueva Reserva Presencial
  readonly bookingCourtId = signal<number | null>(null);
  readonly bookingDate = signal<string>(limaDate());
  readonly bookingStartHour = signal<string>('18:00');
  readonly bookingDuration = signal<number>(1);
  readonly bookingEsClienteSinCuenta = signal<boolean>(true);
  readonly bookingNombreCliente = signal<string>('');
  readonly bookingTelefonoCliente = signal<string>('');
  readonly bookingTipoPago = signal<'total' | 'adelanto'>('total');
  readonly bookingMontoAdelantoManual = signal<number | null>(null);
  readonly bookingMetodoPago = signal<string>('Efectivo');
  readonly bookingNumeroOperacion = signal<string>('');
  readonly guardando = signal<boolean>(false);

  // State for Cobrar Saldo
  readonly saldoMetodoPago = signal<string>('Efectivo');
  readonly saldoOperacion = signal<string>('');

  // State for Cancelar Reserva
  readonly cancelMotivo = signal<string>('');
  readonly cancelDevolucion = signal<number>(0);

  // State for Configurar Adelanto
  readonly depositPercentDraft = signal<number>(50);

  // Constants exposed to template
  readonly horasInicio = HORAS_INICIO_DISPONIBLES;
  readonly duraciones = DURACIONES_DISPONIBLES;
  readonly metodosPago = METODOS_PAGO_PRESENCIAL;

  private readonly dialogs = inject(MatDialog);
  private readonly detailTemplate = viewChild.required<TemplateRef<unknown>>('reservationDetail');
  private readonly bookingTemplate = viewChild.required<TemplateRef<unknown>>('bookingDialog');
  private readonly balanceTemplate = viewChild.required<TemplateRef<unknown>>('balanceDialog');
  private readonly passTemplate = viewChild.required<TemplateRef<unknown>>('passDialog');
  private readonly cancelTemplate = viewChild.required<TemplateRef<unknown>>('cancelDialog');
  private readonly depositConfigTemplate = viewChild.required<TemplateRef<unknown>>('depositConfigDialog');
  private dialogRef?: MatDialogRef<unknown>;

  // Scoped rows by selected venue
  readonly scopedRows = computed(() => {
    if (this.venueId() === null) return [];
    const ids = new Set(this.courts().map((court) => court.id));
    return this.rows().filter((row) => ids.has(row.reserva.cancha_id));
  });

  readonly pendingCount = computed(() => this.scopedRows().filter((row) => row.estado === 'pendiente').length);

  readonly filteredRows = computed(() => {
    const from = this.today();
    const until = addCalendarDays(from, 6);
    const query = this.query().trim().toLocaleLowerCase('es-PE');
    return this.scopedRows().filter((row) => {
      if (this.filter() === 'pendientes' && row.estado !== 'pendiente') return false;
      if (this.filter() === 'hoy' && row.reserva.fecha !== from) return false;
      if (this.filter() === 'semana' && (row.reserva.fecha < from || row.reserva.fecha > until)) return false;
      if (this.courtId() !== null && row.reserva.cancha_id !== this.courtId()) return false;
      return `${row.codigoPase} ${row.jugadorNombre} ${row.telefono}`.toLocaleLowerCase('es-PE').includes(query);
    });
  });

  readonly effectivePage = computed(() =>
    Math.min(this.pageIndex(), Math.max(0, Math.ceil(this.filteredRows().length / this.pageSize()) - 1)),
  );

  readonly pageRows = computed(() =>
    this.filteredRows().slice(
      this.effectivePage() * this.pageSize(),
      (this.effectivePage() + 1) * this.pageSize(),
    ),
  );

  // Computations for booking creation
  readonly selectedCourt = computed(() => {
    const id = this.bookingCourtId();
    return this.courts().find((c) => c.id === id) ?? this.courts()[0] ?? null;
  });

  readonly bookingEndHour = computed(() => {
    return addHoursToTime(this.bookingStartHour(), this.bookingDuration());
  });

  readonly pricingCalculation = computed(() => {
    return calculateBookingPrice(this.selectedCourt(), this.bookingStartHour(), this.bookingDuration());
  });

  readonly bookingTotal = computed(() => this.pricingCalculation().total);

  readonly bookingMinDeposit = computed(() => {
    return Math.ceil(this.bookingTotal() * (this.minimumDepositPercent() / 100));
  });

  readonly effectiveDeposit = computed(() => {
    if (this.bookingTipoPago() === 'total') return this.bookingTotal();
    const manual = this.bookingMontoAdelantoManual();
    if (manual === null || manual === undefined || isNaN(manual)) return this.bookingMinDeposit();
    return Math.max(this.bookingMinDeposit(), Math.min(this.bookingTotal(), manual));
  });

  readonly bookingSaldo = computed(() => Math.max(0, this.bookingTotal() - this.effectiveDeposit()));

  readonly bookingConflict = computed(() => {
    const courtId = this.bookingCourtId();
    if (courtId === null) return null;
    const date = this.bookingDate();
    const start = this.bookingStartHour();
    const end = this.bookingEndHour();

    return (
      this.scopedRows().find(
        (r) =>
          r.reserva.cancha_id === courtId &&
          r.reserva.fecha === date &&
          r.estado !== 'cancelada' &&
          isTimeOverlap(start, end, r.reserva.hora_inicio, r.reserva.hora_fin),
      ) ?? null
    );
  });

  readonly canSubmitBooking = computed(() => {
    if (!this.presentialOperationsAvailable) return false;
    if (this.venueId() === null || this.bookingCourtId() === null || !this.bookingDate()) return false;
    if (this.bookingConflict() !== null) return false;
    if (this.bookingEsClienteSinCuenta()) {
      if (this.bookingNombreCliente().trim().length < 3) return false;
      if (this.bookingTelefonoCliente().trim().length < 6) return false;
    }
    if (this.bookingTotal() <= 0) return false;
    if (this.guardando()) return false;
    return true;
  });

  constructor() {
    effect(() => {
      this.venueId();
      this.filter.set('pendientes');
      this.query.set('');
      this.courtId.set(null);
      this.pageIndex.set(0);
      this.dialogRef?.close();
      this.selected.set(null);
    });
    inject(DestroyRef).onDestroy(() => this.dialogRef?.close());
  }

  showPending(): void {
    this.setFilter('pendientes');
  }

  setFilter(value: ReservationFilter): void {
    this.today.set(limaDate());
    this.filter.set(value);
    this.pageIndex.set(0);
  }

  search(value: string): void {
    this.query.set(value);
    this.pageIndex.set(0);
  }

  selectCourt(id: number | null): void {
    this.courtId.set(id);
    this.pageIndex.set(0);
  }

  paginate(event: PageEvent): void {
    this.pageSize.set(event.pageSize);
    this.pageIndex.set(event.pageIndex);
  }

  reload(): void {
    if (this.loading()) return;
    this.today.set(limaDate());
    void this.db.refreshCatalogo();
    this.refresh.emit();
  }

  openDetails(row: AdminReservationRow): void {
    if (this.loading() || this.error() || !this.scopedRows().includes(row)) return;
    this.selected.set(row);
    this.dialogRef = this.dialogs.open(this.detailTemplate(), {
      width: '540px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  async requestAction(kind: 'approve' | 'reject', row: AdminReservationRow): Promise<void> {
    if (this.guardando() || this.loading() || this.error() || row.estado !== 'pendiente' || !this.scopedRows().includes(row)) return;
    this.guardando.set(true);
    try {
      if (kind === 'approve') {
        await this.db.aprobarReserva(row.reserva.id);
        this.notice.emit(`Reserva ${row.codigoPase} aprobada y cupo confirmado.`);
      } else if (kind === 'reject') {
        await this.db.descartarReserva(row.reserva.id);
        this.notice.emit(`Reserva ${row.codigoPase} rechazada.`);
      }
      this.action.emit({ kind, reservationId: row.reserva.id });
      this.dialogRef?.close();
    } catch {
      this.notice.emit('No se pudo actualizar la reserva. Vuelve a intentar.');
    } finally {
      this.guardando.set(false);
    }
  }

  openNewBooking(): void {
    if (!this.presentialOperationsAvailable) return;
    if (this.loading() || !!this.error() || this.venueId() === null || !this.courts().length) return;
    this.bookingCourtId.set(this.courts()[0].id);
    this.bookingDate.set(limaDate());
    this.bookingStartHour.set('18:00');
    this.bookingDuration.set(1);
    this.bookingEsClienteSinCuenta.set(true);
    this.bookingNombreCliente.set('');
    this.bookingTelefonoCliente.set('');
    this.bookingTipoPago.set('total');
    this.bookingMontoAdelantoManual.set(null);
    this.bookingMetodoPago.set('Efectivo');
    this.bookingNumeroOperacion.set('');
    this.guardando.set(false);
    this.dialogRef?.close();
    this.dialogRef = this.dialogs.open(this.bookingTemplate(), {
      width: '640px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  submitBooking(): void {
    if (!this.canSubmitBooking()) return;
    this.guardando.set(true);
    const input: NuevaReservaPresencialInput = {
      canchaId: this.bookingCourtId()!,
      fecha: this.bookingDate(),
      horaInicio: this.bookingStartHour(),
      horaFin: this.bookingEndHour(),
      esClienteSinCuenta: this.bookingEsClienteSinCuenta(),
      nombreCliente: this.bookingNombreCliente().trim(),
      telefonoCliente: this.bookingTelefonoCliente().trim(),
      montoTotal: this.bookingTotal(),
      montoAdelanto: this.effectiveDeposit(),
      saldoPendiente: this.bookingSaldo(),
      metodoPago: this.bookingMetodoPago(),
      numeroOperacion: this.bookingNumeroOperacion().trim() || undefined,
    };
    try {
      this.db.crearReservaPresencial?.(input);
    } catch {
      // ignore
    }
    this.createBooking.emit(input);
    this.guardando.set(false);
    this.dialogRef?.close();
    this.notice.emit(`Reserva presencial para ${input.nombreCliente} registrada exitosamente.`);
  }

  openCollectBalance(row: AdminReservationRow): void {
    if (this.loading() || this.error() || !this.scopedRows().includes(row)) return;
    if (row.saldo <= 0) {
      this.notice.emit('Esta reserva ya no tiene saldo pendiente.');
      return;
    }
    this.selected.set(row);
    this.saldoMetodoPago.set('Efectivo');
    this.saldoOperacion.set('');
    this.dialogRef?.close();
    this.dialogRef = this.dialogs.open(this.balanceTemplate(), {
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  confirmCollectBalance(): void {
    if (!this.presentialOperationsAvailable) return;
    const row = this.selected();
    if (!row || row.saldo <= 0) return;
    try {
      this.db.cobrarSaldoReserva?.(row.reserva.id, row.saldo, this.saldoMetodoPago(), this.saldoOperacion().trim() || undefined);
    } catch {
      // ignore
    }
    this.action.emit({
      kind: 'cobrarSaldo',
      reservationId: row.reserva.id,
      metodoPago: this.saldoMetodoPago(),
      monto: row.saldo,
      numeroOperacion: this.saldoOperacion().trim() || undefined,
    });
    this.dialogRef?.close();
  }

  openVerifiablePass(row: AdminReservationRow): void {
    if (this.loading() || this.error() || !this.scopedRows().includes(row)) return;
    this.selected.set(row);
    this.dialogRef?.close();
    this.dialogRef = this.dialogs.open(this.passTemplate(), {
      width: '520px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  confirmCheckIn(row: AdminReservationRow): void {
    if (!this.presentialOperationsAvailable) return;
    if (this.loading() || this.error() || !this.scopedRows().includes(row)) return;
    if (row.saldo > 0) {
      this.notice.emit(
        `No se puede realizar check-in: tiene un saldo pendiente de S/ ${row.saldo.toFixed(2)}. Debe cobrar el saldo antes de jugar.`,
      );
      return;
    }
    try {
      this.db.registrarCheckIn?.(row.reserva.id);
    } catch {
      // ignore
    }
    this.action.emit({
      kind: 'checkIn',
      reservationId: row.reserva.id,
    });
    this.dialogRef?.close();
  }

  openCancelReservation(row: AdminReservationRow): void {
    if (this.loading() || this.error() || !this.scopedRows().includes(row)) return;
    this.selected.set(row);
    this.cancelMotivo.set('');
    this.cancelDevolucion.set(row.adelanto);
    this.dialogRef?.close();
    this.dialogRef = this.dialogs.open(this.cancelTemplate(), {
      width: '480px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  confirmCancelReservation(): void {
    if (!this.presentialOperationsAvailable) return;
    const row = this.selected();
    if (!row) return;
    const motivo = this.cancelMotivo().trim();
    if (!motivo) {
      this.notice.emit('Debe ingresar un motivo de cancelación.');
      return;
    }
    const monto = Math.max(0, Math.min(row.adelanto, this.cancelDevolucion()));
    this.action.emit({
      kind: 'cancelWithRefund',
      reservationId: row.reserva.id,
      motivo,
      montoDevolucion: monto,
    });
    this.dialogRef?.close();
  }

  openDepositConfig(): void {
    if (this.loading() || !!this.error() || this.venueId() === null) return;
    this.depositPercentDraft.set(this.minimumDepositPercent());
    this.dialogRef?.close();
    this.dialogRef = this.dialogs.open(this.depositConfigTemplate(), {
      width: '440px',
      maxWidth: 'calc(100vw - 32px)',
    });
  }

  saveDepositConfig(): void {
    if (!this.presentialOperationsAvailable) return;
    const percent = Math.max(10, Math.min(90, Math.round(this.depositPercentDraft())));
    const vId = this.venueId();
    if (vId) {
      try {
        this.db.updateSedeAdelantoMinimo?.(vId, percent);
      } catch {
        // ignore
      }
    }
    this.updateDepositPercent.emit(percent);
    this.dialogRef?.close();
  }

  exportCsv(): void {
    if (this.loading() || this.error() || !this.filteredRows().length) return;
    const url = URL.createObjectURL(
      new Blob(['\uFEFF', reservationCsv(this.filteredRows())], { type: 'text/csv;charset=utf-8' }),
    );
    const link = document.createElement('a');
    link.href = url;
    link.download = `reservas-${limaDate()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    this.notice.emit('Reporte CSV generado con el filtro actual.');
  }
}
