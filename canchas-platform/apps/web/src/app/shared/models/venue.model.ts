import type { Court } from './court.model';
export type { Court } from './court.model';

export interface Venue {
  id: string;
  nombre: string;
  ciudad: string;
  distrito: string;
  direccion: string;
  rating: number;
  precioBase: number;
  fotos: string[];
  amenidades: string[];
  canchas: Court[];
  favorita?: boolean;
  descripcion?: string;
  telefono?: string;
}