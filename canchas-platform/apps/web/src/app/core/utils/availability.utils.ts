import type { Court } from '@shared/models/court.model';
import type { CourtSlotAvailability, SlotState, BookingBlock, BookingTranche } from '@shared/models/availability.model';

export function getLimaDate(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const findPart = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${findPart('year')}-${findPart('month')}-${findPart('day')}`;
}

export function getLimaHour(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    hour: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  return parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function normalizeTimeString(time: string): string {
  if (!time) return '00:00';
  const parts = time.trim().split(':');
  const h = parts[0].padStart(2, '0');
  const m = (parts[1] ?? '00').padStart(2, '0');
  return `${h}:${m}`;
}

export function isTimeOverlap(start1: string, end1: string, start2: string, end2: string): boolean {
  const s1 = normalizeTimeString(start1);
  let e1 = normalizeTimeString(end1);
  const s2 = normalizeTimeString(start2);
  let e2 = normalizeTimeString(end2);
  if (e1 === '00:00') e1 = '24:00';
  if (e2 === '00:00') e2 = '24:00';
  return s1 < e2 && e1 > s2;
}

export function calculateCourtSlotPrice(
  court: Court,
  tarifasCancha: any[],
  dayOfWeek: number,
  hour: number,
): { price: number; isNight: boolean } {
  const courtIdNum = Number(court.id_cancha ?? court.id);
  const slotStart = `${pad2(hour)}:00`;
  const slotEnd = `${pad2(hour + 1)}:00`; // 24:00 cuando hour === 23
  const nightStart = parseInt((court.horaInicioNoche || '18:00').split(':')[0], 10) || 18;
  const isNight = hour >= nightStart;
  const basePrice = court.precioHora;
  const nightPrice = court.precioHoraNoche ?? basePrice;

  // 1. Verificar si existe tarifa específica configurada en tarifa_cancha
  if (Array.isArray(tarifasCancha) && tarifasCancha.length > 0) {
    const reglasCanchaDia = tarifasCancha.filter((t) => {
      if (t.estado && t.estado !== 'A') return false;
      const tCanchaId = Number(t.id_cancha ?? t.cancha_id);
      if (tCanchaId !== courtIdNum) return false;
      const tDia = Number(t.dia_semana ?? t.diaSemana);
      return tDia === dayOfWeek || (dayOfWeek === 0 && tDia === 7);
    });

    const tarifaEspecifica = reglasCanchaDia.find((t) => {
      const tStart = normalizeTimeString(t.hora_inicio ?? t.horaInicio);
      let tEnd = normalizeTimeString(t.hora_fin ?? t.horaFin);
      if (tEnd === '00:00') tEnd = '24:00';
      // Ignorar regla plana por defecto (08:00-23:00) si la cancha ya define tarifa nocturna diferenciada
      const isFlatDefault =
        reglasCanchaDia.length === 1 &&
        tStart === '08:00' &&
        (tEnd === '23:00' || tEnd === '24:00') &&
        nightPrice !== basePrice;
      if (isFlatDefault) return false;
      return tStart <= slotStart && tEnd >= slotEnd;
    });

    if (tarifaEspecifica && tarifaEspecifica.precio != null) {
      const price = Number(tarifaEspecifica.precio);
      return { price, isNight };
    }
  }

  // 2. Aplicar tarifa diurna / nocturna configurable de la cancha
  return {
    price: isNight ? nightPrice : basePrice,
    isNight,
  };
}

export function getCourtOperatingHours(court: Court | null, horarios: any[]): number[] {
  let minOpen = 8;
  let maxClose = 24;

  if (court && Array.isArray(horarios) && horarios.length > 0) {
    const sedeIdNum = Number(court.id_sede ?? 0);
    const sedeHorarios = horarios.filter((h) => {
      const hSedeId = Number(h.sede_id ?? h.id_sede ?? h.idSede);
      const active = h.activo !== false && h.estado !== 'I';
      return hSedeId === sedeIdNum && active;
    });

    if (sedeHorarios.length > 0) {
      let earliest = 24;
      let latest = 0;
      for (const h of sedeHorarios) {
        const ap = normalizeTimeString(h.hora_apertura ?? h.apertura ?? '08:00');
        const ci = normalizeTimeString(h.hora_cierre ?? h.cierre ?? '23:00');
        const apH = parseInt(ap.split(':')[0], 10);
        const ciH = parseInt(ci.split(':')[0], 10);
        const normClose = ciH === 0 || ciH < apH ? 24 : ciH;
        if (!Number.isNaN(apH) && apH < earliest) earliest = apH;
        if (!Number.isNaN(normClose) && normClose > latest) latest = normClose;
      }
      if (earliest < latest) {
        minOpen = Math.max(0, Math.min(8, earliest));
        maxClose = Math.min(24, Math.max(latest, 23));
      }
    }
  }

  const result: number[] = [];
  for (let h = minOpen; h < maxClose; h++) {
    result.push(h);
  }
  return result;
}

export function resolveSlotAvailability(
  court: Court,
  dateStr: string,
  hour: number,
  reservas: any[],
  bloqueos: any[],
  horarios: any[],
  tarifasCancha: any[],
  nowDate: Date = new Date(),
): CourtSlotAvailability {
  const id = `${dateStr}_${hour}`;
  const slotStartStr = `${pad2(hour)}:00`;
  const slotEndStr = hour + 1 === 24 ? '00:00' : `${pad2(hour + 1)}:00`;
  const time = `${slotStartStr} - ${slotEndStr}`;

  const courtIdNum = Number(court.id_cancha ?? court.id);
  const sedeIdNum = Number(court.id_sede ?? 0);

  // Parsear día de la semana (0 = domingo, 1 = lunes, ..., 6 = sábado)
  const dateObj = new Date(`${dateStr}T12:00:00Z`);
  const dayOfWeek = dateObj.getUTCDay();

  // Calcular precio y si es noche
  const { price, isNight } = calculateCourtSlotPrice(court, tarifasCancha, dayOfWeek, hour);

  // 1. REGLA: ¿Pasado en America/Lima?
  const todayInLima = getLimaDate(nowDate);
  const currentHourInLima = getLimaHour(nowDate);
  if (dateStr < todayInLima || (dateStr === todayInLima && hour <= currentHourInLima)) {
    return {
      id,
      dateStr,
      hour,
      time,
      state: 'past',
      price,
      isNight,
      reason: 'Horario pasado',
    };
  }

  // 2. REGLA: ¿Horario de atención individual de la cancha o de la sede (tipo_horario)?
  const useCourtSchedule =
    court.usar_horario_sede === false &&
    Array.isArray(court.horarios_semana) &&
    court.horarios_semana.length > 0;

  const scheduleSource = useCourtSchedule ? court.horarios_semana! : horarios;

  if (Array.isArray(scheduleSource) && scheduleSource.length > 0 && (useCourtSchedule || sedeIdNum > 0)) {
    const horarioDia = scheduleSource.find((h) => {
      const hDia = Number(h.dia_semana ?? h.diaSemana);
      const dayMatches = hDia === dayOfWeek || (dayOfWeek === 0 && hDia === 7);
      if (useCourtSchedule) return dayMatches;
      const hSedeId = Number(h.sede_id ?? h.id_sede ?? h.idSede);
      return hSedeId === sedeIdNum && dayMatches;
    });

    if (horarioDia) {
      if (horarioDia.activo === false || horarioDia.estado === 'I' || horarioDia.abierto === false) {
        return {
          id,
          dateStr,
          hour,
          time,
          state: 'closed',
          price,
          isNight,
          reason: 'Sede cerrada este día',
        };
      }
      const apertura = normalizeTimeString(horarioDia.hora_apertura ?? horarioDia.apertura ?? '08:00');
      const cierre = normalizeTimeString(horarioDia.hora_cierre ?? horarioDia.cierre ?? '23:00');
      const aperturaHour = parseInt(apertura.split(':')[0], 10);
      const cierreHour = parseInt(cierre.split(':')[0], 10);

      // Si cierra a medianoche (00:00) o en la madrugada del día siguiente (cierreHour < aperturaHour),
      // cubrir hasta el final de la jornada actual (24:00)
      const normalizedCierre = cierreHour === 0 || cierreHour < aperturaHour ? 24 : cierreHour;
      if (hour < aperturaHour || hour >= normalizedCierre) {
        return {
          id,
          dateStr,
          hour,
          time,
          state: 'closed',
          price,
          isNight,
          reason: 'Fuera de horario de atención',
        };
      }
    }
  }

  // 2b. REGLA: ¿Descansos recurrentes configurados en la cancha?
  if (Array.isArray(court.descansos_recurrentes) && court.descansos_recurrentes.length > 0) {
    const descansoActivo = court.descansos_recurrentes.find((d: any) => {
      if (d.activo === false || d.estado === 'I') return false;
      if (Array.isArray(d.dias) && d.dias.length > 0) {
        const matchesDay = d.dias.some(
          (dia: number) => Number(dia) === dayOfWeek || (dayOfWeek === 0 && Number(dia) === 7),
        );
        if (!matchesDay) return false;
      } else {
        const dDia = d.dia_semana ?? d.diaSemana;
        if (dDia != null && Number(dDia) !== dayOfWeek && !(dayOfWeek === 0 && Number(dDia) === 7)) {
          return false;
        }
      }
      const dInicio = normalizeTimeString(d.hora_inicio ?? d.inicio ?? '00:00');
      const dFin = normalizeTimeString(d.hora_fin ?? d.fin ?? '00:00');
      return isTimeOverlap(dInicio, dFin, slotStartStr, slotEndStr);
    });
    if (descansoActivo) {
      return {
        id,
        dateStr,
        hour,
        time,
        state: 'blocked',
        price,
        isNight,
        reason: (descansoActivo as any).titulo || (descansoActivo as any).motivo || 'Horario de descanso',
      };
    }
  }

  // 3. REGLA: ¿Bloqueo de mantenimiento o cierre activo?
  if (Array.isArray(bloqueos) && bloqueos.length > 0) {
    const slotStartIso = `${dateStr}T${slotStartStr}:00`;
    const slotEndIso = hour + 1 === 24 ? `${dateStr}T23:59:59` : `${dateStr}T${pad2(hour + 1)}:00:00`;

    const bloqueoActivo = bloqueos.find((b) => {
      if (b.activo === false || b.estado === 'I') return false;
      const rawCanchaId = b.id_cancha ?? b.cancha_id ?? b.idCancha;
      const bCanchaId = rawCanchaId != null ? Number(rawCanchaId) : null;
      const rawSedeId = b.id_sede ?? b.sede_id ?? b.idSede;
      const bSedeId = rawSedeId != null ? Number(rawSedeId) : 0;

      // Aplica si es para esta cancha o si es cierre global de toda la sede
      const matchScope = bCanchaId === courtIdNum || (bCanchaId == null && bSedeId === sedeIdNum);
      if (!matchScope) return false;

      const rawInicio = b.fecha_inicio ?? b.fechaInicio ?? '';
      const rawFin = b.fecha_fin ?? b.fechaFin ?? null;
      const fInicio = String(rawInicio).trim().replace(' ', 'T').slice(0, 19);
      const fFin = rawFin ? String(rawFin).trim().replace(' ', 'T').slice(0, 19) : null;

      // Si no tiene fecha_fin, es cierre inmediato indefinido
      if (!fFin) return fInicio <= slotEndIso;
      return fInicio < slotEndIso && fFin > slotStartIso;
    });

    if (bloqueoActivo) {
      return {
        id,
        dateStr,
        hour,
        time,
        state: 'blocked',
        price,
        isNight,
        reason: bloqueoActivo.motivo || 'Cierre por mantenimiento',
      };
    }
  }

  // 4. REGLA: ¿Reserva activa que ocupa el intervalo?
  // PRIVACIDAD: Nunca exponer id_cliente, nombre, teléfono ni datos de pago a otros jugadores
  if (Array.isArray(reservas) && reservas.length > 0) {
    const reservaSolapada = reservas.find((r) => {
      // Excluir reservas canceladas o rechazadas
      const rEstado = String(r.estado || '').toLowerCase();
      if (rEstado === 'cancelada' || rEstado === 'rechazada' || rEstado === 'anulada' || rEstado === 'i') return false;
      if (Number(r.id_estado_reserva) === 4 || Number(r.id_estado_reserva) === 5) return false;

      const rCanchaId = Number(r.id_cancha ?? r.cancha_id ?? r.idCancha);
      if (rCanchaId !== courtIdNum) return false;

      const rFecha = String(r.fecha_reserva ?? r.fecha ?? r.fechaReserva ?? '').split('T')[0].split(' ')[0];
      if (rFecha !== dateStr) return false;

      const rInicio = normalizeTimeString(r.hora_inicio ?? r.horaInicio);
      const rFin = normalizeTimeString(r.hora_fin ?? r.horaFin);

      return isTimeOverlap(rInicio, rFin, slotStartStr, slotEndStr);
    });

    if (reservaSolapada) {
      return {
        id,
        dateStr,
        hour,
        time,
        state: 'occupied',
        price,
        isNight,
        reason: 'Turno ocupado',
      };
    }
  }

  // 5. Turno disponible
  return {
    id,
    dateStr,
    hour,
    time,
    state: 'available',
    price,
    isNight,
  };
}

export function buildBookingBlock(
  slots: { id?: string; dateStr: string; dayDisplay?: string; hour: number; price: number }[],
  nightStartHour = 18,
): BookingBlock {
  if (!slots || slots.length === 0) {
    return {
      isValid: false,
      durationHours: 0,
      tranches: [],
      subtotal: 0,
    };
  }

  // 1. Validar que todos los turnos pertenezcan a la misma fecha
  const dates = [...new Set(slots.map((s) => s.dateStr))];
  if (dates.length > 1) {
    return {
      isValid: false,
      errorMessage: 'Los turnos seleccionados deben pertenecer a la misma fecha. Por favor selecciona horarios de un solo día.',
      durationHours: slots.length,
      tranches: [],
      subtotal: slots.reduce((acc, s) => acc + s.price, 0),
    };
  }

  // 2. Ordenar cronológicamente por hora ascendente (independientemente del orden de selección)
  const sorted = [...slots].sort((a, b) => a.hour - b.hour);

  // 3. Validar continuidad estricta (sin huecos entre horas seleccionadas)
  for (let i = 0; i < sorted.length - 1; i++) {
    if (sorted[i + 1].hour !== sorted[i].hour + 1) {
      const gapStart = `${pad2(sorted[i].hour + 1)}:00`;
      const gapEnd = `${pad2(sorted[i + 1].hour)}:00`;
      return {
        isValid: false,
        errorMessage: `Existe un hueco no seleccionado entre las ${gapStart} y las ${gapEnd}. Los turnos deben ser horas continuas en la misma cancha.`,
        durationHours: slots.length,
        tranches: [],
        subtotal: sorted.reduce((acc, s) => acc + s.price, 0),
      };
    }
  }

  // 4. Bloque continuo válido: derivar inicio, fin, tramos y precio
  const startHour = sorted[0].hour;
  const endHour = sorted[sorted.length - 1].hour + 1;
  const timeStart = `${pad2(startHour)}:00`;
  const timeEnd = endHour === 24 ? '00:00' : `${pad2(endHour)}:00`;
  const displayRange = `${timeStart} - ${timeEnd}`;
  const durationHours = sorted.length;
  const dateStr = sorted[0].dateStr;
  const dayDisplay = sorted[0].dayDisplay || dateStr;
  const fullLabel = `${dayDisplay}: ${displayRange} (${durationHours} ${durationHours === 1 ? 'hora' : 'horas continuas'})`;

  const tranches: BookingTranche[] = sorted.map((s) => {
    const isNight = s.hour >= nightStartHour;
    const tEnd = s.hour + 1 === 24 ? '00:00' : `${pad2(s.hour + 1)}:00`;
    return {
      hour: s.hour,
      timeStart: `${pad2(s.hour)}:00`,
      timeEnd: tEnd,
      displayTime: `${pad2(s.hour)}:00 - ${tEnd}`,
      price: s.price,
      isNight,
      rateType: isNight ? 'Noche' : 'Día',
    };
  });

  const subtotal = tranches.reduce((sum, t) => sum + t.price, 0);

  return {
    isValid: true,
    dateStr,
    dayDisplay,
    timeStart,
    timeEnd,
    durationHours,
    displayRange,
    fullLabel,
    tranches,
    subtotal,
  };
}

