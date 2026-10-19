export interface DenominacionMonetaria {
  id: number;
  valor: number;
  tipo: 'Billete' | 'Moneda';
  label: string;
  icono: string;
}

export interface ArqueoFila {
  denominacion: DenominacionMonetaria;
  cantidad: number;
  subtotal: number;
}

export interface MovimientoManualCaja {
  id: string;
  sesionId: number;
  tipo: 'ingreso' | 'egreso';
  monto: number;
  concepto: string;
  hora: string;
  autorizadoPor: string;
}

export interface SesionCaja {
  id: number;
  id_sesion_caja?: number;
  cajaId: number;
  cajaNombre: string;
  nombre_identificador?: string;
  sedeId: number;
  cajeroNombre: string;
  cajeroEmail: string;
  cajeroCorreo?: string;
  fechaApertura: string;
  montoApertura: number;
  fechaCierre?: string;
  montoCierre?: number;
  montoSistema?: number;
  diferencia?: number;
  estado: 'abierta' | 'cerrada';
  estadoBalance?: 'cuadrada' | 'faltante' | 'sobrante';
  observacionesCierre?: string;
  resumen?: {
    pagosEfectivo: number;
    pagosDigital: number;
    ingresosManuales: number;
    egresosManuales: number;
    totalReservasAtendidas: number;
  };
}

export interface ArqueoRegistro {
  id: string;
  sesionId: number;
  cajaNombre: string;
  cajeroNombre: string;
  fechaArqueo: string;
  filas: ArqueoFila[];
  totalEfectivoFisico: number;
  montoApertura: number;
  totalPagosEfectivo: number;
  totalIngresos: number;
  totalEgresos: number;
  montoSistema: number;
  diferencia: number;
  balanceEstado: 'cuadrada' | 'faltante' | 'sobrante';
  observaciones?: string;
  desgloseDisponible?: boolean;
}
