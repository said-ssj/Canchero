import type { AdminReservationRow, CourtOption, TimeTrancheBreakdown } from './admin-reservas.models';

export function limaDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function addCalendarDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function timeStringToMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map((t) => parseInt(t, 10) || 0);
  return hours * 60 + minutes;
}

export function minutesToTimeString(totalMinutes: number): string {
  const normalized = Math.max(0, totalMinutes % (24 * 60));
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

export function addHoursToTime(time: string, hours: number): string {
  const minutes = timeStringToMinutes(time) + hours * 60;
  return minutesToTimeString(minutes);
}

export function isTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  return start1 < end2 && end1 > start2;
}

export function calculateBookingPrice(
  court: CourtOption | null | undefined,
  startHour: string,
  durationHours: number,
): { total: number; breakdown: TimeTrancheBreakdown[] } {
  if (!court || durationHours <= 0) {
    return { total: 0, breakdown: [] };
  }

  const startMinutes = timeStringToMinutes(startHour);
  const nightStartMinutes = timeStringToMinutes(court.hora_inicio_noche || '18:00');
  const dayPrice = court.precio_hora ?? 80;
  const nightPrice = court.precio_hora_noche ?? court.precio_hora ?? 100;

  const breakdown: TimeTrancheBreakdown[] = [];
  let total = 0;

  for (let i = 0; i < durationHours; i++) {
    const slotStartMin = startMinutes + i * 60;
    const slotEndMin = slotStartMin + 60;
    const slotStartStr = minutesToTimeString(slotStartMin);
    const slotEndStr = minutesToTimeString(slotEndMin);
    const isNight = slotStartMin >= nightStartMinutes;
    const price = isNight ? nightPrice : dayPrice;

    breakdown.push({
      tranche: `${slotStartStr} - ${slotEndStr}`,
      price,
      isNight,
    });
    total += price;
  }

  return { total, breakdown };
}

export function reservationCsv(rows: readonly AdminReservationRow[]): string {
  // Escape CSV and neutralize formulas originating in user-provided text.
  const cell = (value: string | number) => {
    let text = String(value);
    if (typeof value === 'string' && /^\s*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const values: (string | number)[][] = [
    [
      'Codigo',
      'Fecha',
      'Horario',
      'Cancha',
      'Titular',
      'Tipo de Cliente',
      'Telefono',
      'Estado',
      'Total',
      'Pagado (Adelanto)',
      'Saldo Pendiente',
      'Metodo',
      'Operacion',
    ],
    ...rows.map((row) => [
      row.codigoPase,
      row.reserva.fecha,
      row.horario,
      row.canchaNombre,
      row.jugadorNombre,
      row.esClienteSinCuenta ? 'Presencial (Sin cuenta)' : 'Cliente Registrado',
      row.telefono,
      row.estado,
      row.montoTotal ?? row.monto,
      row.adelanto ?? row.monto,
      row.saldo ?? 0,
      row.metodo,
      row.operacion,
    ]),
  ];
  return values.map((row) => row.map(cell).join(',')).join('\r\n');
}
