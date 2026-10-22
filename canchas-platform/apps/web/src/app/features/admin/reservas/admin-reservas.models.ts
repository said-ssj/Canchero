import type { Reserva } from '@core/supabase/legacy.types';

export interface CourtOption {
  id: number;
  nombre: string;
  precio_hora?: number;
  precio_hora_noche?: number;
  hora_inicio_noche?: string;
  tipo?: string;
  superficie?: string;
}

export interface AdminReservationRow {
  reserva: Reserva;
  codigoPase: string;
  codigoCorto: string;
  horario: string;
  fechaLabel: string;
  canchaNombre: string;
  canchaTag1: string;
  canchaTag2: string;
  jugadorNombre: string;
  telefono: string;
  iniciales: string;
  estado: Reserva['estado'];
  monto: number;
  montoTotal: number;
  adelanto: number;
  saldo: number;
  esClienteSinCuenta: boolean;
  checkInRealizado: boolean;
  metodo: string;
  metodoIcon: string;
  operacion: string;
  waLink: string;
}

export type ReservationFilter = 'pendientes' | 'hoy' | 'semana' | 'todas';

export type ReservationAction =
  | { kind: 'approve'; reservationId: number }
  | { kind: 'reject'; reservationId: number }
  | { kind: 'cobrarSaldo'; reservationId: number; metodoPago: string; monto: number; numeroOperacion?: string }
  | { kind: 'checkIn'; reservationId: number }
  | { kind: 'cancelWithRefund'; reservationId: number; motivo: string; montoDevolucion: number };

export interface NuevaReservaPresencialInput {
  canchaId: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  esClienteSinCuenta: boolean;
  nombreCliente: string;
  telefonoCliente: string;
  montoTotal: number;
  montoAdelanto: number;
  saldoPendiente: number;
  metodoPago: string;
  numeroOperacion?: string;
}

export interface TimeTrancheBreakdown {
  tranche: string;
  price: number;
  isNight: boolean;
}
