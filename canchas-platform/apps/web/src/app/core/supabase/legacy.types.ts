// Transitional types still used by the admin view.
export interface Reserva {
  // Legacy properties
  id: number;
  cancha_id: number;
  usuario_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: 'pendiente' | 'confirmada' | 'completada' | 'cancelada';
  codigo_pase: string;
  creado_en: string;
  actualizado_en: string;

  // Real Supabase properties
  id_reserva?: number;
  id_cliente?: string;
  id_estado_reserva?: number;
  id_usuario?: string | null;
  fecha_reserva?: string;
  monto_total?: number;
  adelanto?: number;
  saldo?: number;
  estado_real?: 'A' | 'I';
  feccre?: string;
  fecmod?: string | null;
  usucre?: string;
  pccre?: string;
  pcmod?: string | null;
  // Guest client and deposit properties
  nombre_cliente?: string;
  telefono_cliente?: string;
  es_cliente_sin_cuenta?: boolean;
  porcentaje_adelanto?: number;
  check_in_realizado?: boolean;
  devolucion_monto?: number;
  motivo_cancelacion?: string;
}

export interface HorarioAtencion {
  id: number;
  sede_id: number;
  dia_semana: number;
  hora_apertura: string;
  hora_cierre: string;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface BloqueoMantenimiento {
  id: number;
  cancha_id: number;
  motivo: string;
  fecha_inicio: string;
  fecha_fin: string;
  recurrente: boolean;
  dia_semana?: number;
  creado_en: string;
  creado_por: number;
}

export interface NuevaReservaPresencialInput {
  canchaId: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  esClienteSinCuenta: boolean;
  nombreCliente: string;
  telefonoCliente: string;
  montoTotal: number;
  montoAdelanto: number;
  saldoPendiente: number;
  metodoPago: string;
  numeroOperacion?: string;
}
