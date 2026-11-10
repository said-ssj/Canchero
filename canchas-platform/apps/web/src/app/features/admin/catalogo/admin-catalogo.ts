import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { CommonModule, DecimalPipe } from '@angular/common';
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
import { MatTooltipModule } from '@angular/material/tooltip';
import { AdminContext } from '../admin-context.service';
import { CatalogService } from '@core/services/catalog.service';
import { AuthService } from '@core/auth/auth.service';
import {
  CategoriaProducto,
  Producto,
  CATEGORY_ICON_OPTIONS,
  CategoryIconOption,
  inferirIconoCategoria,
  encodeCategoryDescription,
} from '@shared/models/pos.model';

@Component({
  standalone: true,
  selector: 'app-admin-catalogo',
  imports: [
    CommonModule,
    DecimalPipe,
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
    MatTooltipModule,
  ],
  templateUrl: './admin-catalogo.html',
  styleUrl: './admin-catalogo.css',
})
export class AdminCatalogo {
  readonly context = inject(AdminContext);
  readonly catalog = inject(CatalogService);
  readonly auth = inject(AuthService);

  readonly currentSedeId = computed(() => this.context.venue()?.id ?? null);
  readonly currentSedeName = computed(() => this.context.venue()?.nombre ?? 'Sin sede seleccionada');

  // Pestaña activa
  readonly activeTab = signal<'productos' | 'categorias'>('productos');
  readonly viewMode = signal<'cards' | 'tabla'>('cards');

  // Filtros de Productos
  readonly searchQuery = signal<string>('');
  readonly selectedCategory = signal<number>(0);
  readonly statusFilter = signal<'TODOS' | 'A' | 'I'>('TODOS');
  readonly onlyLowStock = signal<boolean>(false);

  // Filtros de Categorías
  readonly categorySearch = signal<string>('');

  // Modales y Diálogos
  readonly productModalOpen = signal<boolean>(false);
  readonly categoryModalOpen = signal<boolean>(false);
  readonly stockModalOpen = signal<boolean>(false);

  readonly editingProduct = signal<Producto | null>(null);
  readonly editingCategory = signal<CategoriaProducto | null>(null);
  readonly adjustingProduct = signal<Producto | null>(null);

  readonly saving = signal<boolean>(false);
  readonly formError = signal<string>('');
  readonly notice = signal<string>('');

  // Formulario Producto
  prodNombre = '';
  prodCategoriaId: number | null = null;
  prodCodigoBarras = '';
  prodUnidadMedida = 'und';
  prodContenido: number | null = 1;
  prodPrecioCompra: number | null = 0;
  prodPrecioVenta: number | null = 0;
  prodStockInicial = 0;
  prodStockMinimo = 5;
  prodDescripcion = '';
  prodFotoUrl = '';

  // Formulario Categoría
  catNombre = '';
  catDescripcion = '';
  catIcono = 'local_drink';
  readonly iconOptions = CATEGORY_ICON_OPTIONS;
  readonly iconPopoverOpen = signal(false);

  toggleIconPopover(): void {
    this.iconPopoverOpen.update((v) => !v);
  }

  seleccionarIcono(icono: string): void {
    this.catIcono = icono;
    this.iconPopoverOpen.set(false);
  }

  obtenerIconoProducto(p: Producto): string {
    const cat = this.catalog.categories().find(
      (c) =>
        (p.categoriaId != null && Number(c.id) === Number(p.categoriaId)) ||
        (c.nombre &&
          p.categoriaNombre &&
          c.nombre.toLowerCase().trim() === p.categoriaNombre.toLowerCase().trim()),
    );
    if (cat?.icono && cat.icono !== 'category') {
      return cat.icono;
    }
    if (
      p.icono &&
      p.icono !== 'inventory_2' &&
      p.icono !== 'assignment_turned_in' &&
      p.icono !== 'shopping_bag' &&
      p.icono !== 'category'
    ) {
      return p.icono;
    }
    if (cat?.icono) {
      return cat.icono;
    }
    return inferirIconoCategoria(p.categoriaNombre || p.nombre);
  }

  // Formulario Ajuste de Stock
  stockCantidad: number | null = 10;
  stockMotivo = 'Reposición de proveedor';
  stockPrecioCompra: number | null = 0;

  // Unidades disponibles
  readonly unidades = [
    { id: 'und', nombre: 'Unidad (und)' },
    { id: 'bot', nombre: 'Botella (bot)' },
    { id: 'lata', nombre: 'Lata (lata)' },
    { id: 'pack', nombre: 'Pack / Six-Pack' },
    { id: 'caja', nombre: 'Caja' },
    { id: 'ml', nombre: 'Mililitros (ml)' },
    { id: 'l', nombre: 'Litros (L)' },
    { id: 'g', nombre: 'Gramos (g)' },
    { id: 'kg', nombre: 'Kilogramos (kg)' },
  ];

  // Cálculo reactivo de margen en modal
  readonly marginPreview = computed(() => {
    const pc = Number(this.prodPrecioCompra) || 0;
    const pv = Number(this.prodPrecioVenta) || 0;
    if (pv <= 0) return 0;
    return Math.round(((pv - pc) / pv) * 1000) / 10;
  });

  // Métricas
  readonly totalProductsCount = computed(() => this.catalog.products().length);
  readonly activeProductsCount = computed(
    () => this.catalog.products().filter((p) => p.estado !== 'I').length,
  );
  readonly lowStockCount = computed(
    () => this.catalog.products().filter((p) => p.stock <= p.stockMinimo && p.estado !== 'I').length,
  );
  readonly averageMargin = computed(() => {
    const prods = this.catalog.products().filter((p) => p.precioVenta > 0 && p.estado !== 'I');
    if (!prods.length) return 0;
    const sum = prods.reduce((acc, p) => {
      const margen = ((p.precioVenta - p.precioCompra) / p.precioVenta) * 100;
      return acc + margen;
    }, 0);
    return Math.round((sum / prods.length) * 10) / 10;
  });

  // Lista filtrada de productos
  readonly filteredProducts = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    const catId = this.selectedCategory();
    const status = this.statusFilter();
    const lowStock = this.onlyLowStock();

    return this.catalog.products().filter((p) => {
      if (status !== 'TODOS' && (p.estado || 'A') !== status) return false;
      if (catId > 0 && p.categoriaId !== catId) return false;
      if (lowStock && p.stock > p.stockMinimo) return false;
      if (query) {
        const matchName = p.nombre.toLowerCase().includes(query);
        const matchCode = (p.codigoBarras || '').toLowerCase().includes(query);
        const matchCat = (p.categoriaNombre || '').toLowerCase().includes(query);
        if (!matchName && !matchCode && !matchCat) return false;
      }
      return true;
    });
  });

  // Lista filtrada de categorías
  readonly filteredCategories = computed(() => {
    const query = this.categorySearch().trim().toLowerCase();
    return this.catalog.categories().filter((c) => {
      if (!query) return true;
      return (
        c.nombre.toLowerCase().includes(query) ||
        (c.descripcion || '').toLowerCase().includes(query)
      );
    });
  });

  private lastSedeId: number | null = null;

  constructor() {
    effect(() => {
      const sedeId = this.currentSedeId();
      untracked(() => {
        if (sedeId && sedeId !== this.lastSedeId) {
          this.lastSedeId = sedeId;
          void this.loadData(sedeId);
        }
      });
    });
  }

  async loadData(sedeId: number): Promise<void> {
    try {
      await Promise.all([
        this.catalog.loadCategories(sedeId, true),
        this.catalog.loadProducts(sedeId, { estado: 'TODOS' }),
      ]);
    } catch (err: any) {
      this.showNotice(err.message || 'Error al cargar datos del catálogo');
    }
  }

  showNotice(msg: string): void {
    this.notice.set(msg);
    setTimeout(() => {
      if (this.notice() === msg) this.notice.set('');
    }, 4500);
  }

  // ===== PRODUCTOS =====

  openNewProductModal(): void {
    this.editingProduct.set(null);
    this.formError.set('');
    this.prodNombre = '';
    this.prodCategoriaId = this.catalog.categories()[0]?.id ?? null;
    this.prodCodigoBarras = '';
    this.prodUnidadMedida = 'und';
    this.prodContenido = 1;
    this.prodPrecioCompra = 0;
    this.prodPrecioVenta = 0;
    this.prodStockInicial = 10;
    this.prodStockMinimo = 5;
    this.prodDescripcion = '';
    this.prodFotoUrl = '';
    this.productModalOpen.set(true);
  }

  openEditProductModal(p: Producto): void {
    this.editingProduct.set(p);
    this.formError.set('');
    this.prodNombre = p.nombre;
    this.prodCategoriaId = p.categoriaId;
    this.prodCodigoBarras = p.codigoBarras || '';
    this.prodUnidadMedida = p.unidadMedida || 'und';
    this.prodContenido = p.contenido ?? 1;
    this.prodPrecioCompra = p.precioCompra;
    this.prodPrecioVenta = p.precioVenta;
    this.prodStockInicial = p.stock;
    this.prodStockMinimo = p.stockMinimo;
    this.prodDescripcion = p.descripcion || '';
    this.prodFotoUrl = p.fotoUrl || '';
    this.productModalOpen.set(true);
  }

  closeProductModal(): void {
    if (!this.saving()) {
      this.productModalOpen.set(false);
      this.editingProduct.set(null);
    }
  }

  async saveProduct(): Promise<void> {
    const sedeId = this.currentSedeId();
    if (!sedeId) return;

    if (!this.prodNombre.trim()) {
      this.formError.set('Ingresa el nombre del producto.');
      return;
    }
    if (!this.prodCategoriaId) {
      this.formError.set('Selecciona una categoría para el producto.');
      return;
    }
    if (!this.prodPrecioVenta || this.prodPrecioVenta <= 0) {
      this.formError.set('El precio de venta debe ser mayor a S/ 0.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    const payload = {
      sedeId,
      categoriaId: this.prodCategoriaId,
      nombre: this.prodNombre,
      codigoBarras: this.prodCodigoBarras,
      descripcion: this.prodDescripcion,
      contenido: Number(this.prodContenido) || 1,
      unidadMedida: this.prodUnidadMedida,
      precioCompra: Number(this.prodPrecioCompra) || 0,
      precioVenta: Number(this.prodPrecioVenta),
      stockInicial: Number(this.prodStockInicial) || 0,
      stockMinimo: Number(this.prodStockMinimo) || 0,
      fotoUrl: this.prodFotoUrl.trim() || undefined,
    };

    try {
      const editProd = this.editingProduct();
      if (editProd) {
        await this.catalog.updateProduct(editProd.id, payload);
        this.showNotice(`Producto «${this.prodNombre}» actualizado correctamente.`);
      } else {
        await this.catalog.createProduct(payload);
        this.showNotice(`Producto «${this.prodNombre}» creado exitosamente.`);
      }
      this.productModalOpen.set(false);
    } catch (err: any) {
      this.formError.set(err.message || 'No se pudo guardar el producto.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleProduct(p: Producto): Promise<void> {
    const sedeId = this.currentSedeId();
    if (!sedeId || this.saving()) return;
    try {
      const nuevoEstado = await this.catalog.toggleProductStatus(p.id, sedeId);
      this.showNotice(
        `Producto «${p.nombre}» ${nuevoEstado === 'A' ? 'activado' : 'desactivado'}.`,
      );
    } catch (err: any) {
      this.showNotice(err.message || 'Error al cambiar estado del producto');
    }
  }

  // ===== AJUSTE DE STOCK =====

  openStockModal(p: Producto): void {
    this.adjustingProduct.set(p);
    this.stockCantidad = 12;
    this.stockMotivo = 'Reposición de proveedor';
    this.stockPrecioCompra = p.precioCompra;
    this.formError.set('');
    this.stockModalOpen.set(true);
  }

  closeStockModal(): void {
    if (!this.saving()) {
      this.stockModalOpen.set(false);
      this.adjustingProduct.set(null);
    }
  }

  async saveStockAdjustment(): Promise<void> {
    const sedeId = this.currentSedeId();
    const prod = this.adjustingProduct();
    if (!sedeId || !prod) return;

    const cant = Number(this.stockCantidad);
    if (!cant || cant <= 0) {
      this.formError.set('Ingresa una cantidad válida mayor a 0.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    try {
      await this.catalog.adjustStock(
        sedeId,
        prod.id,
        cant,
        this.stockMotivo,
        Number(this.stockPrecioCompra) || prod.precioCompra,
      );
      this.showNotice(`Ingreso de stock registrado para «${prod.nombre}».`);
      this.stockModalOpen.set(false);
    } catch (err: any) {
      this.formError.set(err.message || 'Error al registrar ajuste de stock.');
    } finally {
      this.saving.set(false);
    }
  }

  // ===== CATEGORÍAS =====

  openNewCategoryModal(): void {
    this.editingCategory.set(null);
    this.catNombre = '';
    this.catDescripcion = '';
    this.catIcono = 'local_drink';
    this.iconPopoverOpen.set(false);
    this.formError.set('');
    this.categoryModalOpen.set(true);
  }

  openEditCategoryModal(c: CategoriaProducto): void {
    this.editingCategory.set(c);
    this.catNombre = c.nombre;
    this.catDescripcion = c.descripcion || '';
    this.catIcono = c.icono || inferirIconoCategoria(c.nombre);
    this.iconPopoverOpen.set(false);
    this.formError.set('');
    this.categoryModalOpen.set(true);
  }

  closeCategoryModal(): void {
    if (!this.saving()) {
      this.iconPopoverOpen.set(false);
      this.categoryModalOpen.set(false);
      this.editingCategory.set(null);
    }
  }

  async saveCategory(): Promise<void> {
    const sedeId = this.currentSedeId();
    if (!sedeId) return;

    if (!this.catNombre.trim()) {
      this.formError.set('Ingresa el nombre de la categoría.');
      return;
    }

    this.saving.set(true);
    this.formError.set('');

    try {
      const editCat = this.editingCategory();
      const descEncoded = encodeCategoryDescription(this.catIcono, this.catDescripcion);
      if (editCat) {
        await this.catalog.updateCategory(editCat.id, sedeId, this.catNombre, descEncoded);
        this.showNotice(`Categoría «${this.catNombre}» actualizada.`);
      } else {
        await this.catalog.createCategory(sedeId, this.catNombre, descEncoded);
        this.showNotice(`Categoría «${this.catNombre}» creada.`);
      }
      this.categoryModalOpen.set(false);
    } catch (err: any) {
      this.formError.set(err.message || 'No se pudo guardar la categoría.');
    } finally {
      this.saving.set(false);
    }
  }

  async toggleCategory(c: CategoriaProducto): Promise<void> {
    const sedeId = this.currentSedeId();
    if (!sedeId || this.saving()) return;
    try {
      const nuevoEstado = await this.catalog.toggleCategoryStatus(c.id, sedeId);
      this.showNotice(
        `Categoría «${c.nombre}» ${nuevoEstado === 'A' ? 'activada' : 'desactivada'}.`,
      );
    } catch (err: any) {
      this.showNotice(err.message || 'Error al cambiar estado de la categoría');
    }
  }
}
