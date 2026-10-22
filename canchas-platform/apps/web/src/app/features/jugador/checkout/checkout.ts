import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import type { Venue, Court } from '@shared/models/venue.model';
import type { CourtSlotAvailability, SlotState, BookingBlock, BookingTranche } from '@shared/models/availability.model';
import { getLimaDate, buildBookingBlock, getCourtOperatingHours } from '@core/utils/availability.utils';

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
  imports: [FormsModule, RouterLink],
  selector: 'app-checkout',
  styleUrl: './checkout.css',
  templateUrl: './checkout.html',
})
export class Checkout {
  private readonly db = inject(DatabaseService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);

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
    return venues.map(v => ({
      id: v.id,
      name: v.nombre,
      price: v.precioBase,
      address: v.direccion,
      img: v.fotos[0] ?? 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=300&auto=format&fit=crop',
      courts: v.canchas,
      phone: v.telefono
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

  protected readonly resolvedCourt = computed<Court | null>(() => this.resolvedData()?.court ?? null);
  protected readonly resolvedVenue = computed<Venue | null>(() => this.resolvedData()?.venue ?? null);

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
  protected readonly returnUrl = computed(() => {
    const id = this.queryCourtId();
    return id ? `/checkout?courtId=${id}` : '/sedes';
  });

  protected readonly weekOffset = signal(0);
  protected readonly timeFilter = signal<'all' | 'afternoon' | 'prime'>('all');
  protected readonly selectedSlots = signal<Slot[]>([]);
  protected readonly activePaso = signal<1 | 2 | 3>(1);

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
    { id: 'capitan', name: 'Tú (Titular)', role: 'Tú', phone: '', registrado: true, isCaptain: true, paid: true },
  ]);

  protected readonly paymentMethod = signal<'card' | 'yape' | 'plin'>('card');
  protected readonly isSplitActive = signal(false);

  // Campos de tarjeta simulada y estados explícitos (Fase 5)
  protected readonly cardNumber = signal('4532 0000 0000 4242');
  protected readonly cardExpiry = signal('12/28');
  protected readonly cardCvv = signal('123');
  protected readonly cardHolder = signal('Carlos Jugador');
  protected readonly cardSimulationOutcome = signal<'approved' | 'rejected' | 'timeout'>('approved');

  protected readonly reservaStatus = signal('Confirmada');
  protected readonly paymentStatus = signal('aprobado');
  protected readonly paidAmount = signal(0);
  protected readonly balanceAmount = signal(0);
  protected readonly paymentOpNumber = signal('');

  protected readonly isCardValid = computed<boolean>(() => {
    const num = this.cardNumber().replace(/\s+/g, '');
    const exp = this.cardExpiry().trim();
    const cvv = this.cardCvv().trim();
    const holder = this.cardHolder().trim();
    const expMatch = exp.match(/^(\d{2})\/(\d{2})$/);
    if (!expMatch) return false;
    const month = parseInt(expMatch[1], 10);
    if (month < 1 || month > 12) return false;
    return num.length >= 15 && num.length <= 19 && cvv.length >= 3 && holder.length > 0;
  });

  protected readonly newPlayerName = signal('');
  protected readonly newPlayerPhone = signal('');
  protected readonly newPlayerTipo = signal<'Registrado' | 'Invitado'>('Invitado');

  protected readonly couponCodeInput = signal('');
  protected readonly couponApplied = signal(false);
  protected readonly couponPercent = signal(0);
  protected readonly couponMessage = signal('');

  protected readonly opCode = signal('');
  protected readonly voucherFileName = signal('');
  protected readonly voucherUploaded = signal(false);
  protected readonly voucherDragging = signal(false);
  protected readonly copied = signal(false);
  protected readonly linkCopied = signal(false);

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
      if (cId) {
        void this.loadWeekAvailability(cId, this.weekOffset());
      }
    });

    effect(() => {
      const user = this.currentUser();
      const userId = user?.id ?? null;
      if (this.lastSessionUserId !== undefined && this.lastSessionUserId !== userId) {
        this.confirmError.set('');
        this.showSuccess.set(false);
      }
      this.lastSessionUserId = userId;
      const captainName = user?.nombre ? user.nombre : 'Tú (Titular)';
      this.players.update((list) =>
        list.map((p) => (p.isCaptain ? { ...p, name: captainName } : p)),
      );
    });
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
      img: v.fotos[0] ?? 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=300&auto=format&fit=crop',
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

  protected readonly bookingBlock = computed<BookingBlock>(() => {
    const localBlock = buildBookingBlock(this.selectedSlots(), this.nightStartHour());
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
        tranches: srv.tranches.length === localBlock.tranches.length ? srv.tranches : localBlock.tranches,
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

  protected readonly discountAmount = computed(() => this.subtotal() * this.couponPercent());

  protected readonly total = computed(() =>
    Math.max(0, this.subtotal() - this.discountAmount()),
  );

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
    if (block.isValid) {
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
      return `${block.dayDisplay} (${block.displayRange})`;
    }
    const dates = [...new Set(this.selectedSlots().map((s) => s.dayDisplay))];
    return dates.length ? dates.join(', ') : 'Sin horarios elegidos';
  });

  protected readonly horarioText = computed(() => {
    const block = this.bookingBlock();
    if (block.isValid && block.fullLabel) {
      return block.fullLabel;
    }
    return this.selectedSlots().map((s) => `${s.dayDisplay}: ${s.time}`).join(', ');
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

  protected readonly qrTitle = computed(() =>
    this.paymentMethod() === 'yape' ? 'Pago QR Oficial Yape' : 'Pago QR Oficial Plin',
  );

  protected readonly qrAccentColor = computed(() =>
    this.paymentMethod() === 'yape' ? '#742384' : '#00d1b2',
  );

  protected readonly voucherBorderColor = computed(() =>
    this.voucherDragging() ? 'var(--color-brand-green)' : '#cbd5e1',
  );

  protected readonly voucherStatusText = computed(() =>
    this.voucherUploaded()
      ? 'Voucher adjuntado y listo para validar'
      : 'Esperando verificación de recepción',
  );

  protected readonly convocadosText = computed(
    () => `${this.players().length} Convocados activos`,
  );

  protected fmt(n: number): string {
    return `S/ ${n.toFixed(2)}`;
  }

  protected cuotaLabel(): string {
    const n = this.players().length;
    return `Cuota por persona (${n} jugador${n > 1 ? 'es' : ''})`;
  }

  protected couponPercentText(): string {
    return `-${Math.round(this.couponPercent() * 100)}%`;
  }

  protected paymentMethodName(): string {
    const m = this.paymentMethod();
    if (m === 'card') return 'Tarjeta';
    return m === 'yape' ? 'Yape' : 'Plin';
  }

  protected goToPaso(paso: 1 | 2 | 3): void {
    if (paso === 2 || paso === 3) {
      this.reprice();
      if (this.selectedSlots().length === 0) {
        this.confirmError.set('Por favor, selecciona al menos un turno en el calendario de la semana.');
        return;
      }
      const block = this.bookingBlock();
      if (!block.isValid) {
        this.confirmError.set(block.errorMessage || 'Los turnos seleccionados no forman un bloque continuo válido.');
        return;
      }
      void this.syncServerQuote();
    }
    this.confirmError.set('');
    this.activePaso.set(paso);
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
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
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
      if (this.requestSeq() !== seq || this.queryCourtId() !== courtId || this.weekOffset() !== offset) {
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
      if (this.requestSeq() === seq && this.queryCourtId() === courtId && this.weekOffset() === offset) {
        this.availabilityError.set('No se pudo verificar la disponibilidad en tiempo real. Intenta nuevamente.');
      }
    } finally {
      if (this.requestSeq() === seq) {
        this.isLoadingAvailability.set(false);
      }
    }
  }

  private async syncServerQuote(): Promise<void> {
    const seq = ++this.quoteSeq;
    const court = this.resolvedCourt();
    const localBlock = buildBookingBlock(this.selectedSlots(), this.nightStartHour());
    if (!court || !localBlock.isValid || localBlock.durationHours === 0 || !localBlock.dateStr) {
      this.serverQuote.set(null);
      return;
    }
    if (typeof this.db.quoteCourtBooking !== 'function') {
      this.serverQuote.set(null);
      return;
    }
    const hours = localBlock.tranches.map((t) => t.hour);
    const quote = await this.db.quoteCourtBooking(court.id, localBlock.dateStr, hours);
    if (this.quoteSeq !== seq) return;
    const quoteCourtId = (quote as any)?.courtId;
    if (
      quote &&
      (!quoteCourtId || String(quoteCourtId) === String(court.id) || String(quoteCourtId) === String(court.id_cancha ?? '')) &&
      quote.dateStr === localBlock.dateStr
    ) {
      this.serverQuote.set(quote);
      // Sincronizar precios por tramo recibidos del servidor con las casillas seleccionadas
      if (quote.isValid && quote.tranches.length === hours.length) {
        const priceByHour = new Map(quote.tranches.map((t) => [t.hour, t.price]));
        this.selectedSlots.update((slots) =>
          slots.map((s) =>
            s.dateStr === quote.dateStr && priceByHour.has(s.hour)
              ? { ...s, price: priceByHour.get(s.hour)! }
              : s,
          ),
        );
      }
    }
  }

  protected reprice(): void {
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
        this.confirmError.set('Uno o más turnos seleccionados ya no se encuentran disponibles y fueron removidos.');
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

  protected toggleSplit(e: Event): void {
    this.isSplitActive.set((e.target as HTMLInputElement).checked);
  }

  protected readonly coupons = [
    { code: 'CANCHERO10', percent: 0.1, label: '10% descuento' },
    { code: 'CANCHERO20', percent: 0.2, label: '20% descuento' },
    { code: 'DEPOR20', percent: 0.2, label: '20% descuento deporte' },
    { code: 'WELCOME15', percent: 0.15, label: '15% bienvenida' },
  ];

  protected getPaymentPhone(): string {
    const comp = this.selectedComplejo();
    const method = this.paymentMethod();
    if (method === 'plin') return '987 321 654';
    return comp.phone?.replace(/[^0-9]/g, '') ?? '987654321';
  }

  protected applyCoupon(): void {
    const code = this.couponCodeInput().trim().toUpperCase();
    const coupon = this.coupons.find(c => c.code === code);
    if (coupon) {
      this.couponApplied.set(true);
      this.couponPercent.set(coupon.percent);
      this.couponMessage.set(`Cupón ${coupon.code} de ${coupon.label} aplicado`);
    } else {
      this.couponApplied.set(false);
      this.couponPercent.set(0);
      this.couponMessage.set('Código no válido. Prueba: ' + this.coupons.map(c => c.code).join(', '));
    }
  }

  protected generarQRSVG(data: string): string {
    const size = 140;
    const modules = this.qrCodeModules(data);
    const moduleSize = size / modules.length;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
    svg += `<rect width="${size}" height="${size}" fill="white"/>`;
    for (let r = 0; r < modules.length; r++) {
      for (let c = 0; c < modules[r].length; c++) {
        if (modules[r][c]) {
          svg += `<rect x="${c * moduleSize}" y="${r * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
        }
      }
    }
    svg += '</svg>';
    return svg;
  }

  private qrCodeModules(text: string): boolean[][] {
    const size = 25;
    const modules: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const seed = (hash * 31 + r * 17 + c * 13) & 0x7fffffff;
        modules[r][c] = (seed % 2) === 0;
      }
    }
    modules[0][0] = true; modules[0][size-1] = true; modules[size-1][0] = true;
    return modules;
  }

  protected readonly qrSvg = computed(() => {
    const court = this.resolvedCourt();
    const data = `https://canchero.pe/checkout?courtId=${court?.id ?? ''}`;
    return this.generarQRSVG(data);
  });

  protected removeCoupon(): void {
    this.couponApplied.set(false);
    this.couponPercent.set(0);
    this.couponMessage.set('');
  }

  protected selectPayment(m: 'yape' | 'plin' | 'card'): void {
    if (m !== 'card') {
      this.confirmError.set('En reservas online solo está habilitado el pago al 100% con tarjeta. Yape y Plin están deshabilitados para reservas online.');
      return;
    }
    this.confirmError.set('');
    this.paymentMethod.set('card');
  }

  protected copyNumber(): void {
    const comp = this.selectedComplejo();
    const phone = this.getPaymentPhone().replace(/[^0-9]/g, '') || '987654321';
    void navigator.clipboard?.writeText(phone);
    this.copied.set(true);
    setTimeout(() => this.copied.set(false), 2000);
  }

  protected copyLink(): void {
    void navigator.clipboard?.writeText(window.location.href);
    this.linkCopied.set(true);
    setTimeout(() => this.linkCopied.set(false), 2500);
  }

  protected shareWhatsApp(): void {
    const comp = this.selectedComplejo();
    const slotTexts = this.selectedSlots().length
      ? this.selectedSlots().map((s) => `${s.dayDisplay}: ${s.time}`).join(' | ')
      : 'Horario por coordinar';
    const cuota = this.cuotaPerPlayer().toFixed(2);
    const phone = comp.phone?.replace(/[^0-9]/g, '') ?? '987654321';
    const msg = encodeURIComponent(
      `Habla equipo. Pichanga confirmada:\n\n` +
        `Sede: ${comp.name}\n` +
        `Cancha: ${this.selectedTipoCancha()}\n` +
        `Horario(s): ${slotTexts}\n` +
        `Cuota individual: S/ ${cuota} (Yape/Plin al ${phone})\n\n` +
        `Confirmen su asistencia para no quedarnos sin gente.`,
    );
    window.open(`https://api.whatsapp.com/send?text=${msg}`, '_blank');
  }

  protected openVoucherPicker(input: HTMLInputElement): void {
    input.click();
  }

  protected onVoucherDragOver(e: Event): void {
    e.preventDefault();
    this.voucherDragging.set(true);
  }

  protected onVoucherDragLeave(e: Event): void {
    e.preventDefault();
    this.voucherDragging.set(false);
  }

  protected onVoucherDrop(e: DragEvent): void {
    e.preventDefault();
    this.voucherDragging.set(false);
    const file = e.dataTransfer?.files[0];
    if (file) this.updateVoucher(file);
  }

  protected onVoucherSelect(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.updateVoucher(file);
  }

  private updateVoucher(file: File): void {
    const sizeKb = Math.max(1, Math.round(file.size / 1024));
    this.voucherFileName.set(`${file.name} (${sizeKb} KB)`);
    this.voucherUploaded.set(true);
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
      this.isCardValid() &&
      !this.submitting()
    );
  });

  private getOrCreateIdempotencyKey(
    userId: string,
    courtId: string,
    dateStr: string,
    displayRange: string,
  ): string {
    const signature = `${userId}|${courtId}|${dateStr}|${displayRange}`;
    if (this.lastIdempotencySignature === signature && this.lastIdempotencyKey) {
      return this.lastIdempotencyKey;
    }
    const randomSuffix = Math.random().toString(36).substring(2, 10);
    const key = `chk-${courtId}-${dateStr}-${displayRange.replace(/\s+/g, '')}-${randomSuffix}`.slice(0, 96);
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
      this.confirmError.set('Por favor, selecciona al menos un turno en el calendario de la semana.');
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
        block.errorMessage || 'Los turnos seleccionados deben formar un único bloque continuo en la misma fecha.',
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
      displayRange,
    );
    const metodoPagoLabel = 'Tarjeta';

    this.submitting.set(true);
    this.confirmError.set('');
    try {
      const result = await this.db.createOnlineBooking({
        courtId: court.id,
        venueId: venue?.id,
        courtName: court.nombre,
        venueName: venue?.nombre,
        fecha: dateStr,
        horario: displayRange,
        hours: block.tranches.map((t) => t.hour),
        total: block.subtotal,
        metodoPago: metodoPagoLabel,
        jugadores: this.players().map((p) => p.name),
        idempotencyKey,
        numeroOperacion: this.opCode().trim() || undefined,
        paymentOutcome: this.cardSimulationOutcome(),
        cardNumber: this.cardNumber().replace(/\s+/g, ''),
        cardHolder: this.cardHolder().trim() || this.currentUser()?.nombre || 'Titular Tarjeta',
      });

      const passCode =
        result?.reserva?.codigo_pase ||
        result?.response?.codigoPase ||
        '#CAN-0000';
      this.reservaCode.set(passCode);
      this.reservaTimeText.set(result?.response?.horario || displayRange);
      this.reservaStatus.set(result?.response?.status || result?.reserva?.estado || 'Confirmada');
      this.paymentStatus.set(result?.response?.paymentStatus || result?.pago?.estado || 'aprobado');
      this.paidAmount.set(Number(result?.response?.paidAmount ?? block.subtotal));
      this.balanceAmount.set(Number(result?.response?.balanceAmount ?? 0));
      this.paymentOpNumber.set(result?.response?.paymentOperationNumber || result?.pago?.numero_operacion || '');
      this.showSuccess.set(true);
      void this.loadWeekAvailability(String(court.id), this.weekOffset());
    } catch (err: any) {
      const status = err?.status;
      const serverMsg =
        err?.error?.message ||
        err?.error?.error ||
        (typeof err?.error === 'string' ? err.error : null);

      if (status === 402) {
        this.confirmError.set(
          serverMsg || 'El pago simulado con tarjeta fue rechazado por la entidad emisora. La reserva no fue confirmada.',
        );
      } else if (status === 504) {
        this.confirmError.set(
          serverMsg || 'Tiempo de espera agotado al conectar con el procesador de pagos. No se realizó ningún cargo.',
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
          serverMsg || 'No se pudo registrar la reserva en el servidor. Verifica tu conexión e intenta nuevamente.',
        );
      }
    } finally {
      this.submitting.set(false);
    }
  }

  protected onModalBackdrop(e: Event): void {
    if (e.target === e.currentTarget) this.showSuccess.set(false);
  }
}
