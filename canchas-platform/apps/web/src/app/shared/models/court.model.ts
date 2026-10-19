export type CourtFormat =
  | 'Fútbol 5'
  | 'Fútbol 6'
  | 'Fútbol 7'
  | 'Fútbol 8'
  | 'Fútbol 9'
  | 'Fútbol 11'
  | 'Fútbol Playa';

export type CourtSurface =
  | 'Grass Sintético'
  | 'Césped Natural'
  | 'Losa Deportiva'
  | 'Piso de Madera'
  | 'Piso de Goma'
  | 'Arena';

export type CourtCoverage =
  | 'Al Aire Libre'
  | 'Techada'
  | 'Techada con Lona'
  | 'Completamente Cerrada';

export type CourtType = CourtFormat | string;

export interface Court {
  id: string;
  id_cancha?: number;
  id_sede?: number;
  nombre: string;
  nombre_numero?: string;
  tipo: CourtType;
  formato?: CourtFormat | string;
  superficie?: CourtSurface | string;
  cobertura?: CourtCoverage | string;
  techada?: boolean;
  equipamiento?: string[];
  precioHora: number;
  precioHoraNoche?: number;
  horaInicioNoche?: string;
  disponible: boolean;
  foto?: string | null;
  foto_url?: string | null;
  usar_horario_sede?: boolean;
  horarios_semana?: any[];
  descansos_recurrentes?: any[];
}