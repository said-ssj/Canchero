export type TipoComprobante = 'boleta' | 'factura' | 'ticket';
export type MetodoPagoPOS = 'efectivo' | 'yape' | 'plin' | 'tarjeta' | 'mixto' | 'sin_desglose';

export interface CategoryIconOption {
  icon: string;
  label: string;
  grupo: 'Bebidas' | 'Comidas' | 'Deportes' | 'Indumentaria' | 'Salud' | 'General';
}

export const CATEGORY_ICON_OPTIONS: CategoryIconOption[] = [
  // Bebidas
  { icon: 'local_drink', label: 'Bebidas / Refrescos', grupo: 'Bebidas' },
  { icon: 'water_drop', label: 'Agua mineral', grupo: 'Bebidas' },
  { icon: 'water_bottle', label: 'Botella de agua', grupo: 'Bebidas' },
  { icon: 'sports_bar', label: 'Cerveza / Bar', grupo: 'Bebidas' },
  { icon: 'liquor', label: 'Licores / Botellas', grupo: 'Bebidas' },
  { icon: 'wine_bar', label: 'Vino / Copa', grupo: 'Bebidas' },
  { icon: 'coffee', label: 'Café', grupo: 'Bebidas' },
  { icon: 'local_cafe', label: 'Taza de café / Té', grupo: 'Bebidas' },
  { icon: 'emoji_food_beverage', label: 'Infusiones', grupo: 'Bebidas' },
  { icon: 'glass_cup', label: 'Vaso', grupo: 'Bebidas' },
  { icon: 'takeout_dining', label: 'Bebida para llevar', grupo: 'Bebidas' },

  // Comidas y Snacks
  { icon: 'fastfood', label: 'Hamburguesas / Fast Food', grupo: 'Comidas' },
  { icon: 'local_pizza', label: 'Pizza', grupo: 'Comidas' },
  { icon: 'restaurant', label: 'Platos / Menú', grupo: 'Comidas' },
  { icon: 'lunch_dining', label: 'Sandwiches / Bocadillos', grupo: 'Comidas' },
  { icon: 'cookie', label: 'Galletas / Golosinas', grupo: 'Comidas' },
  { icon: 'icecream', label: 'Helados / Paletas', grupo: 'Comidas' },
  { icon: 'bakery_dining', label: 'Panadería / Empanadas', grupo: 'Comidas' },
  { icon: 'tapas', label: 'Piques / Parrilla', grupo: 'Comidas' },
  { icon: 'kebab_dining', label: 'Brochetas / Anticuchos', grupo: 'Comidas' },
  { icon: 'ramen_dining', label: 'Sopas / Pastas', grupo: 'Comidas' },
  { icon: 'set_meal', label: 'Menú ejecutivo', grupo: 'Comidas' },
  { icon: 'egg', label: 'Huevos / Proteínas', grupo: 'Comidas' },
  { icon: 'nutrition', label: 'Snacks saludables', grupo: 'Comidas' },

  // Deportes
  { icon: 'sports_soccer', label: 'Fútbol / Pelotas', grupo: 'Deportes' },
  { icon: 'sports_tennis', label: 'Tenis / Pádel', grupo: 'Deportes' },
  { icon: 'sports_volleyball', label: 'Vóley', grupo: 'Deportes' },
  { icon: 'sports_basketball', label: 'Básquet', grupo: 'Deportes' },
  { icon: 'sports_handball', label: 'Balonmano', grupo: 'Deportes' },
  { icon: 'sports_baseball', label: 'Béisbol / Sóftbol', grupo: 'Deportes' },
  { icon: 'sports_kabaddi', label: 'Artes marciales / Contacto', grupo: 'Deportes' },
  { icon: 'fitness_center', label: 'Gimnasio / Pesas', grupo: 'Deportes' },
  { icon: 'pool', label: 'Piscina / Natación', grupo: 'Deportes' },
  { icon: 'skateboarding', label: 'Skate / Patinaje', grupo: 'Deportes' },
  { icon: 'kitesurfing', label: 'Surf / Deportes al aire libre', grupo: 'Deportes' },
  { icon: 'sports_esports', label: 'eSports / Juegos', grupo: 'Deportes' },
  { icon: 'sports', label: 'Arbitraje / Silbato', grupo: 'Deportes' },
  { icon: 'emoji_events', label: 'Copas / Trofeos', grupo: 'Deportes' },
  { icon: 'military_tech', label: 'Medallas / Premios', grupo: 'Deportes' },

  // Indumentaria
  { icon: 'checkroom', label: 'Indumentaria / Ropa', grupo: 'Indumentaria' },
  { icon: 'dry_cleaning', label: 'Chalecos / Camisetas', grupo: 'Indumentaria' },
  { icon: 'styler', label: 'Uniformes completos', grupo: 'Indumentaria' },
  { icon: 'apparel', label: 'Shorts / Pantalones', grupo: 'Indumentaria' },
  { icon: 'sports_score', label: 'Accesorios cancha', grupo: 'Indumentaria' },
  { icon: 'timer', label: 'Cronómetro', grupo: 'Indumentaria' },
  { icon: 'watch', label: 'Reloj de juego', grupo: 'Indumentaria' },

  // Salud & Botiquín
  { icon: 'medical_services', label: 'Botiquín / Salud', grupo: 'Salud' },
  { icon: 'healing', label: 'Curitas / Vendajes', grupo: 'Salud' },
  { icon: 'medication', label: 'Medicinas / Pastillas', grupo: 'Salud' },
  { icon: 'vaccines', label: 'Inyectables', grupo: 'Salud' },
  { icon: 'health_and_safety', label: 'Primeros auxilios', grupo: 'Salud' },

  // General & Ventas
  { icon: 'shopping_bag', label: 'Bolsa de compra / General', grupo: 'General' },
  { icon: 'storefront', label: 'Tienda física', grupo: 'General' },
  { icon: 'sell', label: 'Etiqueta / Descuento', grupo: 'General' },
  { icon: 'loyalty', label: 'Fidelidad / Puntos', grupo: 'General' },
  { icon: 'inventory_2', label: 'Cajas / Almacén', grupo: 'General' },
  { icon: 'redeem', label: 'Regalo / Promoción', grupo: 'General' },
  { icon: 'card_giftcard', label: 'Tarjeta de regalo', grupo: 'General' },
  { icon: 'category', label: 'Categoría genérica', grupo: 'General' },
];

export function inferirIconoCategoria(nombre: string): string {
  const n = (nombre || '').toLowerCase().trim();
  if (!n) return 'category';
  if (/rehidrat|bebida|agua|gaseosa|jugo|refresco|gatorade|powerade|sporade|liquido|san luis|cielo|frugos|red bull|monster|volt/.test(n)) {
    return 'local_drink';
  }
  if (/cerveza|pilsen|cristal|cusque|corona|heineken|bar|trago|licor|vino|whisky|ron|vodka|alcohol/.test(n)) {
    return 'sports_bar';
  }
  if (/snack|aperitivo|piqueo|galleta|doritos|lays|papas|chifles|mani|comida|sandwich|hamburguesa|pan|bocadito/.test(n)) {
    return 'fastfood';
  }
  if (/pelota|balon|balones|futbol|soccer/.test(n)) {
    return 'sports_soccer';
  }
  if (/indumentaria|ropa|camiseta|chaleco|short|medias|uniforme|canillera|guante/.test(n)) {
    return 'checkroom';
  }
  if (/accesorio|utilidad|implemento|cinta|silbato|inflador|aguja|red|malla/.test(n)) {
    return 'sports_score';
  }
  if (/botiquin|salud|medicina|primeros auxilios|venda|curita|hielo|spray/.test(n)) {
    return 'medical_services';
  }
  if (/tenis|padel|fronton|raqueta/.test(n)) {
    return 'sports_tennis';
  }
  if (/voley|voleibol/.test(n)) {
    return 'sports_volleyball';
  }
  if (/basquet|baloncesto/.test(n)) {
    return 'sports_basketball';
  }
  if (/favorito/.test(n)) {
    return 'star';
  }
  if (/todas|todos/.test(n)) {
    return 'apps';
  }
  return 'category';
}

export function parseCategoryIconAndDescription(
  descripcionRaw?: string | null,
  nombreCategoria?: string,
): { icono: string; descripcion: string } {
  const raw = descripcionRaw?.trim() || '';
  const match = raw.match(/^\[icon:([a-z0-9_]+)\]\s*(.*)$/i);
  if (match) {
    return {
      icono: match[1],
      descripcion: match[2]?.trim() || '',
    };
  }
  return {
    icono: inferirIconoCategoria(nombreCategoria || ''),
    descripcion: raw,
  };
}

export function encodeCategoryDescription(icono: string, descripcion?: string): string {
  const ic = icono?.trim() || 'category';
  const desc = descripcion?.trim() || '';
  return desc ? `[icon:${ic}] ${desc}` : `[icon:${ic}]`;
}

export interface CategoriaProducto {
  id: number;
  nombre: string;
  descripcion?: string;
  icono?: string;
  estado?: 'A' | 'I';
  totalProductos?: number;
  sedeId?: number;
}

export interface Producto {
  contenido?: number;
  unidadMedida?: string;
  descripcion?: string;
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
  estado?: 'A' | 'I';
  margenPorcentaje?: number;
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
  igv: number; // IGV (18%) = Total - Subtotal
  total: number; // ∑ (Cantidad * Precio Venta)
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

export type TipoAjusteInventario =
  | 'MERMA'
  | 'ROTURA'
  | 'VENCIMIENTO'
  | 'SOBRANTE'
  | 'FALTANTE'
  | 'CONTEO_SOBRANTE'
  | 'CONTEO_FALTANTE';

export interface AjusteInventarioRequest {
  productoId: number;
  sedeId: number;
  tipoAjuste: TipoAjusteInventario;
  cantidad: number;
  motivo: string;
}

export interface TransformacionRequest {
  sedeId: number;
  productoOrigenId: number;
  cantidadOrigen: number;
  productoDestinoId: number;
  cantidadDestino: number;
  motivo: string;
}

export interface TransformacionResultado {
  productoOrigenId: number;
  productoOrigenNombre: string;
  cantidadOrigen: number;
  stockFinalOrigen: number;
  productoDestinoId: number;
  productoDestinoNombre: string;
  cantidadDestino: number;
  stockFinalDestino: number;
  costoUnitarioDestino: number;
  fecha: string;
  motivo: string;
}

export interface ProyeccionVelocidadProducto {
  productoId: number;
  nombre: string;
  stockActual: number;
  stockMinimo: number;
  promedioDiarioVenta: number;
  diasRestantesEstimados: number | null;
  nivelAlerta: 'AGOTADO' | 'CRITICO' | 'ADVERTENCIA' | 'OPTIMO';
}

export interface ResumenInventario {
  sedeId: number;
  totalValorizado: number;
  totalUnidades: number;
  totalProductos: number;
  productosBajoStock: number;
  productosAgotados: number;
  movimientosMes: number;
  proyeccionesAgotamiento: ProyeccionVelocidadProducto[];
}
