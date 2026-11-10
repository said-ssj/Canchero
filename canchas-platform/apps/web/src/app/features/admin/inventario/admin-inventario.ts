import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AdminContext } from '../admin-context.service';
import { InventoryService } from '@core/services/inventory.service';
import { CatalogService } from '@core/services/catalog.service';
import { ToastService } from '@core/services/toast.service';
import {
  AjusteInventarioRequest,
  MovimientoKardex,
  Producto,
  ProyeccionVelocidadProducto,
  TipoAjusteInventario,
  TransformacionRequest,
} from '@shared/models/pos.model';

@Component({
  standalone: true,
  selector: 'app-admin-inventario',
  imports: [
    CommonModule,
    DecimalPipe,
    DatePipe,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonToggleModule,
    MatTableModule,
    MatPaginatorModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
  ],
  templateUrl: './admin-inventario.html',
  styleUrl: './admin-inventario.css',
})
export class AdminInventario {
  readonly context = inject(AdminContext);
  readonly inventory = inject(InventoryService);
  readonly catalog = inject(CatalogService);
  readonly toast = inject(ToastService);

  readonly currentSedeId = computed(() => this.context.venue()?.id ?? null);
  readonly currentSedeName = computed(
    () => this.context.venue()?.nombre ?? 'Sin sede seleccionada',
  );

  // Pestañas
  readonly activeTab = signal<'kardex' | 'velocidad'>('kardex');

  // Filtros de Kardex
  readonly searchQuery = signal<string>('');
  readonly selectedProductFilter = signal<number>(0);
  readonly tipoFilter = signal<'TODOS' | '+' | '-' | 'MERMA' | 'TRANSFORMACION'>('TODOS');

  // Modales
  readonly showEntryModal = signal(false);
  readonly showAdjustmentModal = signal(false);
  readonly showTransformationModal = signal(false);
  readonly saving = signal(false);

  // Formulario Entrada
  readonly entryProduct = signal<number | null>(null);
  readonly entryQuantity = signal<number>(1);
  readonly entryPrice = signal<number>(0);
  readonly entryReason = signal<string>('');

  // Formulario Ajuste / Merma
  readonly adjProduct = signal<number | null>(null);
  readonly adjType = signal<TipoAjusteInventario>('MERMA');
  readonly adjQuantity = signal<number>(1);
  readonly adjReason = signal<string>('');

  // Formulario Transformación (Fraccionamiento)
  readonly transOriginProduct = signal<number | null>(null);
  readonly transOriginQuantity = signal<number>(1);
  readonly transDestProduct = signal<number | null>(null);
  readonly transDestQuantity = signal<number>(1);
  readonly transReason = signal<string>('');

  // Formulario Traslado entre Sedes del Mismo Dueño
  readonly showTransferModal = signal(false);
  readonly transferProduct = signal<number | null>(null);
  readonly transferTargetVenue = signal<number | null>(null);
  readonly transferQuantity = signal<number>(1);
  readonly transferReason = signal<string>('');

  readonly otherVenues = computed(() => {
    const all = typeof this.context.venues === 'function' ? this.context.venues() : [];
    return (all ?? []).filter((v: any) => Number(v.id) !== this.currentSedeId());
  });
  readonly canTransfer = computed(() => this.otherVenues().length > 0);

  // Proyecciones y productos
  readonly products = computed(() => this.catalog.products());
  readonly summary = computed(() => this.inventory.summary());

  readonly filteredMovements = computed<MovimientoKardex[]>(() => {
    const list = this.inventory.movements();
    const query = this.searchQuery().trim().toLowerCase();
    const prodId = this.selectedProductFilter();
    const tipo = this.tipoFilter();

    return list.filter((m) => {
      const matchProd = prodId === 0 || m.productoId === prodId;
      const matchQuery =
        !query ||
        m.productoNombre.toLowerCase().includes(query) ||
        (m.motivo && m.motivo.toLowerCase().includes(query));

      let matchTipo = true;
      if (tipo === '+') matchTipo = m.tipo === '+';
      else if (tipo === '-') matchTipo = m.tipo === '-';
      else if (tipo === 'MERMA')
        matchTipo =
          (m.motivo || '').toUpperCase().includes('AJUSTE') ||
          (m.motivo || '').toUpperCase().includes('MERMA');
      else if (tipo === 'TRANSFORMACION')
        matchTipo =
          (m.motivo || '').toUpperCase().includes('TRANSFORMACIÓN') ||
          (m.motivo || '').toUpperCase().includes('FRACCIONAMIENTO');

      return matchProd && matchQuery && matchTipo;
    });
  });

  readonly filteredVelocity = computed<ProyeccionVelocidadProducto[]>(() => {
    const list = this.summary()?.proyeccionesAgotamiento || [];
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) return list;
    return list.filter((p) => p.nombre.toLowerCase().includes(query));
  });

  readonly displayedColumnsKardex = [
    'fecha',
    'producto',
    'operacion',
    'cantidad',
    'precio',
    'saldo',
    'motivo',
  ];
  readonly displayedColumnsVelocity = [
    'producto',
    'stockActual',
    'stockMinimo',
    'ritmo',
    'dias',
    'nivel',
    'acciones',
  ];
  readonly kardexPageIndex = signal(0);
  readonly kardexPageSize = signal(10);
  readonly velocityPageIndex = signal(0);
  readonly velocityPageSize = signal(10);

  readonly paginatedMovements = computed(() => {
    const start = this.kardexPageIndex() * this.kardexPageSize();
    return this.filteredMovements().slice(start, start + this.kardexPageSize());
  });

  readonly paginatedVelocity = computed(() => {
    const start = this.velocityPageIndex() * this.velocityPageSize();
    return this.filteredVelocity().slice(start, start + this.velocityPageSize());
  });

  onKardexPage(event: PageEvent): void {
    this.kardexPageIndex.set(event.pageIndex);
    this.kardexPageSize.set(event.pageSize);
  }

  onVelocityPage(event: PageEvent): void {
    this.velocityPageIndex.set(event.pageIndex);
    this.velocityPageSize.set(event.pageSize);
  }

  readonly originProductDetail = computed(() => {
    const id = this.transOriginProduct();
    return this.products().find((p) => p.id === id) || null;
  });

  readonly destProductDetail = computed(() => {
    const id = this.transDestProduct();
    return this.products().find((p) => p.id === id) || null;
  });

  readonly estimatedCostPerDestUnit = computed(() => {
    const origin = this.originProductDetail();
    const qOrig = this.transOriginQuantity();
    const qDest = this.transDestQuantity();
    if (!origin || qDest <= 0 || qOrig <= 0) return 0;
    const totalCost = (origin.precioCompra || 0) * qOrig;
    return Number((totalCost / qDest).toFixed(2));
  });

  private lastSedeId: number | null = null;

  constructor() {
    effect(() => {
      const sedeId = this.currentSedeId();
      untracked(() => {
        if (sedeId && sedeId !== this.lastSedeId) {
          this.lastSedeId = sedeId;
          void this.refreshData(sedeId);
        }
      });
    });
  }

  async refreshData(sedeId: number): Promise<void> {
    try {
      await Promise.all([
        this.inventory.loadSummary(sedeId),
        this.inventory.loadMovements(sedeId),
        this.catalog.loadProducts(sedeId),
      ]);
    } catch {
      // Manejado en los servicios
    }
  }

  // ===== ACCIONES MODAL ENTRADA =====
  openEntryModal(product?: Producto): void {
    if (product) {
      this.entryProduct.set(product.id);
      this.entryPrice.set(product.precioCompra || 0);
    } else if (this.products().length > 0) {
      this.entryProduct.set(this.products()[0].id);
      this.entryPrice.set(this.products()[0].precioCompra || 0);
    }
    this.entryQuantity.set(1);
    this.entryReason.set('Reposición de stock / Compra a proveedor');
    this.showEntryModal.set(true);
  }

  onEntryProductChange(prodId: number): void {
    this.entryProduct.set(prodId);
    const prod = this.products().find((p) => p.id === prodId);
    if (prod) {
      this.entryPrice.set(prod.precioCompra || 0);
    }
  }

  async submitEntry(): Promise<void> {
    const sedeId = this.currentSedeId();
    const prodId = this.entryProduct();
    const qty = this.entryQuantity();
    const price = this.entryPrice();
    const reason = this.entryReason();

    if (!sedeId || !prodId || qty <= 0) {
      this.toast.show('Selecciona un producto y una cantidad válida mayor a 0');
      return;
    }

    this.saving.set(true);
    try {
      await this.inventory.registerEntry(sedeId, prodId, qty, price, reason);
      this.toast.show('Ingreso de mercadería registrado exitosamente en el kardex');
      this.showEntryModal.set(false);
    } catch (err: any) {
      this.toast.show(err.message || 'Error al registrar ingreso');
    } finally {
      this.saving.set(false);
    }
  }

  // ===== ACCIONES MODAL AJUSTE / MERMA =====
  openAdjustmentModal(product?: Producto): void {
    if (product) {
      this.adjProduct.set(product.id);
    } else if (this.products().length > 0) {
      this.adjProduct.set(this.products()[0].id);
    }
    this.adjType.set('MERMA');
    this.adjQuantity.set(1);
    this.adjReason.set('');
    this.showAdjustmentModal.set(true);
  }

  async submitAdjustment(): Promise<void> {
    const sedeId = this.currentSedeId();
    const prodId = this.adjProduct();
    const qty = this.adjQuantity();
    const type = this.adjType();
    const reason = this.adjReason();

    if (!sedeId || !prodId || qty <= 0) {
      this.toast.show('Ingresa un producto y cantidad válida mayor a 0');
      return;
    }

    this.saving.set(true);
    try {
      const payload: AjusteInventarioRequest = {
        sedeId,
        productoId: prodId,
        tipoAjuste: type,
        cantidad: qty,
        motivo: reason.trim() || `Ajuste operativo de tipo ${type}`,
      };
      await this.inventory.registerAdjustment(payload);
      this.toast.show(`Ajuste (${type}) registrado correctamente en el Kardex`);
      this.showAdjustmentModal.set(false);
    } catch (err: any) {
      this.toast.show(err.message || 'Error al registrar ajuste');
    } finally {
      this.saving.set(false);
    }
  }

  // ===== ACCIONES MODAL TRANSFORMACIÓN (FRACCIONAMIENTO) =====
  openTransformationModal(origin?: Producto): void {
    const list = this.products();
    if (origin) {
      this.transOriginProduct.set(origin.id);
      const destCandidate = list.find((p) => p.id !== origin.id);
      this.transDestProduct.set(destCandidate ? destCandidate.id : null);
    } else if (list.length >= 2) {
      this.transOriginProduct.set(list[0].id);
      this.transDestProduct.set(list[1].id);
    } else if (list.length === 1) {
      this.transOriginProduct.set(list[0].id);
      this.transDestProduct.set(null);
    }
    this.transOriginQuantity.set(1);
    this.transDestQuantity.set(6);
    this.transReason.set('Apertura y fraccionamiento de pack para venta en barra');
    this.showTransformationModal.set(true);
  }

  async submitTransformation(): Promise<void> {
    const sedeId = this.currentSedeId();
    const origId = this.transOriginProduct();
    const destId = this.transDestProduct();
    const qOrig = this.transOriginQuantity();
    const qDest = this.transDestQuantity();
    const reason = this.transReason();

    if (!sedeId || !origId || !destId || qOrig <= 0 || qDest <= 0) {
      this.toast.show('Selecciona productos y cantidades válidas mayores a 0');
      return;
    }

    if (origId === destId) {
      this.toast.show('El producto origen y destino no pueden ser el mismo');
      return;
    }

    this.saving.set(true);
    try {
      const payload: TransformacionRequest = {
        sedeId,
        productoOrigenId: origId,
        cantidadOrigen: qOrig,
        productoDestinoId: destId,
        cantidadDestino: qDest,
        motivo: reason.trim() || 'Transformación de existencias',
      };
      const res = await this.inventory.executeTransformation(payload);
      this.toast.show(
        `Fraccionamiento exitoso: -${res.cantidadOrigen} de ${res.productoOrigenNombre} -> +${res.cantidadDestino} de ${res.productoDestinoNombre}`,
      );
      this.showTransformationModal.set(false);
    } catch (err: any) {
      this.toast.show(err.message || 'Error al ejecutar transformación');
    } finally {
      this.saving.set(false);
    }
  }

  // ===== ACCIONES MODAL TRASLADO ENTRE SEDES DEL MISMO DUEÑO =====
  openTransferModal(product?: Producto): void {
    const list = this.products();
    if (product) {
      this.transferProduct.set(product.id);
    } else if (list.length > 0) {
      this.transferProduct.set(list[0].id);
    }
    const others = this.otherVenues();
    if (others.length > 0) {
      this.transferTargetVenue.set(Number(others[0].id));
    }
    this.transferQuantity.set(1);
    this.transferReason.set('Traslado de inventario entre sedes');
    this.showTransferModal.set(true);
  }

  async submitTransfer(): Promise<void> {
    const sourceSede = this.currentSedeId();
    const targetSede = this.transferTargetVenue();
    const prodId = this.transferProduct();
    const qty = this.transferQuantity();
    const reason = this.transferReason();

    if (!sourceSede || !targetSede || !prodId || qty <= 0) {
      this.toast.show('Selecciona la sede de destino, el producto y una cantidad válida mayor a 0');
      return;
    }

    this.saving.set(true);
    try {
      const res = await this.inventory.transferStock({
        sourceSedeId: sourceSede,
        targetSedeId: targetSede,
        productoId: prodId,
        cantidad: qty,
        motivo: reason.trim() || 'Traslado entre sedes',
      });
      this.toast.show(res.mensaje || 'Traslado completado correctamente');
      this.showTransferModal.set(false);
      await this.refreshData(sourceSede);
    } catch (err: any) {
      this.toast.show(err.message || 'Error al trasladar producto');
    } finally {
      this.saving.set(false);
    }
  }
}
