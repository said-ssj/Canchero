export type TipoComprobante = 'boleta' | 'factura' | 'ticket';
export type MetodoPagoPOS = 'efectivo' | 'yape' | 'plin' | 'tarjeta' | 'mixto' | 'sin_desglose';

export interface CategoriaProducto {
  id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
}

export interface Producto {
  id: number;
  sedeId?: number;
  categoriaId: number;
  categoriaNombre: string;
  codigoBarras: string;
  nombre: string;
  precioCompra: number;
  precioVenta: number;
  stock: number;
  stockMinimo: number;
  fotoUrl?: string;
  icono?: string;
}

export interface ItemCarritoPOS {
  producto: Producto;
  cantidad: number;
  subtotal: number;
}

export interface VentaPOS {
  id: string;
  sedeId?: number;
  fecha: string;
  cajaId?: number;
  cajeroNombre: string;
  clienteNombre?: string;
  clienteDocumento?: string; // DNI o RUC
  tipoComprobante: TipoComprobante;
  numeroComprobante: string;
  items: {
    productoId: number;
    nombre: string;
    cantidad: number;
    precioUnitario: number;
    subtotal: number;
  }[];
  subtotal: number; // Base imponible = Total / 1.18
  igv: number;      // IGV (18%) = Total - Subtotal
  total: number;    // ∑ (Cantidad * Precio Venta)
  metodoPago: MetodoPagoPOS;
  montoPagado?: number;
  vuelto?: number;
  pagos?: { metodoPago: string; monto: number; montoRecibido: number }[];
  estado: 'completada' | 'anulada';
}

export interface MovimientoKardex {
  id: number;
  sedeId?: number;
  productoId: number;
  productoNombre: string;
  fecha: string;
  tipo: '+' | '-';
  cantidad: number;
  precioUnitario: number;
  saldoStock: number;
  motivo: string;
  documentoRef?: string;
}
