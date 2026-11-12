import { MercadoPagoApi, PaymentState } from '../../../core/payments/mercadopago-api';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { VenueWeather } from '@shared/components/venue-weather/venue-weather';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import type { Venue, Court } from '@shared/models/venue.model';
import type {
  CourtSlotAvailability,
  SlotState,
  BookingBlock,
  BookingTranche,
} from '@shared/models/availability.model';
import {
  getLimaDate,
  buildBookingBlock,
  buildBookingBlocks,
  getCourtOperatingHours,
} from '@core/utils/availability.utils';

export interface WeekDay {
  dateStr: string;
  year: number;
  dayName: string;
  dayNum: number;
  monthName: string;
  isToday: boolean;
  isPast: boolean;
  displayShort: string;
  displayFull: string;
}

export interface Slot {
  id: string;
  dateStr: string;
  dayDisplay: string;
  time: string;
  hour: number;
  price: number;
}

interface Player {
  id: string;
  name: string;
  role: string;
  phone: string;
  registrado: boolean;
  isCaptain: boolean;
  paid: boolean;
}

interface Complejo {
  id: string;
  name: string;
  price: number;
  address: string;
  img: string;
  courts: Court[];
  phone?: string;
}

@Component({
  imports: [
    FormsModule,
    RouterLink,
    VenueWeather,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
  ],
  selector: 'app-checkout',
  styleUrl: './checkout.css',
  templateUrl: './checkout.html',
})
export class Checkout {
  private readonly db = inject(DatabaseService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly mp = inject(MercadoPagoApi);
  private readonly router = inject(Router);
  protected readonly resumedPayment = signal<PaymentState | null>(null);
  protected readonly restoringPayment = signal(false);
  protected readonly resumeError = signal('');
  protected readonly paymentReady = signal(false);
  protected readonly paymentConfigChecked = signal(false);
  protected readonly accessSlots = signal(1);
  private readonly paymentInit = this.mp
    .capabilities()
    .then((x) => this.paymentReady.set(x.available))
    .catch(() => this.paymentReady.set(false))
    .finally(() => this.paymentConfigChecked.set(true));

  protected readonly fallbackCourtImg =
    'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=300&auto=format&fit=crop';

  protected onImgError(event: Event): void {
    const img = event.target as HTMLImageElement;
    if (img && img.src !== this.fallbackCourtImg) {
      img.src = this.fallbackCourtImg;
    }
  }

  protected readonly complejos = computed<Complejo[]>(() => {
    const venues = this.db.getVenuesPublicos();
    return venues.map((v) => ({
      id: v.id,
      name: v.nombre,
      price: v.precioBase,
      address: v.direccion,
      img:
        v.fotos[0] ??
        'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=300&auto=format&fit=crop',
      courts: v.canchas,
      phone: v.telefono,
    }));
  });

  protected readonly filterOptions: { key: 'all' | 'afternoon' | 'prime'; label: string }[] = [
    { key: 'all', label: 'Todos los turnos (08:00 - 00:00)' },
    { key: 'afternoon', label: 'Tarde y Noche (15:00 - 00:00)' },
    { key: 'prime', label: 'Noche Prime (18:00 - 00:00)' },
  ];

  protected readonly queryCourtId = signal<string | null>(
    this.route.snapshot.queryParamMap.get('courtId'),
  );

  protected readonly isLoadingCatalog = computed(() => this.db.catalogLoading());

  protected readonly resolvedData = computed<{ court: Court; venue: Venue } | null>(() => {
    const id = this.queryCourtId();
    if (!id) return null;
    return this.db.getCourtPublica(id) ?? null;
  });

  protected readonly resolvedCourt = computed<Court | null>(
    () => this.resolvedData()?.court ?? null,
  );
  protected readonly resolvedVenue = computed<Venue | null>(
    () => this.resolvedData()?.venue ?? null,
  );

  protected readonly contextError = computed<string | null>(() => {
    if (this.isLoadingCatalog()) return null;
    const id = this.queryCourtId();
    if (!id) {
      return 'No se ha seleccionado ninguna cancha. Debes elegir una cancha concreta desde el catálogo de sedes.';
    }
    if (!this.resolvedData()) {
      return `La cancha solicitada (ID: ${id}) no existe o no se encuentra activa en el sistema.`;
    }
    return null;
  });

  protected readonly isLoggedIn = computed(() => this.auth.isLoggedIn());
  protected readonly currentUser = computed(() => this.auth.currentUser());
  protected readonly captainName = computed(() => {
    const profile = this.auth.playerProfile();
    return (
      [profile?.nombre, profile?.apellido].filter(Boolean).join(' ') ||
      this.currentUser()?.nombre ||
      ''
    );
  });
  protected readonly returnUrl = computed(() => {
    const id = this.queryCourtId();
    return id ? `/checkout?courtId=${id}` : '/sedes';
  });

  protected readonly weekOffset = signal(0);
  protected readonly timeFilter = signal<'all' | 'afternoon' | 'prime'>('all');
  protected readonly selectedSlots = signal<Slot[]>([]);
  protected readonly activePaso = signal<1 | 2 | 3>(1);
  protected readonly reservationSection = signal<2 | 3 | 4>(2);
  protected readonly visibleStep = computed(() => {
    const step = this.activePaso();
    return step === 2 ? this.reservationSection() : step === 1 ? 1 : null;
  });
  protected readonly sectionLabels = [
    'Horarios',
    'Datos del partido',
    'Convocados al partido',
    'Revisar y pagar',
  ];

  protected readonly isLoadingAvailability = signal(false);
  protected readonly availabilityError = signal<string | null>(null);
  protected readonly effectiveAvailabilityError = computed<string | null>(() => {
    const manualErr = this.availabilityError();
    if (manualErr) return manualErr;
    const loadErrs = (this.db as any).loadErrors?.();
    if (Array.isArray(loadErrs)) {
      if (
        loadErrs.includes('availability') ||
        loadErrs.includes('reserva') ||
        loadErrs.includes('bloqueo_mantenimiento') ||
        loadErrs.includes('tipo_horario') ||
        loadErrs.includes('catalogo')
      ) {
        return 'No se pudo comprobar la disponibilidad actual de la cancha.';
      }
    } else if (loadErrs && typeof loadErrs === 'object') {
      const msg =
        loadErrs['availability'] ||
        loadErrs['reserva'] ||
        loadErrs['bloqueo_mantenimiento'] ||
        loadErrs['tipo_horario'] ||
        loadErrs['catalogo'];
      if (msg) return String(msg);
    }
    return null;
  });
  protected readonly requestSeq = signal(0);
  private quoteSeq = 0;
  protected readonly serverQuote = signal<BookingBlock | null>(null);
  private lastSessionUserId: string | null | undefined = undefined;

  protected readonly players = signal<Player[]>([
    {
      id: 'capitan',
      name: 'Tú (Titular)',
      role: 'Tú',
      phone: '',
      registrado: true,
      isCaptain: true,
      paid: true,
    },
  ]);

  protected readonly newPlayerName = signal('');
  protected readonly newPlayerPhone = signal('');
  protected readonly newPlayerTipo = signal<'Registrado' | 'Invitado'>('Invitado');

  protected readonly confirmError = signal('');
  protected readonly submitting = signal(false);
  protected readonly showSuccess = signal(false);
  protected readonly reservaCode = signal('');
  protected readonly reservaTimeText = signal('');

  protected readonly nightStartHour = computed<number>(() => {
    const court = this.resolvedCourt();
    if (!court?.horaInicioNoche) return 18;
    const parts = court.horaInicioNoche.split(':');
    return parseInt(parts[0], 10) || 18;
  });

  protected readonly pad2 = (n: number): string => String(n).padStart(2, '0');

  constructor() {
    this.route.queryParamMap.subscribe((params) => {
      const cId = params.get('courtId');
      const changed = cId !== this.queryCourtId();
      if (changed) {
        this.selectedSlots.set([]);
        this.serverQuote.set(null);
        this.availabilityError.set(null);
      }
      this.queryCourtId.set(cId);
      const resume = params.get('resume');
      if (resume) void this.restorePayment(resume);
      if (cId) {
        void this.loadWeekAvailability(cId, this.weekOffset());
      }
    });

    effect(() => {
      const user = this.currentUser();
      const userId = user?.id ?? null;
      if (this.lastSessionUserId !== undefined && this.lastSessionUserId !== userId) {
        if (this.resumedPayment()) {
          this.resumedPayment.set(null);
          this.selectedSlots.set([]);
        }
        this.confirmError.set('');
        this.showSuccess.set(false);
      }
      this.lastSessionUserId = userId;
      const captainName = this.captainName() || 'Tú (Titular)';
      this.players.update((list) =>
        list.map((p) => (p.isCaptain ? { ...p, name: captainName } : p)),
      );
    });
  }

  private async restorePayment(id: string): Promise<void> {
    this.restoringPayment.set(true);
    this.resumeError.set('');
    try {
      await this.auth.ready;
      const ownerId = this.currentUser()?.id;
      if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Operación inválida.');
      const held = await this.mp.state(id);
      if (ownerId !== this.currentUser()?.id) return;
      if (!held.canResume || held.estado !== 'pendiente') {
        await this.router.navigate(['/pago/resultado'], {
          queryParams: { checkout: id },
          replaceUrl: true,
        });
        return;
      }
      this.queryCourtId.set(held.courtId);
      this.resumedPayment.set(held);
      this.accessSlots.set(held.cupos);
      const date = new Date(held.fecha + 'T12:00:00');
      const today = new Date(getLimaDate() + 'T12:00:00');
      this.weekOffset.set(
        Math.max(
          0,
          Math.round(
            (this.getMondayOfWeek(date).getTime() - this.getMondayOfWeek(today).getTime()) /
              604800000,
          ),
        ),
      );
      const label = new Intl.DateTimeFormat('es-PE', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }).format(date);
      const court = this.resolvedCourt();
      this.selectedSlots.set(
        (held.bloques ?? [held]).flatMap((b) =>
          b.hours.map((hour) => ({
            id: `${b.fecha}_${hour}`,
            dateStr: b.fecha,
            dayDisplay: new Intl.DateTimeFormat('es-PE', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            }).format(new Date(b.fecha + 'T12:00:00')),
            hour,
            time: `${this.pad2(hour)}:00 - ${this.pad2(hour + 1)}:00`,
            price: court
              ? this.db.getCourtSlotAvailability(court, b.fecha, hour).price
              : b.monto / b.hours.length,
          })),
        ),
      );
      this.serverQuote.set(null);
      this.activePaso.set(2);
      this.reservationSection.set(3);
      void this.loadWeekAvailability(held.courtId, this.weekOffset());
      try {
        const draft = JSON.parse(sessionStorage.getItem(`mp-convocados:${id}`) || 'null');
        if (draft?.userId === this.currentUser()?.id && Array.isArray(draft.players))
          this.players.update((current) => [
            ...current.filter((p) => p.isCaptain),
            ...draft.players
              .filter((p: Player) => !p.isCaptain && typeof p.name === 'string')
              .slice(0, 99),
          ]);
      } catch {
        /* Solo borrador de convocados; la reserva siempre procede de la API. */
      }
      this.scrollToCheckout();
    } catch {
      const message =
        'No se pudo recuperar tu reserva. Inicia sesión con la misma cuenta y reintenta.';
      this.confirmError.set(message);
      this.resumeError.set(message);
    } finally {
      this.restoringPayment.set(false);
    }
  }

  private matchesHeldSelection(): boolean {
    const held = this.resumedPayment();
    const slots = this.selectedSlots();
    return (
      !!held &&
      held.courtId === this.queryCourtId() &&
      held.cupos === this.accessSlots() &&
      new Date(held.expiresAt).getTime() > Date.now() &&
      slots.length === (held.bloques ?? [held]).reduce((n, b) => n + b.hours.length, 0) &&
      slots.every((slot) =>
        (held.bloques ?? [held]).some(
          (b) => b.fecha === slot.dateStr && b.hours.includes(slot.hour),
        ),
      )
    );
  }

  protected readonly selectedComplejo = computed<Complejo>(() => {
    const v = this.resolvedVenue();
    if (!v) {
      return {
        id: '',
        name: '',
        price: 0,
        address: '',
        img: 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=300&auto=format&fit=crop',
        courts: [],
      };
    }
    return {
      id: v.id,
      name: v.nombre,
      price: v.precioBase,
      address: v.direccion,
      img:
        v.fotos[0] ??
        'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=300&auto=format&fit=crop',
      courts: v.canchas,
      phone: v.telefono,
    };
  });

  protected readonly selectedTipoCancha = computed<string>(() => {
    const c = this.resolvedCourt();
    return c ? `${c.nombre} (${c.tipo})` : '';
  });

  protected readonly currentWeekDays = computed(() => this.getDaysForWeek(this.weekOffset()));

  protected readonly filteredHours = computed(() => {
    const all = getCourtOperatingHours(this.resolvedCourt(), this.db.horarios?.() ?? []);
    if (this.timeFilter() === 'afternoon') return all.filter((h) => h >= 15);
    if (this.timeFilter() === 'prime') return all.filter((h) => h >= 18);
    return all;
  });

  protected readonly basePrice = computed<number>(() => {
    const c = this.resolvedCourt();
    return c ? c.precioHora : 0;
  });

  protected readonly bookingBlocks = computed(() =>
    buildBookingBlocks(this.selectedSlots(), this.nightStartHour()),
  );
  protected readonly bookingBlock = computed<BookingBlock>(() => {
    const blocks = this.bookingBlocks();
    const localBlock: BookingBlock =
      blocks.length <= 1
        ? (blocks[0] ?? buildBookingBlock([]))
        : {
            isValid: blocks.every((b) => b.isValid),
            dateStr: blocks[0].dateStr,
            timeStart: blocks[0].timeStart,
            durationHours: blocks.reduce((n, b) => n + b.durationHours, 0),
            tranches: blocks.flatMap((b) => b.tranches),
            subtotal: blocks.reduce((n, b) => n + b.subtotal, 0),
            fullLabel: blocks.map((b) => b.fullLabel).join(' · '),
            displayRange: blocks.map((b) => `${b.dayDisplay}: ${b.displayRange}`).join(' · '),
          };
    if (localBlock.isValid && this.matchesHeldSelection())
      return {
        ...localBlock,
        subtotal: this.resumedPayment()!.totalOperacion ?? this.resumedPayment()!.monto,
      };
    const srv = this.serverQuote();
    if (
      localBlock.isValid &&
      srv &&
      srv.isValid &&
      srv.dateStr === localBlock.dateStr &&
      srv.durationHours === localBlock.durationHours &&
      srv.timeStart === localBlock.timeStart &&
      srv.timeEnd === localBlock.timeEnd
    ) {
      return {
        ...localBlock,
        tranches:
          srv.tranches.length === localBlock.tranches.length ? srv.tranches : localBlock.tranches,
        subtotal: srv.subtotal,
      };
    }
    return localBlock;
  });

  protected readonly canProceedToPaso2 = computed<boolean>(() => {
    if (this.isLoadingCatalog() || this.isLoadingAvailability()) return false;
    if (this.effectiveAvailabilityError()) return false;
    if (this.selectedSlots().length === 0) return false;
    return this.bookingBlock().isValid;
  });

  protected readonly selectionValidationMessage = computed<string | null>(() => {
    if (this.selectedSlots().length === 0) return null;
    const block = this.bookingBlock();
    if (!block.isValid) return block.errorMessage || 'Selección de turnos no permitida.';
    return null;
  });

  protected readonly subtotal = computed(() => {
    const block = this.bookingBlock();
    if (block.isValid) return block.subtotal;
    return this.selectedSlots().reduce((acc, s) => acc + s.price, 0);
  });

  protected readonly total = computed(() => this.subtotal());

  protected readonly cuotaPerPlayer = computed(() => {
    const count = this.players().length || 1;
    return this.total() / count;
  });

  protected readonly totalToPayNow = computed(() => this.total());

  protected readonly paidCount = computed(
    () => this.players().filter((p) => p.paid || p.isCaptain).length,
  );

  protected readonly recaudado = computed(() => this.paidCount() * this.cuotaPerPlayer());

  protected readonly recaudacionPercent = computed(() => {
    const total = this.total();
    if (total <= 0) return 0;
    return Math.min(100, Math.round((this.recaudado() / total) * 100));
  });

  protected readonly horasLabel = computed(() => {
    const block = this.bookingBlock();
    if (block.isValid && this.bookingBlocks().length === 1) {
      return `${block.durationHours} ${block.durationHours === 1 ? 'hora' : 'horas continuas'}`;
    }
    const n = this.selectedSlots().length;
    return `${n} ${n === 1 ? 'hora' : 'horas'}`;
  });

  protected readonly selectionCountText = computed(() => {
    const n = this.selectedSlots().length;
    return n === 0
      ? '0 turnos seleccionados'
      : `${n} ${n === 1 ? 'turno seleccionado' : 'turnos seleccionados'}`;
  });

  protected readonly summaryDateText = computed(() => {
    const block = this.bookingBlock();
    if (block.isValid && block.dayDisplay) {
      return block.dayDisplay;
    }
    const dates = [...new Set(this.selectedSlots().map((s) => s.dayDisplay))];
    return dates.length ? dates.join(', ') : 'Sin horarios elegidos';
  });

  protected readonly horarioText = computed(() => {
    const block = this.bookingBlock();
    if (block.isValid && block.fullLabel) {
      return block.fullLabel;
    }
    return this.selectedSlots()
      .map((s) => `${s.dayDisplay}: ${s.time}`)
      .join(', ');
  });

  protected readonly contextTimeText = computed(() => {
    const block = this.bookingBlock();
    if (block.isValid && block.displayRange) {
      return block.displayRange;
    }
    return this.selectedSlots()[0]?.time ?? '--:-- - --:--';
  });

  protected readonly weekLabelText = computed(() => {
    const days = this.currentWeekDays();
    const first = days[0];
    const last = days[6];
    if (first.monthName === last.monthName) {
      return `Semana: ${first.dayNum} al ${last.dayNum} de ${first.monthName} ${first.year}`;
    }
    return `Semana: ${first.dayNum} ${first.monthName} — ${last.dayNum} ${last.monthName} ${last.year}`;
  });

  protected readonly weekBadgeText = computed(() => {
    const off = this.weekOffset();
    if (off === 0) return 'Esta semana';
    if (off === 1) return 'Próxima semana (+1)';
    return `En +${off} semanas`;
  });

  protected readonly weekBadgeBg = computed(() => {
    const off = this.weekOffset();
    if (off === 0) return 'var(--color-brand-green-light)';
    if (off === 1) return '#e0f2fe';
    return '#fef3c7';
  });

  protected readonly weekBadgeColor = computed(() => {
    const off = this.weekOffset();
    if (off === 0) return 'var(--color-brand-green-dark)';
    if (off === 1) return '#0369a1';
    return '#b45309';
  });

  protected readonly convocadosText = computed(() => `${this.players().length} Convocados activos`);

  protected fmt(n: number): string {
    return `S/ ${n.toFixed(2)}`;
  }

  protected cuotaLabel(): string {
    const n = this.players().length;
    return `Cuota por persona (${n} jugador${n > 1 ? 'es' : ''})`;
  }

  protected goToPaso(paso: 1 | 2 | 3): void {
    if (paso === 2 || paso === 3) {
      this.reprice();
      if (this.selectedSlots().length === 0) {
        this.confirmError.set(
          'Por favor, selecciona al menos un turno en el calendario de la semana.',
        );
        return;
      }
      const block = this.bookingBlock();
      if (!block.isValid) {
        this.confirmError.set(
          block.errorMessage || 'Los turnos seleccionados no forman un bloque continuo válido.',
        );
        return;
      }
      void this.syncServerQuote();
    }
    this.confirmError.set('');
    if (paso === 2) this.reservationSection.set(2);
    this.activePaso.set(paso);
    this.scrollToCheckout();
  }

  protected showReservationSection(section: 2 | 3 | 4): void {
    if (this.submitting()) return;
    this.confirmError.set('');
    this.reservationSection.set(section);
    this.scrollToCheckout();
  }

  private scrollToCheckout(): void {
    if (typeof window !== 'undefined' && window.scrollY > 0)
      window.scrollTo({ top: 0, behavior: 'instant' });
  }

  private getMondayOfWeek(dateInput: Date, offsetWeeks = 0): Date {
    const d = new Date(dateInput);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    if (offsetWeeks !== 0) monday.setDate(monday.getDate() + offsetWeeks * 7);
    return monday;
  }

  private getDaysForWeek(weekOffset: number): WeekDay[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = this.getMondayOfWeek(today, weekOffset);
    const dayNames = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const monthNames = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];
    const todayStr = getLimaDate();
    const days: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      const year = cur.getFullYear();
      const month = String(cur.getMonth() + 1).padStart(2, '0');
      const day = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const isPast = dateStr < todayStr;
      const isToday = dateStr === todayStr;
      days.push({
        dateStr,
        year,
        dayName: dayNames[i],
        dayNum: cur.getDate(),
        monthName: monthNames[cur.getMonth()],
        isToday,
        isPast,
        displayShort: `${dayNames[i]} ${cur.getDate()} ${monthNames[cur.getMonth()]}`,
        displayFull: `${dayNames[i]} ${cur.getDate()} de ${monthNames[cur.getMonth()]}`,
      });
    }
    return days;
  }

  protected getSlot(day: WeekDay, hour: number): CourtSlotAvailability {
    const court = this.resolvedCourt();
    if (!court) {
      return {
        id: `${day.dateStr}_${hour}`,
        dateStr: day.dateStr,
        hour,
        time: `${this.pad2(hour)}:00 - ${hour === 23 ? '00:00' : this.pad2(hour + 1) + ':00'}`,
        state: 'closed',
        price: 0,
        isNight: false,
        reason: 'Cancha no resuelta',
      };
    }
    return this.db.getCourtSlotAvailability(court, day.dateStr, hour);
  }

  protected slotStatus(day: WeekDay, hour: number): SlotState {
    if (this.effectiveAvailabilityError() || this.isLoadingAvailability()) return 'closed';
    return this.getSlot(day, hour).state;
  }

  protected slotPriceAt(day: WeekDay, hour: number): number {
    return this.getSlot(day, hour).price;
  }

  protected isNightHour(hour: number): boolean {
    return hour >= this.nightStartHour();
  }

  protected isSlotSelected(day: WeekDay, hour: number): boolean {
    return this.selectedSlots().some((s) => s.id === `${day.dateStr}_${hour}`);
  }

  protected toggleSlot(day: WeekDay, hour: number): void {
    if (this.slotStatus(day, hour) !== 'available') return;
    const id = `${day.dateStr}_${hour}`;
    const exists = this.selectedSlots().some((s) => s.id === id);
    if (exists) {
      this.selectedSlots.update((slots) => slots.filter((s) => s.id !== id));
    } else {
      const slotPrice = this.slotPriceAt(day, hour);
      const slot: Slot = {
        id,
        dateStr: day.dateStr,
        dayDisplay: day.displayShort,
        time: `${this.pad2(hour)}:00 - ${hour === 23 ? '00:00' : this.pad2(hour + 1) + ':00'}`,
        hour,
        price: slotPrice,
      };
      this.selectedSlots.update((slots) => [...slots, slot]);
    }
    this.confirmError.set('');
    void this.syncServerQuote();
  }

  protected removeSlot(id: string): void {
    this.selectedSlots.update((slots) => slots.filter((s) => s.id !== id));
    this.confirmError.set('');
    void this.syncServerQuote();
  }

  protected removeSlotByHour(hour: number, dateStr?: string): void {
    this.selectedSlots.update((slots) =>
      slots.filter((s) => !(s.hour === hour && (!dateStr || s.dateStr === dateStr))),
    );
    this.confirmError.set('');
    void this.syncServerQuote();
  }

  protected clearSlots(): void {
    this.selectedSlots.set([]);
    this.serverQuote.set(null);
  }

  protected prevWeek(): void {
    if (this.weekOffset() > 0) {
      this.setWeekOffset(this.weekOffset() - 1);
    }
  }

  protected nextWeek(): void {
    this.setWeekOffset(this.weekOffset() + 1);
  }

  protected todayWeek(): void {
    this.setWeekOffset(0);
  }

  private setWeekOffset(offset: number): void {
    this.weekOffset.set(offset);
    void this.loadWeekAvailability(this.queryCourtId(), offset);
  }

  protected retryAvailability(): void {
    this.availabilityError.set(null);
    void this.db.refreshCatalogo();
    void this.loadWeekAvailability(this.queryCourtId(), this.weekOffset());
  }

  protected setTimeFilter(f: 'all' | 'afternoon' | 'prime'): void {
    this.timeFilter.set(f);
  }

  protected onComplejoChange(_id: string): void {}

  protected onTipoChange(_tipo: string): void {}

  private async loadWeekAvailability(courtId: string | null, offset: number): Promise<void> {
    const seq = this.requestSeq() + 1;
    this.requestSeq.set(seq);
    if (!courtId || typeof this.db.fetchCourtAvailability !== 'function') {
      return;
    }
    const days = this.getDaysForWeek(offset);
    if (!days.length) return;
    const from = days[0].dateStr;
    const to = days[days.length - 1].dateStr;

    this.isLoadingAvailability.set(true);
    this.availabilityError.set(null);
    try {
      const result = await this.db.fetchCourtAvailability(courtId, from, to);
      // Ignorar respuestas obsoletas si cambió la cancha o la semana mientras cargaba
      if (
        this.requestSeq() !== seq ||
        this.queryCourtId() !== courtId ||
        this.weekOffset() !== offset
      ) {
        return;
      }
      const loadErrs = (this.db as any).loadErrors?.();
      const availErr =
        Array.isArray(loadErrs) && loadErrs.includes('availability')
          ? 'No se pudo comprobar la disponibilidad actual de la cancha.'
          : loadErrs && typeof loadErrs === 'object'
            ? loadErrs['availability']
            : null;
      if (result === null && availErr) {
        this.availabilityError.set(String(availErr));
      } else {
        this.reprice();
        void this.syncServerQuote();
      }
    } catch {
      if (
        this.requestSeq() === seq &&
        this.queryCourtId() === courtId &&
        this.weekOffset() === offset
      ) {
        this.availabilityError.set(
          'No se pudo verificar la disponibilidad en tiempo real. Intenta nuevamente.',
        );
      }
    } finally {
      if (this.requestSeq() === seq) {
        this.isLoadingAvailability.set(false);
      }
    }
  }

  private async syncServerQuote(): Promise<void> {
    const seq = ++this.quoteSeq;
    if (this.matchesHeldSelection()) {
      this.serverQuote.set(null);
      return;
    }
    const court = this.resolvedCourt();
    const blocks = this.bookingBlocks();
    if (
      !court ||
      !blocks.length ||
      blocks.some((b) => !b.isValid) ||
      typeof this.db.quoteCourtBooking !== 'function'
    ) {
      this.serverQuote.set(null);
      return;
    }
    const quotes = await Promise.all(
      blocks.map((b) =>
        this.db.quoteCourtBooking(
          court.id,
          b.dateStr!,
          b.tranches.map((t) => t.hour),
        ),
      ),
    );
    if (this.quoteSeq !== seq) return;
    this.serverQuote.set(quotes.length === 1 ? quotes[0] : null);
    const prices = new Map<string, number>();
    quotes.forEach((q, i) => {
      if (!q?.isValid || q.dateStr !== blocks[i].dateStr) return;
      for (const t of q.tranches) prices.set(`${q.dateStr}_${t.hour}`, t.price);
    });
    this.selectedSlots.update((slots) =>
      slots.map((s) =>
        prices.has(`${s.dateStr}_${s.hour}`)
          ? { ...s, price: prices.get(`${s.dateStr}_${s.hour}`)! }
          : s,
      ),
    );
  }

  protected reprice(): void {
    if (this.matchesHeldSelection()) return;
    const court = this.resolvedCourt();
    if (!court) return;
    this.selectedSlots.update((slots) => {
      const refreshed: Slot[] = [];
      let hadUnavailable = false;
      for (const s of slots) {
        const avail = this.db.getCourtSlotAvailability(court, s.dateStr, s.hour);
        if (avail.state !== 'available') {
          hadUnavailable = true;
        } else {
          refreshed.push({ ...s, price: avail.price });
        }
      }
      if (hadUnavailable) {
        this.confirmError.set(
          'Uno o más turnos seleccionados ya no se encuentran disponibles y fueron removidos.',
        );
      }
      return refreshed;
    });
  }

  protected addPlayer(): void {
    const name = this.newPlayerName().trim();
    const phone = this.newPlayerPhone().trim();
    if (!name) return;
    if (phone && !/^9\d{8}$/.test(phone)) {
      this.confirmError.set('El teléfono debe tener 9 dígitos y empezar con 9 (ej: 987654321)');
      return;
    }
    const esRegistrado = this.newPlayerTipo() === 'Registrado';
    const player: Player = {
      id: `p_${Date.now()}`,
      name,
      role: esRegistrado ? 'Amigo' : 'Convocado',
      phone: phone || 'Convocado reciente',
      registrado: esRegistrado,
      isCaptain: false,
      paid: false,
    };
    this.players.update((list) => [...list, player]);
    this.newPlayerName.set('');
    this.newPlayerPhone.set('');
    this.confirmError.set('');
  }

  protected removePlayer(id: string): void {
    this.players.update((list) => list.filter((p) => p.id !== id));
  }

  protected quotaName(p: Player): string {
    const first = p.name.split(' ')[0];
    if (p.isCaptain) return `Capitán ${first}`;
    return p.registrado ? first : `${first} (Invitado)`;
  }

  protected quotaStatus(p: Player): { text: string; cls: string } {
    if (p.isCaptain) return { text: 'A pagar hoy', cls: 'green' };
    if (p.paid) return { text: 'Pagado', cls: 'green' };
    if (p.registrado) return { text: 'Pendiente app', cls: 'orange' };
    return { text: 'En mesa / efec', cls: 'muted' };
  }

  private lastIdempotencySignature: string | null = null;
  private lastIdempotencyKey: string | null = null;

  protected readonly canSubmitReservation = computed<boolean>(() => {
    return (
      this.isLoggedIn() &&
      !!this.resolvedCourt() &&
      !this.effectiveAvailabilityError() &&
      !this.isLoadingAvailability() &&
      this.bookingBlock().isValid &&
      this.bookingBlock().durationHours > 0 &&
      this.paymentReady() &&
      Number.isInteger(this.accessSlots()) &&
      this.accessSlots() > 0 &&
      this.accessSlots() <= 100 &&
      !this.submitting() &&
      !this.restoringPayment()
    );
  });

  private getOrCreateIdempotencyKey(
    userId: string,
    courtId: string,
    dateStr: string,
    displayRange: string,
  ): string {
    const signature = `${userId}|${courtId}|${dateStr}|${displayRange}|${this.accessSlots()}`;
    if (this.lastIdempotencySignature === signature && this.lastIdempotencyKey) {
      return this.lastIdempotencyKey;
    }
    const key = `chk-${courtId}-${dateStr}-${crypto.randomUUID()}`.slice(0, 96);
    this.lastIdempotencySignature = signature;
    this.lastIdempotencyKey = key;
    return key;
  }

  protected async confirmarReserva(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    if (!this.isLoggedIn()) {
      this.confirmError.set('Debes iniciar sesión con tu cuenta de jugador para continuar.');
      return;
    }
    const court = this.resolvedCourt();
    if (!court) {
      this.confirmError.set('La cancha seleccionada no es válida o no está disponible.');
      return;
    }
    if (this.selectedSlots().length === 0) {
      this.confirmError.set(
        'Por favor, selecciona al menos un turno en el calendario de la semana.',
      );
      return;
    }
    const beforeCount = this.selectedSlots().length;
    this.reprice();
    if (this.selectedSlots().length !== beforeCount) {
      return;
    }
    const block = this.bookingBlock();
    if (!block.isValid || block.durationHours === 0 || !block.dateStr || !block.displayRange) {
      this.confirmError.set(
        block.errorMessage ||
          'Los turnos seleccionados deben formar un único bloque continuo en la misma fecha.',
      );
      return;
    }

    if (!this.canSubmitReservation()) {
      this.confirmError.set(
        'El pago todavía no está disponible. Revisa la configuración y la cantidad de participantes.',
      );
      return;
    }

    const dateStr = block.dateStr;
    const displayRange = block.displayRange;
    const user = this.currentUser();
    const userId = String(user?.id ?? user?.id_usuario ?? 'auth-user');
    const venue = this.resolvedVenue();
    const idempotencyKey = this.getOrCreateIdempotencyKey(
      userId,
      String(court.id),
      dateStr,
      this.bookingBlocks()
        .map((b) => `${b.dateStr}:${b.displayRange}`)
        .join('|'),
    );

    this.submitting.set(true);
    this.confirmError.set('');
    try {
      const held = this.resumedPayment();
      if (held && this.matchesHeldSelection()) {
        const verified = await this.mp.state(held.id);
        if (!verified.canResume) {
          await this.router.navigate(['/pago/resultado'], { queryParams: { checkout: held.id } });
          return;
        }
      }
      const result = await this.mp.start({
        courtId: String(court.id),
        // Una API antigua debe rechazar un conjunto, nunca reservar solo su primer dia.
        ...(this.bookingBlocks().length === 1
          ? { fecha: dateStr, hours: this.bookingBlocks()[0].tranches.map((t) => t.hour) }
          : {}),
        selections: this.bookingBlocks().map((b) => ({
          fecha: b.dateStr!,
          hours: b.tranches.map((t) => t.hour),
        })),
        cupos: this.accessSlots(),
        idempotencyKey,
      });
      try {
        sessionStorage.setItem(
          `mp-convocados:${result.id}`,
          JSON.stringify({ userId: user?.id, players: this.players().filter((p) => !p.isCaptain) }),
        );
      } catch {
        /* No impedir el pago si el navegador bloquea el borrador local. */
      }
      this.mp.open(result.checkoutUrl);
    } catch (err: any) {
      const status = err?.status;
      const genericErrors = new Set([
        'conflict',
        'bad request',
        'unauthorized',
        'forbidden',
        'not found',
        'internal server error',
        'bad gateway',
        'service unavailable',
        'gateway timeout',
      ]);
      const serverMsg = [
        err?.error?.message,
        err?.error?.detail,
        err?.error?.error,
        typeof err?.error === 'string' ? err.error : null,
      ].find(
        (message) =>
          typeof message === 'string' &&
          message.trim() &&
          !genericErrors.has(message.trim().toLowerCase()),
      );

      if (status === 402) {
        this.confirmError.set(
          serverMsg || 'Mercado Pago no pudo iniciar el pago. La reserva no fue confirmada.',
        );
      } else if (status === 504) {
        this.confirmError.set(
          serverMsg ||
            'No pudimos consultar el estado del pago. Reintenta con la misma selección antes de iniciar otro pago.',
        );
      } else if (status === 409) {
        this.lastIdempotencyKey = null;
        this.lastIdempotencySignature = null;
        await this.loadWeekAvailability(String(court.id), this.weekOffset());
        this.reprice();
        this.confirmError.set(
          serverMsg ||
            'El horario seleccionado acaba de ser ocupado por otro jugador o cambió su disponibilidad. Hemos actualizado el calendario.',
        );
      } else if (status === 401) {
        this.confirmError.set(
          serverMsg || 'Tu sesión ha expirado. Inicia sesión nuevamente para confirmar la reserva.',
        );
      } else {
        this.confirmError.set(
          serverMsg ||
            'No se pudo registrar la reserva en el servidor. Verifica tu conexión e intenta nuevamente.',
        );
      }
    } finally {
      this.submitting.set(false);
    }
  }
}
