import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import { AuthService } from '../../services/auth.service';
import type { Venue, Court } from '../../models/venue.model';

interface WeekDay {
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

interface Slot {
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
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

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
    { key: 'all', label: 'Todos los turnos (08:00 - 23:00)' },
    { key: 'afternoon', label: 'Tarde y Noche (15:00 - 23:00)' },
    { key: 'prime', label: 'Noche Prime (18:00 - 23:00)' },
  ];

  protected readonly selectedComplejoId = signal('1');
  protected readonly selectedTipoCancha = signal('Grass 7');
  protected readonly weekOffset = signal(0);
  protected readonly timeFilter = signal<'all' | 'afternoon' | 'prime'>('all');
  protected readonly selectedSlots = signal<Slot[]>([]);
  protected readonly activePaso = signal<1 | 2 | 3>(1);

  protected readonly players = signal<Player[]>([
    { id: 'carlos', name: 'Carlos Jugador', role: 'Tú', phone: '987 654 321', registrado: true, isCaptain: true, paid: true },
    { id: 'roberto', name: 'Roberto Mendoza', role: 'Amigo', phone: '912 345 678', registrado: true, isCaptain: false, paid: false },
    { id: 'diego', name: 'Diego Valdivia', role: 'Amigo', phone: '945 678 123', registrado: true, isCaptain: false, paid: true },
    { id: 'juan', name: 'Juan Invitado', role: 'Barrio', phone: '998 112 233', registrado: false, isCaptain: false, paid: false },
  ]);

  protected readonly paymentMethod = signal<'yape' | 'plin' | 'card'>('yape');
  protected readonly isSplitActive = signal(true);

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

  private readonly retentionSeconds = signal(15 * 60);

  protected readonly retentionText = computed(() => {
    const s = this.retentionSeconds();
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec} min`;
  });

  protected readonly pad2 = (n: number): string => String(n).padStart(2, '0');

  constructor() {
    const qId = this.route.snapshot.queryParamMap.get('id');
    if (qId && this.complejos().some((c) => c.id === qId)) {
      this.selectedComplejoId.set(qId);
    }
    const qCancha = this.route.snapshot.queryParamMap.get('cancha');
    if (qCancha) {
      this.selectedTipoCancha.set(qCancha);
    }

    const interval = setInterval(() => {
      this.retentionSeconds.update((s) => Math.max(0, s - 1));
    }, 1000);
    this.destroyRef.onDestroy(() => clearInterval(interval));
  }

  protected readonly selectedComplejo = computed(
    () => this.complejos().find((c) => c.id === this.selectedComplejoId()) ?? this.complejos()[0],
  );

  protected readonly currentWeekDays = computed(() => this.getDaysForWeek(this.weekOffset()));

  protected readonly filteredHours = computed(() => {
    const all = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
    if (this.timeFilter() === 'afternoon') return all.filter((h) => h >= 15);
    if (this.timeFilter() === 'prime') return all.filter((h) => h >= 18);
    return all;
  });

  protected readonly basePrice = computed(() => {
    const price = this.selectedComplejo().price;
    const tipo = this.selectedTipoCancha();
    if (tipo === 'Grass 5') return Math.round(price * 0.75);
    if (tipo === 'Futsal Techado') return Math.round(price * 0.85);
    return price;
  });

  protected readonly subtotal = computed(() =>
    this.selectedSlots().reduce((acc, s) => acc + s.price, 0),
  );

  protected readonly discountAmount = computed(() => this.subtotal() * this.couponPercent());

  protected readonly total = computed(() =>
    Math.max(0, this.subtotal() - this.discountAmount()),
  );

  protected readonly cuotaPerPlayer = computed(() => {
    const count = this.players().length || 1;
    return this.total() / count;
  });

  protected readonly totalToPayNow = computed(() =>
    this.isSplitActive() ? this.cuotaPerPlayer() : this.total(),
  );

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
    const dates = [...new Set(this.selectedSlots().map((s) => s.dayDisplay))];
    return dates.length ? dates.join(', ') : 'Sin horarios elegidos';
  });

  protected readonly horarioText = computed(() =>
    this.selectedSlots().map((s) => `${s.dayDisplay}: ${s.time}`).join(', '),
  );

  protected readonly contextTimeText = computed(
    () => this.selectedSlots()[0]?.time ?? '--:-- - --:--',
  );

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
      ? '✓ Voucher adjuntado y listo para validar'
      : '⏳ Esperando verificación de recepción',
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
    if (paso === 2 && this.selectedSlots().length === 0) {
      this.confirmError.set('Por favor, selecciona al menos un turno en el calendario de la semana.');
      return;
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
    const days: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const cur = new Date(monday);
      cur.setDate(monday.getDate() + i);
      const year = cur.getFullYear();
      const month = String(cur.getMonth() + 1).padStart(2, '0');
      const day = String(cur.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const isPast = cur.getTime() < today.getTime();
      const isToday = cur.getTime() === today.getTime();
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

  protected getSlotPrice(hour: number, base: number): number {
    if (hour >= 18 && hour <= 21) return base + 10;
    if (hour < 15) return Math.max(40, base - 10);
    return base;
  }

  private isSlotOccupied(complejoId: string, dateStr: string, hour: number): boolean {
    const hourStr = `${this.pad2(hour)}:00`;
    const dateNum = parseInt(dateStr.replace(/-/g, ''), 10);
    const dateObj = new Date(`${dateStr}T00:00:00`);
    const dayOfWeek = dateObj.getDay();
    const hash = Math.abs((dateNum * 19 + Number(complejoId || 1) * 23 + hour * 11) % 100);
    if ((dayOfWeek === 5 || dayOfWeek === 6) && hour >= 18 && hour <= 21) return hash % 10 < 6;
    if (hour >= 19 && hour <= 21) return hash % 10 < 5;
    if (hour >= 16 && hour <= 18) return hash % 10 < 3;
    return hash % 10 < 2;
  }

  protected slotStatus(day: WeekDay, hour: number): 'past' | 'occupied' | 'available' {
    if (day.isPast) return 'past';
    const now = new Date();
    if (day.isToday && hour <= now.getHours()) return 'past';
    if (this.isSlotOccupied(this.selectedComplejoId(), day.dateStr, hour)) return 'occupied';
    return 'available';
  }

  protected isSlotSelected(day: WeekDay, hour: number): boolean {
    return this.selectedSlots().some((s) => s.id === `${day.dateStr}_${hour}`);
  }

  protected slotPriceAt(hour: number): number {
    return this.getSlotPrice(hour, this.basePrice());
  }

  protected toggleSlot(day: WeekDay, hour: number): void {
    const id = `${day.dateStr}_${hour}`;
    const exists = this.selectedSlots().some((s) => s.id === id);
    if (exists) {
      this.selectedSlots.update((slots) => slots.filter((s) => s.id !== id));
    } else {
      const slot: Slot = {
        id,
        dateStr: day.dateStr,
        dayDisplay: day.displayShort,
        time: `${this.pad2(hour)}:00 - ${this.pad2(hour + 1)}:00`,
        hour,
        price: this.slotPriceAt(hour),
      };
      this.selectedSlots.update((slots) => [...slots, slot]);
    }
    this.confirmError.set('');
  }

  protected removeSlot(id: string): void {
    this.selectedSlots.update((slots) => slots.filter((s) => s.id !== id));
  }

  protected clearSlots(): void {
    this.selectedSlots.set([]);
  }

  protected prevWeek(): void {
    if (this.weekOffset() > 0) this.weekOffset.update((w) => w - 1);
  }

  protected nextWeek(): void {
    this.weekOffset.update((w) => w + 1);
  }

  protected todayWeek(): void {
    this.weekOffset.set(0);
  }

  protected setTimeFilter(f: 'all' | 'afternoon' | 'prime'): void {
    this.timeFilter.set(f);
  }

  protected onComplejoChange(id: string): void {
    this.selectedComplejoId.set(id);
    this.reprice();
  }

  protected onTipoChange(tipo: string): void {
    this.selectedTipoCancha.set(tipo);
    this.reprice();
  }

  private reprice(): void {
    const base = this.basePrice();
    this.selectedSlots.update((slots) =>
      slots.map((s) => ({ ...s, price: this.getSlotPrice(s.hour, base) })),
    );
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
    if (p.paid) return { text: 'Pagado ✓', cls: 'green' };
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
      this.couponMessage.set(`✓ ¡Cupón ${coupon.code} de ${coupon.label} aplicado!`);
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
    const comp = this.selectedComplejo();
    const data = `https://canchero.pe/checkout?id=${comp.id}&cancha=${this.selectedTipoCancha()}`;
    return this.generarQRSVG(data);
  });

  protected removeCoupon(): void {
    this.couponApplied.set(false);
    this.couponPercent.set(0);
    this.couponMessage.set('');
  }

  protected selectPayment(m: 'yape' | 'plin' | 'card'): void {
    this.paymentMethod.set(m);
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
      `⚽ ¡Habla equipo! Pichanga confirmada:\n\n` +
        `🏟️ Sede: ${comp.name}\n` +
        `📅 Cancha: ${this.selectedTipoCancha()}\n` +
        `⏰ Horario(s): ${slotTexts}\n` +
        `💵 Cuota individual: S/ ${cuota} (Yape/Plin al ${phone})\n\n` +
        `¡Confirmen su asistencia para no quedarnos sin gente!`,
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

  protected confirmarReserva(): void {
    if (this.selectedSlots().length === 0) {
      this.confirmError.set('Por favor, selecciona al menos un turno en el calendario de la semana.');
      return;
    }
    this.confirmError.set('');
    this.submitting.set(true);
    const first = this.selectedSlots()[0];
    const fecha = first.dateStr;
    const [horaInicio = '19:00', horaFin = '20:00'] = first.time
      .split(' - ')
      .map((t) => t.trim());

    const tipo = this.selectedTipoCancha();
    let cancha = this.db.canchas().find((c) => c.activa && (tipo.toLowerCase().includes('5') ? c.tipo.includes('5') : c.tipo.includes('7')));
    if (!cancha) {
      cancha = this.db.getCanchasPublicasActivas()[0];
    }
    if (!cancha) {
      this.confirmError.set('No hay canchas activas disponibles. Crea una desde el panel admin.');
      this.submitting.set(false);
      return;
    }
    const emailA = this.auth.currentUser()?.email ?? 'jugador@canchero.pe';
    const jugador = this.db.usuarios().find((u) => u.email.toLowerCase() === 'jugador@canchero.pe')
      ?? this.db.usuarios().find((u) => u.email.toLowerCase() === emailA.toLowerCase())
      ?? this.db.usuarios().find((u) => u.rol === 'cliente');

    const reserva = this.db.createReservaConPago(
      {
        cancha_id: cancha.id,
        usuario_id: jugador?.id ?? 2,
        fecha,
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        monto: Number(this.total().toFixed(2)),
      },
      {
        metodo_pago: this.paymentMethod() === 'card' ? 'POS Tarjeta' : this.paymentMethod() === 'plin' ? 'Plin' : 'Yape',
        codigo_operacion: this.opCode(),
      },
    );
    this.reservaCode.set(reserva.codigo_pase ?? `#CAN-${1000 + reserva.id}`);
    this.reservaTimeText.set(this.horarioText());
    this.submitting.set(false);
    this.showSuccess.set(true);
  }

  protected onModalBackdrop(e: Event): void {
    if (e.target === e.currentTarget) this.showSuccess.set(false);
  }
}