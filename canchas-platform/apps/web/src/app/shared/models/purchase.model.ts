export interface Proveedor {
  id: number;
  sedeId?: number | null;
  ruc: string;
  razonSocial: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
  estado: 'A' | 'I';
}

export interface CrearProveedorPayload {
  sedeId: number;
  ruc: string;
  razonSocial: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
}

export type TipoComprobanteCompra = 'factura' | 'boleta' | 'guia' | 'orden';
export type EstadoCompra = 'BORRADOR' | 'EMITIDA' | 'RECIBIDA' | 'ANULADA';

export interface PartidaCompra {
  productoId: number;
  productoNombre?: string;
  cantidad: number;
  costoUnitario: number;
  subtotal: number;
}

export interface Compra {
  id: number;
  sedeId: number;
  proveedorId: number;
  proveedorNombre: string;
  proveedorRuc: string;
  numeroComprobante: string;
  tipoComprobante: TipoComprobanteCompra;
  fechaEmision: string;
  fechaEntregaEstimada?: string | null;
  fechaRecepcion?: string | null;
  subtotal: number;
  igv: number;
  total: number;
  estado: EstadoCompra;
  observacion?: string | null;
  items: PartidaCompra[];
}

export interface CrearCompraPayload {
  sedeId: number;
  proveedorId: number;
  numeroComprobante: string;
  tipoComprobante: TipoComprobanteCompra;
  fechaEntregaEstimada?: string | null;
  observacion?: string | null;
  recibirInmediatamente: boolean;
  items: {
    productoId: number;
    cantidad: number;
    costoUnitario: number;
  }[];
}
