export type AlertaOperativaTipo = 'pagos' | 'reservas' | 'contacto' | 'resenas';

export interface AlertaOperativaConfig {
  id: AlertaOperativaTipo;
  titulo: string;
  descripcion: string;
  esUrgente?: boolean;
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
    id: 'pagos',
    titulo: 'Pago pendiente de verificación (Yape / Plin)',
    descripcion: 'Alerta inmediata con captura adjunta de comprobante bancario para liberar el turno en el panel.',
    esUrgente: true,
  },
  {
    id: 'reservas',
    titulo: 'Nueva reserva confirmada',
    descripcion: 'Aviso de bloqueo de losa con nombre del cliente, horario e importe acordado en el sistema.',
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
    descripcion: 'Comentarios y valoraciones de jugadores que finalizaron su partido en el complejo.',
    esUrgente: false,
  },
];

export const CUENTAS_BANCARIAS_DEFECTO: CuentaBancariaItem[] = [
  {
    id: 'bcp',
    banco: 'BCP',
    tipo: 'Cuenta Corriente Soles',
    numeroEnmascarado: '•••• 4910',
    cci: '002-194-0024910-18',
    esPrincipal: true,
  },
  {
    id: 'interbank',
    banco: 'Interbank',
    tipo: 'Soles Empresarial',
    numeroEnmascarado: '•••• 8821',
    cci: '003-200-0188210-92',
    esPrincipal: false,
  },
];

export const COMPROBANTES_LIQUIDACION_HISTORIAL: ComprobanteLiquidacionItem[] = [
  {
    codigo: 'LC-0921',
    periodo: 'Octubre 2024',
    fecha: '2024-10-31',
    alquileresBrutos: 18400.0,
    comisionMonto: 920.0,
    netoTransferido: 17480.0,
  },
  {
    codigo: 'LC-0840',
    periodo: 'Septiembre 2024',
    fecha: '2024-09-30',
    alquileresBrutos: 17600.0,
    comisionMonto: 880.0,
    netoTransferido: 16720.0,
  },
];
