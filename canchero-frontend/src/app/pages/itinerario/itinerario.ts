import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import { AuthService } from '../../services/auth.service';
import type { Booking, BookingStatus } from '../../models/booking.model';

@Component({
  imports: [RouterLink],
  selector: 'app-itinerario',
  styleUrl: './itinerario.css',
  templateUrl: './itinerario.html',
})
export class Itinerario {
  private readonly db = inject(DatabaseService);
  protected readonly auth = inject(AuthService);

  protected readonly isLoggedIn = computed(() => this.auth.isLoggedIn());
  protected readonly currentUser = computed(() => this.auth.currentUser());

  protected readonly tabActiva = signal<'proximas' | 'historial' | 'todas'>('proximas');

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
    return this.venueImages().get(venueId) ?? 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=300&auto=format&fit=crop';
  }

  protected readonly todasLasReservas = computed<Booking[]>(() => {
    if (!this.isLoggedIn()) {
      return [];
    }
    const user = this.currentUser();
    const email = user?.email ?? 'jugador@canchero.pe';
    const jugador = this.db.usuarios().find((u) => u.email.toLowerCase() === email.toLowerCase())
      ?? this.db.usuarios().find((u) => u.rol === 'cliente');
    if (!jugador) {
      return [];
    }
    const canchas = this.db.canchas();
    const sedes = this.db.sedes();
    const pagos = this.db.pagos();
    return this.db
      .getReservasPorJugador(jugador.id)
      .map((r) => {
        const cancha = canchas.find((c) => c.id === r.cancha_id);
        const sede = sedes.find((s) => s.id === cancha?.sede_id);
        const pago = pagos.find((p) => p.reserva_id === r.id);
        return {
          id: String(r.id),
          codigoPase: r.codigo_pase ?? `#CAN-${1000 + r.id}`,
          courtName: cancha?.nombre ?? 'Cancha',
          venueName: sede?.nombre ?? 'Complejo deportivo',
          venueId: String(sede?.id ?? 1),
          fecha: r.fecha,
          horario: `${r.hora_inicio} - ${r.hora_fin}`,
          total: pago?.monto ?? cancha?.precio_hora ?? 0,
          status: this.statusFromReserva(r.estado),
          jugadores: [jugador.nombre],
        };
      });
  });

  private statusFromReserva(estado: string): BookingStatus {
    switch (estado) {
      case 'confirmada':
        return 'CONFIRMADO';
      case 'completada':
        return 'FINALIZADO';
      case 'cancelada':
        return 'CANCELADO';
      case 'pendiente':
      default:
        return 'PENDIENTE';
    }
  }

  protected readonly proximasReservas = computed(() =>
    this.todasLasReservas().filter(
      (b) => b.status !== 'FINALIZADO' && b.status !== 'CANCELADO',
    ),
  );

  protected readonly historialReservas = computed(() =>
    this.todasLasReservas().filter(
      (b) => b.status === 'FINALIZADO' || b.status === 'CANCELADO',
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

  protected readonly qrAbierto = signal(false);
  protected readonly reservaQr = signal<Booking | null>(null);

  protected readonly passTitle = 'Pase Oficial';

  protected readonly paseActivo = computed<Booking | undefined>(() => {
    return (
      this.hoyMatch() ??
      this.proximasReservas()[0] ??
      this.todasLasReservas()[0]
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
    const part = nombre.trim().split(/\s+/)[0] ?? '';
    return part.charAt(0).toUpperCase() || 'J';
  }

  protected cuotaJugadores(booking: Booking): string {
    const n = booking.jugadores?.length ?? 1;
    return `Cuota S/. ${(booking.total / n).toFixed(2)} c/u`;
  }

  protected progressoSquad(booking: Booking): number {
    const n = booking.jugadores?.length ?? 1;
    return Math.min(100, Math.round((n / 8) * 100));
  }

  protected fmtTotal(booking: Booking): string {
    return `S/. ${booking.total.toFixed(2)}`;
  }

  protected fmtMontoRecaudado(booking: Booking): string {
    const n = booking.jugadores?.length ?? 0;
    const monto = n > 0 ? booking.total : Math.round(booking.total * 0.6);
    return `S/. ${monto.toFixed(2)}`;
  }

  protected fechaDisplay(fecha: string): string {
    const d = new Date(`${fecha}T00:00:00`);
    const dias = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return `${dias[d.getDay()]} ${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`;
  }

  protected compartirWhatsApp(booking: Booking): void {
    const msg = encodeURIComponent(
      `¡Hola equipo! Te comparto mi pichanga:\n\n` +
        `🏟️ ${booking.venueName}\n` +
        `⚽ ${booking.courtName}\n` +
        `📅 ${this.fechaDisplay(booking.fecha)} • ${booking.horario}\n` +
        `💵 Cuota: ${this.cuotaJugadores(booking)}\n` +
        `📲 Únete en Canchero.MVP`,
    );
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  }

  protected copiarCodigoPase(booking: Booking): void {
    void navigator.clipboard?.writeText(booking.codigoPase);
  }

  protected climaTitulo(): string {
    const hour = new Date().getHours();
    if (hour < 12) return 'Mañana fresca para jugar';
    if (hour < 18) return 'Tarde agradable para jugar';
    return 'Noche perfecta para pichanga';
  }

  protected climaDetalle(): string {
    const temp = 20 + Math.floor(Math.random() * 5);
    const wind = 5 + Math.floor(Math.random() * 10);
    const humidity = 55 + Math.floor(Math.random() * 15);
    return `${temp}° · Viento ${wind} km/h · Humedad ${humidity}%`;
  }
}
