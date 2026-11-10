import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AdminContext } from '../admin-context.service';
import { PurchaseService } from '@core/services/purchase.service';
import { CatalogService } from '@core/services/catalog.service';
import { ToastService } from '@core/services/toast.service';
import {
  Compra,
  CrearCompraPayload,
  CrearProveedorPayload,
  EstadoCompra,
  PartidaCompra,
  Proveedor,
  TipoComprobanteCompra,
} from '@shared/models/purchase.model';

@Component({
  standalone: true,
  selector: 'app-admin-compras',
  imports: [
    CommonModule,
    DecimalPipe,
    DatePipe,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatTableModule,
    MatPaginatorModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
  ],
  templateUrl: './admin-compras.html',
  styleUrl: './admin-compras.css',
})
export class AdminCompras {
  readonly context = inject(AdminContext);
  readonly purchaseService = inject(PurchaseService);
  readonly catalog = inject(CatalogService);
  readonly toast = inject(ToastService);

  readonly currentSedeId = computed(() => this.context.venue()?.id ?? null);
  readonly currentSedeName = computed(
    () => this.context.venue()?.nombre ?? 'Sin sede seleccionada',
  );

  // Pestañas
  readonly activeTab = signal<'compras' | 'proveedores'>('compras');

  // Filtros Compras
  readonly purchaseSearch = signal<string>('');
  readonly purchaseStatusFilter = signal<'TODAS' | EstadoCompra>('TODAS');
  readonly purchaseSupplierFilter = signal<number>(0);

  // Filtros Proveedores
  readonly supplierSearch = signal<string>('');
  readonly supplierStatusFilter = signal<'TODOS' | 'A' | 'I'>('TODOS');

  // Modales
  readonly showPurchaseModal = signal(false);
  readonly showDetailModal = signal(false);
  readonly showSupplierModal = signal(false);
  readonly saving = signal(false);

  // Detalle de compra seleccionado
  readonly selectedPurchase = signal<Compra | null>(null);

  // Formulario Proveedor
  readonly editingSupplierId = signal<number | null>(null);
  readonly supRuc = signal<string>('');
  readonly supRazonSocial = signal<string>('');
  readonly supContacto = signal<string>('');
  readonly supTelefono = signal<string>('');
  readonly supCorreo = signal<string>('');
  readonly supDireccion = signal<string>('');
  readonly supError = signal<string>('');

  // Formulario Compra
  readonly purchaseSupplierId = signal<number | null>(null);
  readonly purchaseTipo = signal<TipoComprobanteCompra>('factura');
  readonly purchaseNumero = signal<string>('');
  readonly purchaseFechaEntrega = signal<string>('');
  readonly purchaseObservacion = signal<string>('');
  readonly purchaseRecibirInmediato = signal<boolean>(true);
  readonly purchaseItems = signal<PartidaCompra[]>([]);
  readonly purchaseError = signal<string>('');

  // Partida temporal para agregar a la compra
  readonly itemProductId = signal<number | null>(null);
  readonly itemQuantity = signal<number>(1);
  readonly itemUnitCost = signal<number>(0);

  // Computeds
  readonly suppliers = computed(() => this.purchaseService.suppliers());
  readonly purchases = computed(() => this.purchaseService.purchases());
  readonly products = computed(() => this.catalog.products());

  readonly filteredPurchases = computed<Compra[]>(() => {
    const list = this.purchases();
    const query = this.purchaseSearch().trim().toLowerCase();
    const status = this.purchaseStatusFilter();
    const supId = this.purchaseSupplierFilter();

    return list.filter((c) => {
      const matchSup = supId === 0 || c.proveedorId === supId;
      const matchStatus = status === 'TODAS' || c.estado === status;
      const matchQuery =
        !query ||
        c.numeroComprobante.toLowerCase().includes(query) ||
        c.proveedorNombre.toLowerCase().includes(query) ||
        c.proveedorRuc.includes(query);

      return matchSup && matchStatus && matchQuery;
    });
  });

  readonly filteredSuppliers = computed<Proveedor[]>(() => {
    const list = this.suppliers();
    const query = this.supplierSearch().trim().toLowerCase();
    const status = this.supplierStatusFilter();

    return list.filter((s) => {
      const matchStatus = status === 'TODOS' || s.estado === status;
      const matchQuery =
        !query ||
        s.ruc.includes(query) ||
        s.razonSocial.toLowerCase().includes(query) ||
        (s.contacto && s.contacto.toLowerCase().includes(query));

      return matchStatus && matchQuery;
    });
  });

  readonly displayedColumnsPurchases = [
    'fechaEmision',
    'comprobante',
    'proveedor',
    'partidas',
    'subtotal',
    'total',
    'estado',
    'acciones',
  ];
  readonly displayedColumnsSuppliers = [
    'ruc',
    'razonSocial',
    'contacto',
    'telefonoCorreo',
    'direccion',
    'estado',
    'acciones',
  ];
  readonly purchasesPageIndex = signal(0);
  readonly purchasesPageSize = signal(10);
  readonly suppliersPageIndex = signal(0);
  readonly suppliersPageSize = signal(10);

  readonly paginatedPurchases = computed(() => {
    const start = this.purchasesPageIndex() * this.purchasesPageSize();
    return this.filteredPurchases().slice(start, start + this.purchasesPageSize());
  });

  readonly paginatedSuppliers = computed(() => {
    const start = this.suppliersPageIndex() * this.suppliersPageSize();
    return this.filteredSuppliers().slice(start, start + this.suppliersPageSize());
  });

  onPurchasesPage(event: PageEvent): void {
    this.purchasesPageIndex.set(event.pageIndex);
    this.purchasesPageSize.set(event.pageSize);
  }

  onSuppliersPage(event: PageEvent): void {
    this.suppliersPageIndex.set(event.pageIndex);
    this.suppliersPageSize.set(event.pageSize);
  }

  // KPIs
  readonly totalCompras = computed(() => {
    return this.purchases()
      .filter((c) => c.estado === 'RECIBIDA')
      .reduce((acc, c) => acc + c.total, 0);
  });

  readonly recibidasCount = computed(() => {
    return this.purchases().filter((c) => c.estado === 'RECIBIDA').length;
  });

  readonly pendientesCount = computed(() => {
    return this.purchases().filter((c) => c.estado === 'EMITIDA' || c.estado === 'BORRADOR').length;
  });

  readonly proveedoresActivosCount = computed(() => {
    return this.suppliers().filter((s) => s.estado === 'A').length;
  });

  // Totales de la compra en creación
  readonly newPurchaseSubtotal = computed(() => {
    const sum = this.purchaseItems().reduce((acc, item) => acc + item.subtotal, 0);
    return Number(sum.toFixed(2));
  });

  readonly newPurchaseIgv = computed(() => {
    return Number((this.newPurchaseSubtotal() * 0.18).toFixed(2));
  });

  readonly newPurchaseTotal = computed(() => {
    return Number((this.newPurchaseSubtotal() + this.newPurchaseIgv()).toFixed(2));
  });

  private lastSedeId: number | null = null;

  constructor() {
    effect(() => {
      const sedeId = this.currentSedeId();
      untracked(() => {
        if (sedeId && sedeId !== this.lastSedeId) {
          this.lastSedeId = sedeId;
          void this.loadAll(sedeId);
        }
      });
    });
  }

  async loadAll(sedeId: number): Promise<void> {
    try {
      await Promise.all([
        this.purchaseService.loadSuppliers(sedeId, true),
        this.purchaseService.loadPurchases(sedeId),
        this.catalog.loadProducts(sedeId),
      ]);
    } catch {
      // Manejado en servicios
    }
  }

  // =========================================================================
  // GESTIÓN DE PROVEEDORES
  // =========================================================================

  openNewSupplierModal(): void {
    this.editingSupplierId.set(null);
    this.supRuc.set('');
    this.supRazonSocial.set('');
    this.supContacto.set('');
    this.supTelefono.set('');
    this.supCorreo.set('');
    this.supDireccion.set('');
    this.supError.set('');
    this.showSupplierModal.set(true);
  }

  openEditSupplierModal(sup: Proveedor): void {
    this.editingSupplierId.set(sup.id);
    this.supRuc.set(sup.ruc);
    this.supRazonSocial.set(sup.razonSocial);
    this.supContacto.set(sup.contacto || '');
    this.supTelefono.set(sup.telefono || '');
    this.supCorreo.set(sup.correo || '');
    this.supDireccion.set(sup.direccion || '');
    this.supError.set('');
    this.showSupplierModal.set(true);
  }

  async saveSupplier(): Promise<void> {
    const sedeId = this.currentSedeId();
    if (!sedeId) return;

    const ruc = this.supRuc().trim();
    const razonSocial = this.supRazonSocial().trim();

    if (!ruc.match(/^(10|20)\d{9}$/)) {
      this.supError.set(
        'El RUC debe tener exactamente 11 dígitos numéricos válidos (comenzando con 10 o 20).',
      );
      return;
    }
    if (!razonSocial) {
      this.supError.set('La razón social es obligatoria.');
      return;
    }

    this.saving.set(true);
    this.supError.set('');
    try {
      const payload: CrearProveedorPayload = {
        sedeId,
        ruc,
        razonSocial,
        contacto: this.supContacto().trim() || undefined,
        telefono: this.supTelefono().trim() || undefined,
        correo: this.supCorreo().trim() || undefined,
        direccion: this.supDireccion().trim() || undefined,
      };

      const id = this.editingSupplierId();
      if (id) {
        await this.purchaseService.updateSupplier(id, payload);
        this.toast.show('Proveedor actualizado correctamente');
      } else {
        await this.purchaseService.createSupplier(payload);
        this.toast.show('Proveedor registrado con éxito');
      }
      this.showSupplierModal.set(false);
    } catch (err: any) {
      this.supError.set(err.message || 'Error al guardar proveedor');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleSupplier(sup: Proveedor): Promise<void> {
    const sedeId = this.currentSedeId();
    if (!sedeId) return;

    try {
      const next = await this.purchaseService.toggleSupplierStatus(sup.id, sedeId);
      this.toast.show(`Proveedor ${next === 'A' ? 'activado' : 'desactivado'}`);
    } catch (err: any) {
      this.toast.show(err.message || 'Error al cambiar estado');
    }
  }

  // =========================================================================
  // GESTIÓN DE COMPRAS
  // =========================================================================

  openNewPurchaseModal(): void {
    const sups = this.suppliers().filter((s) => s.estado === 'A');
    this.purchaseSupplierId.set(sups.length > 0 ? sups[0].id : null);
    this.purchaseTipo.set('factura');
    this.purchaseNumero.set('');
    this.purchaseFechaEntrega.set('');
    this.purchaseObservacion.set('');
    this.purchaseRecibirInmediato.set(true);
    this.purchaseItems.set([]);
    this.purchaseError.set('');

    const prods = this.products();
    if (prods.length > 0) {
      this.itemProductId.set(prods[0].id);
      this.itemUnitCost.set(prods[0].precioCompra || 0);
    } else {
      this.itemProductId.set(null);
      this.itemUnitCost.set(0);
    }
    this.itemQuantity.set(1);

    this.showPurchaseModal.set(true);
  }

  onProductPickerChange(prodId: number): void {
    this.itemProductId.set(prodId);
    const prod = this.products().find((p) => p.id === prodId);
    if (prod) {
      this.itemUnitCost.set(prod.precioCompra || 0);
    }
  }

  addPartida(): void {
    const prodId = this.itemProductId();
    const qty = this.itemQuantity();
    const cost = this.itemUnitCost();

    if (!prodId || qty <= 0 || cost <= 0) {
      this.purchaseError.set(
        'Selecciona un producto, cantidad mayor a 0 y costo unitario mayor a 0.',
      );
      return;
    }

    const prod = this.products().find((p) => p.id === prodId);
    const prodName = prod ? prod.nombre : `Producto #${prodId}`;
    const subtotal = Number((qty * cost).toFixed(2));

    const current = [...this.purchaseItems()];
    const existingIndex = current.findIndex((item) => item.productoId === prodId);

    if (existingIndex >= 0) {
      current[existingIndex] = {
        ...current[existingIndex],
        cantidad: current[existingIndex].cantidad + qty,
        costoUnitario: cost,
        subtotal: Number(((current[existingIndex].cantidad + qty) * cost).toFixed(2)),
      };
    } else {
      current.push({
        productoId: prodId,
        productoNombre: prodName,
        cantidad: qty,
        costoUnitario: cost,
        subtotal,
      });
    }

    this.purchaseItems.set(current);
    this.purchaseError.set('');
  }

  removePartida(index: number): void {
    const current = [...this.purchaseItems()];
    current.splice(index, 1);
    this.purchaseItems.set(current);
  }

  async savePurchase(): Promise<void> {
    const sedeId = this.currentSedeId();
    const supId = this.purchaseSupplierId();
    const items = this.purchaseItems();

    if (!sedeId || !supId) {
      this.purchaseError.set('Debes seleccionar un proveedor.');
      return;
    }
    if (items.length === 0) {
      this.purchaseError.set('Debes agregar al menos una partida a la compra.');
      return;
    }

    this.saving.set(true);
    this.purchaseError.set('');
    try {
      const payload: CrearCompraPayload = {
        sedeId,
        proveedorId: supId,
        numeroComprobante: this.purchaseNumero().trim() || `DOC-${Date.now() % 1000000}`,
        tipoComprobante: this.purchaseTipo(),
        fechaEntregaEstimada: this.purchaseFechaEntrega().trim() || null,
        observacion: this.purchaseObservacion().trim() || null,
        recibirInmediatamente: this.purchaseRecibirInmediato(),
        items: items.map((i) => ({
          productoId: i.productoId,
          cantidad: i.cantidad,
          costoUnitario: i.costoUnitario,
        })),
      };

      const res = await this.purchaseService.createPurchase(payload);
      if (payload.recibirInmediatamente) {
        this.toast.show(`Compra recepcionada y cargada al Kardex (${items.length} partidas)`);
      } else {
        this.toast.show(`Orden de compra ${res.numeroComprobante} emitida exitosamente`);
      }
      this.showPurchaseModal.set(false);
    } catch (err: any) {
      this.purchaseError.set(err.message || 'Error al registrar la compra');
    } finally {
      this.saving.set(false);
    }
  }

  viewPurchaseDetail(c: Compra): void {
    this.selectedPurchase.set(c);
    this.showDetailModal.set(true);
  }

  async receiveCurrentPurchase(): Promise<void> {
    const sedeId = this.currentSedeId();
    const p = this.selectedPurchase();
    if (!sedeId || !p) return;

    this.saving.set(true);
    try {
      const updated = await this.purchaseService.receivePurchase(p.id, sedeId);
      this.selectedPurchase.set(updated);
      this.toast.show('Mercadería recibida: Stock e historial de Kardex actualizados.');
      this.showDetailModal.set(false);
    } catch (err: any) {
      this.toast.show(err.message || 'Error al recepcionar compra');
    } finally {
      this.saving.set(false);
    }
  }

  async cancelCurrentPurchase(): Promise<void> {
    const sedeId = this.currentSedeId();
    const p = this.selectedPurchase();
    if (!sedeId || !p) return;

    this.saving.set(true);
    try {
      const updated = await this.purchaseService.cancelPurchase(
        p.id,
        sedeId,
        'Anulado desde panel administrativo',
      );
      this.selectedPurchase.set(updated);
      this.toast.show('Orden de compra anulada.');
      this.showDetailModal.set(false);
    } catch (err: any) {
      this.toast.show(err.message || 'Error al anular compra');
    } finally {
      this.saving.set(false);
    }
  }
}
