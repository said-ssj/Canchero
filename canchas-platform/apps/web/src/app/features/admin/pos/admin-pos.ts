import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AdminContext } from '../admin-context.service';
import { CommonModule, DatePipe, UpperCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTableModule } from '@angular/material/table';
import { MAT_RIPPLE_GLOBAL_OPTIONS } from '@angular/material/core';
import { MatTooltipModule } from '@angular/material/tooltip';
import { PosService } from '@core/services/pos.service';
import { CajaService } from '@core/services/caja.service';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import type {
  MetodoPagoPOS,
  Producto,
  TipoComprobante,
  VentaPOS,
} from '@shared/models/pos.model';

@Component({
  standalone: true,
  selector: 'app-admin-pos',
  imports: [
    CommonModule,
    DatePipe,
    UpperCasePipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonToggleModule,
    MatTableModule,
    MatTooltipModule,
  ],
  templateUrl: './admin-pos.html',
  providers: [{ provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } }],
  styleUrl: './admin-pos.css',
})
export class AdminPos {
  private readonly context = inject(AdminContext);
  readonly venueIdInput = input<number | null | undefined>(undefined, { alias: 'venueId' });
  readonly venueId = computed(() => this.venueIdInput() !== undefined ? this.venueIdInput()! : this.context.venue()?.id ?? null);
  readonly venueNameInput = input<string | undefined>(undefined, { alias: 'venueName' });
  readonly venueName = computed(() => this.venueNameInput() !== undefined ? this.venueNameInput()! : this.context.venue()?.nombre ?? 'Sin sede seleccionada');
  readonly venueAddressInput = input<string | undefined>(undefined, { alias: 'venueAddress' });
  readonly venueAddress = computed(() => this.venueAddressInput() !== undefined ? this.venueAddressInput()! : this.context.venue()?.direccion ?? '');
  readonly venuePhoneInput = input<string | undefined>(undefined, { alias: 'venuePhone' });
  readonly venuePhone = computed(() => this.venuePhoneInput() !== undefined ? this.venuePhoneInput()! : this.context.venue()?.telefono ?? '');
  readonly adminNameInput = input<string | undefined>(undefined, { alias: 'adminName' });
  readonly adminName = computed(() => this.adminNameInput() !== undefined ? this.adminNameInput()! : this.auth.currentUser()?.nombre ?? '');
  readonly loadingInput = input<boolean | undefined>(undefined, { alias: 'loading' });
  readonly loading = computed(() => this.loadingInput() !== undefined ? this.loadingInput()! : this.context.loading() || (this.posService.loading?.() ?? false));
  readonly errorInput = input<string | undefined>(undefined, { alias: 'error' });
  readonly error = computed(() => this.errorInput() !== undefined ? this.errorInput()! : this.context.error() || (this.posService.loadError?.() ?? ''));

  readonly notice = output<string>();

  readonly posService = inject(PosService);
  readonly cajaService = inject(CajaService);
  protected readonly auth = inject(AuthService);
  protected readonly db = inject(DatabaseService);

  // Subpestañas del módulo POS
  readonly posSubTab = signal<'caja_pos' | 'kardex' | 'historial_ventas'>('caja_pos');
  readonly posKardexColumns = ['fecha', 'producto', 'operacion', 'cantidad', 'precio', 'saldo', 'motivo'];
  readonly posVentasColumns = ['numero', 'fecha', 'cliente', 'tipo', 'metodo', 'subtotal', 'igv', 'total', 'nota'];

  // Formulario y estado de cobro
  readonly posTipoComprobante = signal<TipoComprobante>('boleta');
  readonly posMetodoPago = signal<MetodoPagoPOS>('efectivo');
  readonly posClienteNombre = signal('Cliente Mostrador');
  readonly posClienteDocumento = signal('');
  readonly posMontoPagado = signal<number>(0);
  readonly montosRapidosPOS = [0.1, 0.2, 0.5, 1, 5, 10, 20, 50, 100, 200];

  // Modal ticket/comprobante de venta emitido
  readonly modalTicketVentaOpen = signal(false);
  readonly ventaEmitidaSeleccionada = signal<VentaPOS | null>(null);

  // Modal reposición de mercadería (Kardex +)
  readonly modalIngresoMercaderiaOpen = signal(false);
  readonly ingresoProductoId = signal<number>(1);
  readonly ingresoCantidad = signal<number>(12);
  readonly ingresoPrecioCompra = signal<number>(0);
  readonly ingresoMotivo = signal('Reposición semanal / Almacén');

  // Computeds de cálculo de vuelto y estado de pago
  readonly posVueltoCalculado = computed<number>(() => {
    if (this.posMetodoPago() !== 'efectivo') return 0;
    const pagado = this.posMontoPagado();
    const total = this.posService.totalCarrito();
    return Number(Math.max(0, pagado - total).toFixed(2));
  });

  readonly posPagoEstado = computed<'vacio' | 'insuficiente' | 'exacto' | 'sobrante'>(() => {
    if (this.posMetodoPago() !== 'efectivo') return 'vacio';
    const total = this.posService.totalCarrito();
    const pagado = this.posMontoPagado();
    if (total <= 0 || pagado <= 0) return 'vacio';
    const diferencia = Number((pagado - total).toFixed(2));
    if (diferencia < 0) return 'insuficiente';
    if (diferencia === 0) return 'exacto';
    return 'sobrante';
  });

  readonly posPagoResumenLabel = computed<string>(() => {
    const estado = this.posPagoEstado();
    if (estado === 'insuficiente') return 'FALTA POR COBRAR:';
    if (estado === 'exacto') return 'PAGO EXACTO:';
    return 'VUELTO A ENTREGAR:';
  });

  readonly posPagoResumenMonto = computed<number>(() => {
    const total = this.posService.totalCarrito();
    const pagado = this.posMontoPagado();
    if (this.posPagoEstado() === 'insuficiente') {
      return Number(Math.max(0, total - pagado).toFixed(2));
    }
    return this.posVueltoCalculado();
  });

  readonly posTabIndex = computed<number>(() => {
    const tab = this.posSubTab();
    if (tab === 'kardex') return 1;
    if (tab === 'historial_ventas') return 2;
    return 0;
  });

  switchPosSubTab(tab: 'caja_pos' | 'kardex' | 'historial_ventas'): void {
    this.posSubTab.set(tab);
  }

  setPosTabByIndex(index: number): void {
    const tabs: Array<'caja_pos' | 'kardex' | 'historial_ventas'> = ['caja_pos', 'kardex', 'historial_ventas'];
    this.posSubTab.set(tabs[index] ?? 'caja_pos');
  }

  agregarAlCarritoPOS(prod: Producto): void {
    try {
      this.posService.agregarAlCarrito(prod, 1);
      if (this.posMontoPagado() === 0) {
        this.posMontoPagado.set(this.posService.totalCarrito());
      }
    } catch (err: any) {
      this.notice.emit(err?.message || 'No se pudo agregar el producto');
    }
  }

  modificarCantidadCarritoPOS(productoId: number, delta: number): void {
    this.posService.modificarCantidadCarrito(productoId, delta);
    this.posMontoPagado.set(this.posService.totalCarrito());
  }

  eliminarDelCarritoPOS(productoId: number): void {
    this.posService.eliminarDelCarrito(productoId);
    this.posMontoPagado.set(this.posService.totalCarrito());
  }

  vaciarCarritoPOS(): void {
    this.posService.limpiarCarrito();
    this.posMontoPagado.set(0);
  }

  setCategoriaPOS(catId: number): void {
    this.posService.categoriaSeleccionada.set(catId);
  }

  onBuscarProductoPOS(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.posService.filtroBusqueda.set(input?.value || '');
  }

  setTipoComprobantePOS(tipo: TipoComprobante): void {
    this.posTipoComprobante.set(tipo);
  }

  setMetodoPagoPOS(metodo: MetodoPagoPOS): void {
    this.posMetodoPago.set(metodo);
    if (metodo !== 'efectivo') {
      this.posMontoPagado.set(this.posService.totalCarrito());
    }
  }

  setMontoPagadoPOS(event: Event): void {
    const input = event.target as HTMLInputElement;
    const num = parseFloat(input?.value) || 0;
    this.posMontoPagado.set(num);
  }

  setMontoRapidoPOS(monto: number): void {
    this.posMontoPagado.set(Number(monto.toFixed(2)));
  }

  tipoComprobanteLabel(tipo: TipoComprobante | string): string {
    if (tipo === 'boleta') return 'Boleta';
    if (tipo === 'factura') return 'Factura';
    if (tipo === 'ticket') return 'Nota de Venta';
    return 'Comprobante';
  }

  toggleFavoritoProductoPOS(productoId: number, event: Event): void {
    event.stopPropagation();
    this.posService.toggleFavoritoProducto(productoId);
  }

  esProductoFavoritoPOS(productoId: number): boolean {
    return this.posService.esProductoFavorito(productoId);
  }

  setClienteNombrePOS(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.posClienteNombre.set(input?.value || '');
  }

  setClienteDocumentoPOS(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.posClienteDocumento.set(input?.value || '');
  }

  readonly mediosMixtos = ['efectivo', 'yape', 'plin', 'tarjeta'] as const;
  readonly pagosMixtos = signal<Record<string, number>>({ efectivo: 0, yape: 0, plin: 0, tarjeta: 0 });

  setImporteMixto(medio: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    this.pagosMixtos.update(current => ({ ...current, [medio]: value }));
  }

  async procesarCobroPOS(): Promise<void> {
    if (this.posService.processing()) return;
    if (!this.cajaService.tieneSesionActiva()) {
      this.notice.emit('Se requiere un turno de caja abierto para registrar ventas');
      return;
    }
    const total = this.posService.totalCarrito();
    if (total <= 0) {
      this.notice.emit('El carrito está vacío. Agrega productos para cobrar.');
      return;
    }

    if (this.posMetodoPago() === 'efectivo') {
      const pagado = this.posMontoPagado();
      if (pagado < total) {
        this.notice.emit(
          `El efectivo recibido (S/ ${pagado.toFixed(2)}) es menor al total a cobrar (S/ ${total.toFixed(2)})`
        );
        return;
      }
    }

    try {
      const pagos = this.posMetodoPago() === 'mixto'
        ? this.mediosMixtos.filter(m => this.pagosMixtos()[m] > 0).map(metodoPago => ({ metodoPago, monto: this.pagosMixtos()[metodoPago] }))
        : undefined;
      if (pagos && Math.round(pagos.reduce((sum, p) => sum + p.monto, 0) * 100) !== Math.round(total * 100)) {
        this.notice.emit('La suma de los medios debe coincidir con el total.');
        return;
      }
      const venta = await this.posService.procesarVenta({
        tipoComprobante: this.posTipoComprobante(),
        metodoPago: this.posMetodoPago(),
        cajeroNombre: this.adminName() || 'Roberto Mendoza',
        clienteNombre: this.posClienteNombre(),
        clienteDocumento: this.posClienteDocumento(),
        montoPagado: this.posMetodoPago() === 'efectivo' ? this.posMontoPagado() : total,
        pagos,
      });

      this.ventaEmitidaSeleccionada.set(venta);
      this.modalTicketVentaOpen.set(true);
      this.posMontoPagado.set(0);
      this.notice.emit(`Venta exitosa: Comprobante ${venta.numeroComprobante} emitido`);
    } catch (err: any) {
      this.notice.emit(err?.error?.reason || err?.error?.message || err?.message || 'Error al procesar la venta');
    }
  }

  abrirModalTicketVenta(venta: VentaPOS): void {
    this.ventaEmitidaSeleccionada.set(venta);
    this.modalTicketVentaOpen.set(true);
  }

  cerrarModalTicketVenta(): void {
    this.modalTicketVentaOpen.set(false);
  }

  imprimirTicketPOS(): void {
    const contenido = document.getElementById('posReceiptPrintable')?.outerHTML;
    if (!contenido) {
      this.notice.emit('No se encontró el comprobante para imprimir.');
      return;
    }

    const ventana = window.open('', '_blank', 'width=420,height=720');
    if (!ventana) {
      this.notice.emit('El navegador bloqueó la ventana de impresión.');
      return;
    }

    ventana.document.write(`
      <!doctype html>
      <html>
        <head>
          <title>Comprobante de venta</title>
          <style>
            @page { size: 80mm auto; margin: 4mm; }
            body { margin: 0; background: #ffffff; font-family: "Courier New", Courier, monospace; }
            .pos-receipt-paper {
              width: 72mm;
              box-sizing: border-box;
              color: #000000;
              font-size: 11px;
              line-height: 1.35;
              padding: 0;
              margin: 0 auto;
              border: 0;
            }
            .pos-receipt-header, .pos-receipt-voucher-info, .pos-receipt-disclaimer, .pos-receipt-footer-thanks { text-align: center; }
            .pos-receipt-brand { font-size: 14px; margin: 0 0 2px; letter-spacing: 0.04em; }
            .pos-receipt-ruc, .pos-receipt-address, .pos-receipt-phone, .pos-receipt-meta-grid, .pos-receipt-totals, .pos-receipt-payment-info { font-size: 10px; }
            .pos-receipt-divider { text-align: center; white-space: nowrap; overflow: hidden; margin: 4px 0; }
            .pos-receipt-voucher-type { font-size: 13px; font-weight: 900; }
            .pos-receipt-voucher-num { font-size: 12px; font-weight: 800; }
            .pos-receipt-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 8px; }
            .pos-receipt-meta-grid span { font-weight: 700; }
            .pos-receipt-table { width: 100%; border-collapse: collapse; font-size: 10px; }
            .pos-receipt-table th { border-bottom: 1px dashed #000; padding: 2px 0; }
            .pos-receipt-table td { padding: 2px 0; vertical-align: top; }
            .pos-r-row { display: flex; justify-content: space-between; gap: 8px; }
            .pos-r-total-big { border-top: 1px solid #000; padding-top: 4px; margin-top: 3px; font-size: 13px; font-weight: 900; }
            .pos-receipt-disclaimer { border: 1px dashed #000; padding: 5px; margin: 7px 0; font-weight: 800; }
            .pos-receipt-footer-thanks { font-weight: 700; margin-top: 6px; }
          </style>
        </head>
        <body>${contenido}</body>
      </html>
    `);
    ventana.document.close();
    ventana.focus();
    setTimeout(() => {
      ventana.print();
      ventana.close();
    }, 200);
  }

  descargarComprobanteVentaPOS(): void {
    const venta = this.ventaEmitidaSeleccionada();
    if (!venta) return;

    const contenido = this.generarComprobanteTextoPOS(venta);
    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const enlace = document.createElement('a');
    enlace.href = url;
    enlace.download = `${this.tipoComprobanteLabel(venta.tipoComprobante).toLowerCase().replace(/\s+/g, '-')}-${venta.numeroComprobante}.txt`;
    enlace.click();
    URL.revokeObjectURL(url);
  }

  generarComprobanteTextoPOS(venta: VentaPOS): string {
    const fecha = new Date(venta.fecha).toLocaleString('es-PE');
    const lineas = [
      'CANCHERO SPORT CLUB',
      `RUC: 20608912345`,
      `${this.venueName()} - ${this.venueAddress()}`,
      `Telefono: ${this.venuePhone()}`,
      '================================',
      `${this.tipoComprobanteLabel(venta.tipoComprobante).toUpperCase()}`,
      venta.numeroComprobante,
      '--------------------------------',
      `Fecha: ${fecha}`,
      `Cajero: ${venta.cajeroNombre}`,
      `Cliente: ${venta.clienteNombre}`,
      `Doc: ${venta.clienteDocumento || 'DNI'}`,
      '--------------------------------',
      'CANT  DESCRIPCION                 P.U.   TOTAL',
      ...venta.items.map((item) => {
        const nombre = item.nombre.length > 24 ? `${item.nombre.slice(0, 21)}...` : item.nombre;
        return `${String(item.cantidad).padEnd(5)} ${nombre.padEnd(24)} ${item.precioUnitario.toFixed(2).padStart(6)} ${item.subtotal.toFixed(2).padStart(7)}`;
      }),
      '--------------------------------',
      `OP. GRAVADA: S/ ${venta.subtotal.toFixed(2)}`,
      `I.G.V. (18%): S/ ${venta.igv.toFixed(2)}`,
      `TOTAL A PAGAR: S/ ${venta.total.toFixed(2)}`,
      '--------------------------------',
      `FORMA DE PAGO: ${venta.metodoPago.toUpperCase()}`,
    ];

    for (const pago of venta.pagos || []) {
      lineas.push(`${pago.metodoPago.toUpperCase()}: S/ ${pago.monto.toFixed(2)}`);
    }
    if (venta.metodoPago === 'efectivo' || (venta.vuelto || 0) > 0) {
      lineas.push(`IMPORTE RECIBIDO: S/ ${(venta.montoPagado || venta.total).toFixed(2)}`);
      lineas.push(`VUELTO: S/ ${(venta.vuelto || 0).toFixed(2)}`);
    }

    lineas.push('================================');
    lineas.push('CONTROL INTERNO DEL COMPLEJO DEPORTIVO');
    lineas.push('CONSERVE ESTE COMPROBANTE');
    lineas.push('GRACIAS POR TU COMPRA. VUELVE PRONTO.');
    return lineas.join('\n');
  }

  abrirModalIngresoMercaderia(productoId?: number): void {
    if (productoId) {
      this.ingresoProductoId.set(productoId);
      const prod = this.posService.productos().find((p) => p.id === productoId);
      if (prod) {
        this.ingresoPrecioCompra.set(prod.precioCompra);
      }
    } else {
      const primero = this.posService.productos()[0];
      if (primero) {
        this.ingresoProductoId.set(primero.id);
        this.ingresoPrecioCompra.set(primero.precioCompra);
      }
    }
    this.ingresoCantidad.set(12);
    this.ingresoMotivo.set('Reposición semanal / Almacén');
    this.modalIngresoMercaderiaOpen.set(true);
  }

  cerrarModalIngresoMercaderia(): void {
    this.modalIngresoMercaderiaOpen.set(false);
  }

  setIngresoProductoId(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const id = parseInt(select?.value, 10) || 1;
    this.ingresoProductoId.set(id);
    const prod = this.posService.productos().find((p) => p.id === id);
    if (prod) {
      this.ingresoPrecioCompra.set(prod.precioCompra);
    }
  }

  setIngresoCantidad(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ingresoCantidad.set(parseInt(input?.value, 10) || 1);
  }

  setIngresoPrecioCompra(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ingresoPrecioCompra.set(parseFloat(input?.value) || 0);
  }

  setIngresoMotivo(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.ingresoMotivo.set(input?.value || '');
  }

  confirmarIngresoMercaderia(): void {
    const prodId = Number(this.ingresoProductoId());
    const cant = Number(this.ingresoCantidad());
    const precio = Number(this.ingresoPrecioCompra());
    const motivo = this.ingresoMotivo().trim();

    if (cant <= 0) {
      this.notice.emit('Ingresa una cantidad válida mayor a 0');
      return;
    }

    this.posService.registrarEntradaMercaderia(prodId, cant, precio, motivo);
    const prod = this.posService.productos().find((p) => p.id === prodId);
    this.modalIngresoMercaderiaOpen.set(false);
    this.notice.emit(`Ingreso registrado: +${cant} unids en Kardex para ${prod?.nombre || 'Producto'}`);
  }
}
