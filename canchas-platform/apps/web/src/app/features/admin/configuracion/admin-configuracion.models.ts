export type AlertaOperativaTipo = 'pagos' | 'stock' | 'reservas' | 'contacto' | 'resenas';

export interface AlertaOperativaConfig {
  id: AlertaOperativaTipo;
  titulo: string;
  descripcion: string;
  esUrgente?: boolean;
  disponible?: boolean;
}

export interface CuentaBancariaItem {
  id: string;
  banco: string;
  tipo: string;
  numeroEnmascarado: string;
  cci: string;
  esPrincipal: boolean;
}

export type FrecuenciaLiquidacion = 'Semanal (Lunes)' | 'Quincenal' | 'Mensual';

export interface ComprobanteLiquidacionItem {
  codigo: string;
  periodo: string;
  fecha: string;
  comisionMonto: number;
  alquileresBrutos: number;
  netoTransferido: number;
}

export interface ConfiguracionPerfilState {
  razonSocial: string;
  ruc: string;
  email: string;
  telefono: string;
}

export const ALERTAS_SISTEMA_DEFINICION: AlertaOperativaConfig[] = [
  {
    id: 'stock',
    titulo: 'Stock bajo',
    descripcion: 'Productos por debajo del mínimo de la sede.',
    disponible: true,
  },
  {
    id: 'pagos',
    titulo: 'Reservas con verificación manual pendiente',
    descripcion:
      'Avisos de abonos que requieren revisión. Mercado Pago se verifica automáticamente.',
    esUrgente: true,
    disponible: true,
  },
  {
    id: 'reservas',
    titulo: 'Nueva reserva confirmada',
    descripcion:
      'Aviso de bloqueo de losa con nombre del cliente, horario e importe acordado en el sistema.',
    esUrgente: false,
  },
  {
    id: 'contacto',
    titulo: 'Mensaje desde formulario de contacto',
    descripcion: 'Consultas de clientes por torneos, eventos o alquileres corporativos especiales.',
    esUrgente: false,
  },
  {
    id: 'resenas',
    titulo: 'Reseña y calificación recibida',
    descripcion:
      'Comentarios y valoraciones de jugadores que finalizaron su partido en el complejo.',
    esUrgente: false,
  },
];

// Sin proveedor bancario conectado no hay cuentas ni liquidaciones verificadas.
export const CUENTAS_BANCARIAS_DEFECTO: CuentaBancariaItem[] = [];
export const COMPROBANTES_LIQUIDACION_HISTORIAL: ComprobanteLiquidacionItem[] = [];
