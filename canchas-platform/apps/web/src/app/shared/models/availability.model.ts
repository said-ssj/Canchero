export type SlotState = 'available' | 'occupied' | 'blocked' | 'closed' | 'past';

export interface CourtSlotAvailability {
  id: string; // `${dateStr}_${hour}`
  dateStr: string;
  hour: number;
  time: string; // "18:00 - 19:00"
  state: SlotState;
  price: number;
  isNight: boolean;
  reason?: string;
}

export interface WeekAvailabilityResult {
  courtId: string;
  weekStart: string; // YYYY-MM-DD (Lunes)
  weekEnd: string;   // YYYY-MM-DD (Domingo)
  slots: Record<string, CourtSlotAvailability>;
  loading: boolean;
  error: string | null;
}

export interface BookingTranche {
  hour: number;
  timeStart: string;
  timeEnd: string;
  displayTime: string;
  price: number;
  isNight: boolean;
  rateType: 'Día' | 'Noche';
}

export interface BookingBlock {
  isValid: boolean;
  errorMessage?: string;
  dateStr?: string;
  dayDisplay?: string;
  timeStart?: string;
  timeEnd?: string;
  durationHours: number;
  displayRange?: string;
  fullLabel?: string;
  tranches: BookingTranche[];
  subtotal: number;
}

