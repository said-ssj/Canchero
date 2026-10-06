export type BookingStatus = 'PENDIENTE' | 'CONFIRMADO' | 'EN_JUEGO' | 'FINALIZADO' | 'CANCELADO' | 'EN_REVISION';

export interface Booking {
  id: string;
  codigoPase: string;
  courtName: string;
  venueName: string;
  venueId: string;
  fecha: string;
  horario: string;
  total: number;
  status: BookingStatus;
  jugadores?: string[];
}