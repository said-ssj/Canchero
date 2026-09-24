// ============================================================================
// TIPOS TYPESCRIPT SUPABASE — Esquema Relacional Oficial Canchero.MVP
// Las 11 tablas del modelo de datos + campos de auditoría incrustados.
// Identificadores numéricos (serial) y fechas/horas en string ISO/JSON.
// ============================================================================

export type RolUsuario = 'cliente' | 'dueno' | 'operador' | 'admin';

export interface Usuario {
  id: number;
  nombre: string;
  email: string;
  password_hash: string;
  telefono?: string;
  rol: RolUsuario;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
  creado_por?: number;
  actualizado_por?: number;
}

export interface Sede {
  id: number;
  dueno_id: number;
  nombre: string;
  direccion: string;
  distrito: string;
  ciudad: string;
  telefono?: string;
  descripcion?: string;
  imagen_url?: string;
  rating?: number;
  banco?: string;
  cuenta_bancaria?: string;
  cci?: string;
  titular_cuenta?: string;
  ruc_facturacion?: string;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
  creado_por?: number;
  actualizado_por?: number;
}

export interface Cancha {
  id: number;
  sede_id: number;
  nombre: string;
  tipo: string;
  superficie?: string;
  precio_hora: number;
  precio_hora_noche?: number;
  activa: boolean;
  foto_url?: string;
  equipamiento?: string[];
  creado_en: string;
  actualizado_en: string;
  creado_por?: number;
  actualizado_por?: number;
}

export type EstadoReserva = 'pendiente' | 'confirmada' | 'cancelada' | 'completada';

export interface Reserva {
  id: number;
  cancha_id: number;
  usuario_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  estado: EstadoReserva;
  codigo_pase?: string;
  notas?: string;
  creado_en: string;
  actualizado_en: string;
  creado_por?: number;
  actualizado_por?: number;
}

export type MetodoPago = 'Yape' | 'Plin' | 'Efectivo Counter' | 'POS Tarjeta' | 'Transferencia';
export type EstadoPago = 'pendiente' | 'completado' | 'fallido' | 'reembolsado';
export type EstadoLiquidacion = 'pendiente' | 'transferido' | 'retenido';
export type EstadoCaja = 'abierta' | 'cerrada' | 'auditada';

export interface Pago {
  id: number;
  reserva_id: number;
  monto: number;
  comision_plataforma: number;
  monto_neto_dueno: number;
  metodo_pago: MetodoPago;
  estado: EstadoPago;
  codigo_operacion?: string;
  comprobante_url?: string;
  estado_liquidacion: EstadoLiquidacion;
  fecha_liquidacion?: string;
  fecha_pago: string;
  creado_en: string;
  actualizado_en: string;
  creado_por?: number;
  actualizado_por?: number;
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
  creado_en: string;
  creado_por?: number;
}

export interface ConfiguracionPrecio {
  id: number;
  cancha_id: number;
  dia_semana?: number;
  hora_inicio: string;
  hora_fin: string;
  precio_especial: number;
  incluye_luces: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface Producto {
  id: number;
  sede_id: number;
  nombre: string;
  tipo: string;
  precio: number;
  stock: number;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
  creado_por?: number;
  actualizado_por?: number;
}

export interface DetalleVentaExtra {
  id: number;
  reserva_id: number;
  producto_id: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  creado_en: string;
}

export interface AuditoriaCaja {
  id: number;
  sede_id: number;
  usuario_id: number;
  monto_inicial: number;
  monto_final_esperado?: number;
  monto_final_real?: number;
  diferencia: number;
  estado: EstadoCaja;
  fecha_apertura: string;
  fecha_cierre?: string;
  observaciones?: string;
}

/** Snapshot completo persistido en localStorage bajo `canchero_db_v2`. */
export interface DatabaseSnapshot {
  version: number;
  usuarios: Usuario[];
  sedes: Sede[];
  canchas: Cancha[];
  reservas: Reserva[];
  pagos: Pago[];
  horarios: HorarioAtencion[];
  bloqueos: BloqueoMantenimiento[];
  config_precios: ConfiguracionPrecio[];
  productos: Producto[];
  detalle_ventas: DetalleVentaExtra[];
  auditorias: AuditoriaCaja[];
}

/** Métricas financieras por dueño. */
export interface MetricasDueno {
  ingresoBruto: number;
  comisionApp: number;
  ingresoNeto: number;
  liquidacionesPendientes: number;
  totalLiquidado: number;
}