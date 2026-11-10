export type EstadoCuentaCredito = 'PENDIENTE' | 'VENCIDA' | 'CANCELADA' | 'TODOS';

export interface AbonoCredito {
  id: number;
  cuentaId: number;
  sesionCajaId?: number | null;
  fecha: string;
  monto: number;
  medioPago: 'efectivo' | 'yape' | 'plin' | 'tarjeta';
  nroOperacion?: string | null;
  observacion?: string | null;
  cajeroNombre: string;
}

export interface CuentaPorCobrar {
  id: number;
  sedeId: number;
  clienteNombre: string;
  clienteDocumento?: string;
  telefono?: string;
  equipo?: string;
  montoOriginal: number;
  saldo: number;
  totalAbonado: number;
  concepto: string;
  fechaEmision: string;
  fechaVencimiento: string;
  estado: 'PENDIENTE' | 'VENCIDA' | 'CANCELADA';
  abonos: AbonoCredito[];
}

export interface CreditSummary {
  totalPorCobrar: number;
  totalVencido: number;
  totalCobradoMes: number;
  clientesDeudores: number;
  cuentasVencidas: number;
}

export interface CrearCuentaCreditoRequest {
  sedeId: number;
  clienteNombre: string;
  clienteDocumento?: string;
  telefono?: string;
  equipo?: string;
  montoOriginal: number;
  concepto: string;
  fechaVencimiento?: string;
}

export interface RegistrarAbonoRequest {
  cuentaId: number;
  monto: number;
  medioPago: 'efectivo' | 'yape' | 'plin' | 'tarjeta';
  nroOperacion?: string;
  sesionCajaId?: number;
  observacion?: string;
}
