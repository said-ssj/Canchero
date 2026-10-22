export type BookingStatus = 'PENDIENTE' | 'CONFIRMADO' | 'EN_JUEGO' | 'FINALIZADO' | 'CANCELADO' | 'EN_REVISION';

export interface Booking {
  id: string;
  id_reserva?: number;
  codigoPase: string;
  codigo_pase?: string;
  courtName: string;
  venueName: string;
  venueId: string;
  fecha: string;
  fecha_reserva?: string;
  horario: string;
  hora_inicio?: string;
  hora_fin?: string;
  total: number;
  monto_total?: number;
  status: BookingStatus;
  jugadores?: string[];
  courtId?: string;
  paymentStatus?: string;
  paidAmount?: number;
  balanceAmount?: number;
  paymentMethod?: string;
  paymentOperationNumber?: string;
}