export type CourtType = 'Grass 5' | 'Grass 7' | 'techada';

export interface Court {
  id: string;
  nombre: string;
  tipo: CourtType;
  precioHora: number;
  disponible: boolean;
  foto?: string;
}