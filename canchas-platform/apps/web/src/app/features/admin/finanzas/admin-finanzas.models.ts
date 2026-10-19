export interface FacturableRow {
  codigo: string;
  codigoCorto: string;
  fechaLabel: string;
  canchaNombre: string;
  servicio: string;
  metodo: string;
  metodoIcon: string;
  monto: number;
  comision: number;
  neto: number;
  liquidado: boolean;
}

export interface LiquidacionHistorialItem {
  id: string;
  codigo: string;
  fecha: string;
  destino: string;
  referencia: string;
  monto: number;
  estado: 'transferido' | 'pendiente' | 'procesando';
}

export interface CanalPagoItem {
  nombre: string;
  porcentaje: number;
  color: string;
  monto: number;
}

export type FiltroFacturablesTab = 'all' | 'pendiente' | 'liquidado';

export interface ColumnasVisibilidad {
  codigo: boolean;
  fecha: boolean;
  cancha: boolean;
  servicio: boolean;
  metodo: boolean;
  monto: boolean;
  comision: boolean;
  neto: boolean;
  liquidado: boolean;
}
