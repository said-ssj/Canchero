export type CourtType = 'Grass 7' | 'Grass 5' | 'Futsal' | 'techada';

export interface Court {
  id: string;
  nombre: string;
  tipo: CourtType;
  precioHora: number;
  disponible: boolean;
  foto?: string | null;
}