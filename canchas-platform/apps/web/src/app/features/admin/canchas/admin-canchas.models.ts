// Shape consumed by the current admin; distinct from the public Court DTO.
import type { VenueDayHours } from '@shared/models/venue-hours.model';

export interface DescansoRecurrente {
  id: string;
  nombre: string;
  dias: number[]; // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb
  hora_inicio: string; // HH:mm
  hora_fin: string; // HH:mm (admite terminar al día siguiente)
  activo: boolean;
}

export interface CierreCancha {
  id: number | string;
  cancha_id?: number | null; // null si es cierre de toda la sede
  sede_id: number;
  alcance: 'cancha' | 'sede';
  tipo: 'inmediato' | 'programado';
  motivo: string;
  fecha_inicio: string; // YYYY-MM-DDTHH:mm o YYYY-MM-DD
  fecha_fin?: string | null;
  activo: boolean;
  creado_en?: string;
}

export interface ReservaAfectada {
  reservaId: number;
  codigoPase: string;
  canchaId: number;
  canchaNombre: string;
  jugadorNombre: string;
  telefono: string;
  fecha: string;
  horario: string;
  monto: number;
  estado: string;
}

export interface AdminCourt {
  id: number;
  sede_id: number;
  nombre: string;
  tipo?: string;
  formato?: string;
  superficie?: string;
  cobertura?: string;
  techada?: boolean;
  equipamiento?: string[];
  precio_hora: number;
  precio_hora_noche?: number;
  hora_inicio_noche?: string; // Configurable, default '18:00'
  activa: boolean;
  foto_url?: string;
  fotos?: string[];
  descripcion?: string;
  usar_horario_sede?: boolean; // true = común de sede, false = individual
  horarios_semana?: VenueDayHours[];
  descansos_recurrentes?: DescansoRecurrente[];
}

export interface AdminVenueOption {
  id: number;
  nombre: string;
  ciudad?: string;
}
