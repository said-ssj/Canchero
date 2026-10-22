import { Component, computed, inject, signal, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import { ConfirmationService } from '@shared/components/confirmation/confirmation.service';
import type { Booking, BookingStatus } from '@shared/models/booking.model';

@Component({
  imports: [RouterLink],
  selector: 'app-itinerario',
  styleUrl: './itinerario.css',
  templateUrl: './itinerario.html',
})
export class Itinerario {
  private readonly db = inject(DatabaseService);
  private readonly confirmation = inject(ConfirmationService);
  private confirmingCancellation = false;
  protected readonly auth = inject(AuthService);

  protected readonly isLoggedIn = computed(() => this.auth.isLoggedIn());
  protected readonly currentUser = computed(() => this.auth.currentUser());

  protected readonly tabActiva = signal<'proximas' | 'historial' | 'todas'>('proximas');
  protected readonly isLoading = signal(false);
  protected readonly loadError = signal<string | null>(null);
  protected readonly serverBookings = signal<Booking[]>([]);
  protected readonly isCancelling = signal<string | null>(null);
  protected readonly cancelError = signal<string | null>(null);

  protected readonly qrAbierto = signal(false);
  protected readonly reservaQr = signal<Booking | null>(null);
  protected readonly passTitle = 'Pase Oficial';

  private requestSeq = 0;

  constructor() {
    effect(() => {
      const user = this.currentUser();
      const loggedIn = this.isLoggedIn();
      // Limpiar datos anteriores al cambiar o cerrar cuenta e ignorar respuestas desfasadas
      this.requestSeq++;
      this.serverBookings.set([]);
      this.loadError.set(null);
      this.cancelError.set(null);

      if (loggedIn && user) {
        void this.loadBookings();
      } else {
        this.isLoading.set(false);
      }
    });
  }

  protected async loadBookings(): Promise<void> {
    const seq = ++this.requestSeq;
    this.isLoading.set(true);
    this.loadError.set(null);
    try {
      const list = await this.db.fetchMyBookings();
      if (this.requestSeq !== seq) return;

      const mapped: Booking[] = (list || []).map((b: any) => ({
        id: String(b.id || b.id_reserva),
        id_reserva: Number(b.id || b.id_reserva),
        codigoPase: b.codigoPase || b.codigo_pase || `#CAN-${b.id || 0}`,
        courtName: b.courtName || b.cancha_nombre || 'Cancha',
        courtId: String(b.courtId || b.id_cancha || ''),
        venueName: b.venueName || b.sede_nombre || 'Complejo deportivo',
        venueId: String(b.venueId || b.id_sede || '1'),
        fecha: b.fecha || b.fecha_reserva || '',
        horario: b.horario || `${b.hora_inicio || ''} - ${b.hora_fin || ''}`,
        total: Number(b.total ?? b.monto_total ?? 0),
        status: this.statusFromReserva(b.status || b.estado_nombre || b.estado),
        paymentStatus: b.paymentStatus || b.pago_estado || 'aprobado',
        paidAmount: Number(b.paidAmount ?? b.adelanto ?? b.total ?? 0),
        balanceAmount: Number(b.balanceAmount ?? b.saldo ?? 0),
        paymentMethod: b.paymentMethod || b.metodo_pago_nombre || 'Tarjeta',
        paymentOperationNumber: b.paymentOperationNumber || b.pago_num_op || '',
        jugadores: Array.isArray(b.jugadores) && b.jugadores.length > 0
          ? b.jugadores
          : [this.currentUser()?.nombre || 'Titular'],
      }));

      this.serverBookings.set(mapped);
    } catch (err: any) {
      if (this.requestSeq !== seq) return;
      const msg = err?.error?.message || err?.message || 'No se pudieron cargar tus reservas.';
      this.loadError.set(msg);
    } finally {
      if (this.requestSeq === seq) {
        this.isLoading.set(false);
      }
    }
  }

  protected retry(): void {
    void this.loadBookings();
  }

  protected async cancelarReserva(booking: Booking): Promise<void> {
    if (this.isCancelling() || this.confirmingCancellation) return;
    const userId = this.currentUser()?.id;
    const request = this.requestSeq;
    if (!userId) return;
    this.confirmingCancellation = true;
    let confirmed = false;
    try {
      confirmed = await this.confirmation.confirm({
        title: '¿Cancelar esta reserva?',
        message: `${booking.venueName} · ${booking.courtName} · ${booking.fecha} · ${booking.horario}. La cancelación está sujeta a las condiciones de la reserva; no confirma una devolución automática.`,
        confirmLabel: 'Sí, cancelar reserva',
      });
    } finally { this.confirmingCancellation = false; }
    if (!confirmed || this.currentUser()?.id !== userId || this.requestSeq !== request) return;
    this.isCancelling.set(booking.id);
    this.cancelError.set(null);
    try {
      await this.db.cancelPlayerBooking(booking.id);
      if (this.currentUser()?.id !== userId || this.requestSeq !== request) return;
      this.serverBookings.update((list) =>
        list.map((b) => (b.id === booking.id ? { ...b, status: 'CANCELADO' as BookingStatus } : b)),
      );
      if (this.reservaQr()?.id === booking.id) {
        this.closeQr();
      }
    } catch (err: any) {
      if (this.currentUser()?.id !== userId || this.requestSeq !== request) return;
      const msg = err?.error?.message || 'No se pudo cancelar la reserva.';
      this.cancelError.set(msg);
    } finally {
      this.isCancelling.set(null);
    }
  }

  protected readonly venueImages = computed(() => {
    const map = new Map<string, string>();
    const venues = this.db.getVenuesPublicos();
    for (const v of venues) {
      if (v.fotos.length > 0) {
        map.set(v.id, v.fotos[0]);
      }
    }
    return map;
  });

  protected getVenueImage(venueId: string): string {
    return (
      this.venueImages().get(venueId) ??
      'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=300&auto=format&fit=crop'
    );
  }

  protected readonly todasLasReservas = computed<Booking[]>(() => this.serverBookings());

  private statusFromReserva(estado: string): BookingStatus {
    const norm = (estado || '').toLowerCase();
    if (norm.includes('confirm') || norm.includes('aprob')) {
      return 'CONFIRMADO';
    }
    if (norm.includes('cancel')) {
      return 'CANCELADO';
    }
    if (norm.includes('complet') || norm.includes('final') || norm.includes('jug')) {
      return 'FINALIZADO';
    }
    if (norm.includes('juego')) {
      return 'EN_JUEGO';
    }
    return 'PENDIENTE';
  }

  protected readonly proximasReservas = computed(() =>
    this.todasLasReservas().filter(
      (b) =>
        b.status !== 'FINALIZADO' &&
        b.status !== 'CANCELADO' &&
        b.fecha >= this.todayDateStr(),
    ),
  );

  protected readonly historialReservas = computed(() =>
    this.todasLasReservas().filter(
      (b) =>
        b.status === 'FINALIZADO' ||
        b.status === 'CANCELADO' ||
        b.fecha < this.todayDateStr(),
    ),
  );

  protected readonly reservasVisibles = computed(() => {
    const tab = this.tabActiva();
    if (tab === 'proximas') return this.proximasReservas();
    if (tab === 'historial') return this.historialReservas();
    return this.todasLasReservas();
  });

  protected readonly countProximas = computed(() => this.proximasReservas().length);
  protected readonly countHistorial = computed(() => this.historialReservas().length);
  protected readonly countTodas = computed(() => this.todasLasReservas().length);

  protected readonly hoyMatch = computed(() =>
    this.proximasReservas().find((b) => b.fecha === this.todayDateStr()),
  );

  protected readonly paseActivo = computed<Booking | undefined>(() => {
    return (
      this.hoyMatch() ??
      this.proximasReservas()[0] ??
      this.todasLasReservas().find((b) => b.status === 'CONFIRMADO')
    );
  });

  protected todayDateStr(): string {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }

  protected setTab(tab: 'proximas' | 'historial' | 'todas'): void {
    this.tabActiva.set(tab);
  }

  protected openQr(booking: Booking): void {
    this.reservaQr.set(booking);
    this.qrAbierto.set(true);
  }

  protected closeQr(): void {
    this.qrAbierto.set(false);
    this.reservaQr.set(null);
  }

  protected onBackdropClick(e: Event): void {
    if (e.target === e.currentTarget) this.closeQr();
  }

  protected statusCls(status: string): string {
    switch (status) {
      case 'CONFIRMADO':
      case 'EN_JUEGO':
        return 'confirmed';
      case 'FINALIZADO':
        return 'finished';
      case 'CANCELADO':
        return 'cancelled';
      case 'EN_REVISION':
      case 'PENDIENTE':
        return 'reviewing';
      default:
        return 'pending';
    }
  }

  protected statusLabel(status: string): string {
    switch (status) {
      case 'CONFIRMADO':
        return 'Confirmado';
      case 'EN_JUEGO':
        return 'En Juego';
      case 'FINALIZADO':
        return 'Finalizado';
      case 'CANCELADO':
        return 'Cancelado';
      case 'EN_REVISION':
        return 'En Revisión';
      case 'PENDIENTE':
        return 'Pendiente';
      default:
        return status;
    }
  }

  protected statusIcon(status: string): string {
    switch (status) {
      case 'CONFIRMADO':
        return 'verified';
      case 'EN_JUEGO':
        return 'sports_soccer';
      case 'FINALIZADO':
        return 'task_alt';
      case 'CANCELADO':
        return 'close';
      case 'EN_REVISION':
      case 'PENDIENTE':
        return 'schedule';
      default:
        return 'info';
    }
  }

  protected fmtAmount(n: number): string {
    return `S/. ${n.toFixed(2)}`;
  }

  protected cabeceraInicial(nombre: string): string {
    const part = (nombre || '').trim().split(/\s+/)[0] ?? '';
    return part.charAt(0).toUpperCase() || 'J';
  }

  protected fmtTotal(booking: Booking): string {
    return `S/. ${(booking.total || 0).toFixed(2)}`;
  }

  protected fmtPaid(booking: Booking): string {
    return `S/. ${(booking.paidAmount ?? booking.total ?? 0).toFixed(2)}`;
  }

  protected fmtBalance(booking: Booking): string {
    return `S/. ${(booking.balanceAmount ?? 0).toFixed(2)}`;
  }

  protected fechaDisplay(fecha: string): string {
    if (!fecha) return '';
    const d = new Date(`${fecha}T00:00:00`);
    if (isNaN(d.getTime())) return fecha;
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  }

  protected fechaMes(fecha: string): string {
    if (!fecha) return 'MES';
    const d = new Date(`${fecha}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    const meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    return meses[d.getMonth()] ?? 'MES';
  }

  protected fechaDia(fecha: string): string {
    if (!fecha) return '--';
    const d = new Date(`${fecha}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    return String(d.getDate()).padStart(2, '0');
  }

  protected fechaAnio(fecha: string): string {
    if (!fecha) return '----';
    const d = new Date(`${fecha}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    return String(d.getFullYear());
  }

  protected compartirWhatsApp(booking: Booking): void {
    const msg = encodeURIComponent(
      `Hola equipo. Te comparto mi pichanga:\n\n` +
        `${booking.venueName}\n` +
        `${booking.courtName}\n` +
        `${this.fechaDisplay(booking.fecha)} - ${booking.horario}\n` +
        `Total: ${this.fmtTotal(booking)}\n` +
        `Pase: ${booking.codigoPase}\n` +
        `Únete en Canchero.pe`,
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  protected copiarCodigoPase(booking: Booking): void {
    void navigator.clipboard?.writeText(booking.codigoPase);
  }
}
