import type { Court } from './court.model';
export type { Court } from './court.model';

export interface Venue {
  id: string;
  nombre: string;
  ciudad: string;
  distrito: string;
  direccion: string;
  latitud?: number;
  longitud?: number;
  rating: number;
  precioBase: number;
  fotos: string[];
  amenidades: string[];
  canchas: Court[];
  favorita?: boolean;
  descripcion?: string;
  telefono?: string;
  ruc_facturacion?: string;
  adelanto_minimo_porcentaje?: number;
}