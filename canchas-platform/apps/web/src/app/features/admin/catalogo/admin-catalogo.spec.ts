import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AdminCatalogo } from './admin-catalogo';
import { AdminContext } from '../admin-context.service';
import { CatalogService } from '@core/services/catalog.service';
import { AuthService } from '@core/auth/auth.service';

describe('AdminCatalogo component', () => {
  let fixture: ComponentFixture<AdminCatalogo>;
  let component: AdminCatalogo;

  const mockVenue = signal<{ id: number; nombre: string } | null>({ id: 1, nombre: 'Sede Principal' });
  const mockCategories = signal([
    { id: 1, nombre: 'Bebidas', descripcion: 'Aguas y rehidratantes', estado: 'A' as const, totalProductos: 5 },
    { id: 2, nombre: 'Snacks', descripcion: 'Galletas y papas', estado: 'A' as const, totalProductos: 2 },
  ]);
  const mockProducts = signal([
    {
      id: 101,
      sedeId: 1,
      categoriaId: 1,
      categoriaNombre: 'Bebidas',
      codigoBarras: '775001',
      nombre: 'Gatorade 500ml',
      precioCompra: 3.5,
      precioVenta: 6.0,
      stock: 24,
      stockMinimo: 6,
      unidadMedida: 'bot',
      contenido: 500,
      estado: 'A' as const,
      margenPorcentaje: 41.7,
    },
    {
      id: 102,
      sedeId: 1,
      categoriaId: 1,
      categoriaNombre: 'Bebidas',
      codigoBarras: '775002',
      nombre: 'Agua San Mateo 600ml',
      precioCompra: 1.2,
      precioVenta: 3.0,
      stock: 4,
      stockMinimo: 10,
      unidadMedida: 'bot',
      contenido: 600,
      estado: 'A' as const,
      margenPorcentaje: 60.0,
    },
  ]);

  const mockCatalogService = {
    categories: mockCategories,
    products: mockProducts,
    loading: signal(false),
    error: signal(''),
    loadCategories: vi.fn().mockResolvedValue([]),
    loadProducts: vi.fn().mockResolvedValue([]),
    createCategory: vi.fn().mockResolvedValue({ id: 3, nombre: 'Nueva' }),
    updateCategory: vi.fn().mockResolvedValue({ id: 1, nombre: 'Bebidas editada' }),
    toggleCategoryStatus: vi.fn().mockResolvedValue('I'),
    createProduct: vi.fn().mockResolvedValue({ id: 103 }),
    updateProduct: vi.fn().mockResolvedValue(undefined),
    toggleProductStatus: vi.fn().mockResolvedValue('I'),
    adjustStock: vi.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AdminCatalogo],
      providers: [
        {
          provide: AdminContext,
          useValue: {
            venue: mockVenue,
            loading: signal(false),
            error: signal(''),
          },
        },
        { provide: CatalogService, useValue: mockCatalogService },
        { provide: AuthService, useValue: { currentUser: signal({ id: 'user-1', nombre: 'Admin' }) } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminCatalogo);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('initializes and calculates metrics correctly', () => {
    expect(component.currentSedeName()).toBe('Sede Principal');
    expect(component.totalProductsCount()).toBe(2);
    expect(component.activeProductsCount()).toBe(2);
    expect(component.lowStockCount()).toBe(1); // 102 has stock 4 <= stockMinimo 10
  });

  it('filters products by search query', () => {
    component.searchQuery.set('Gatorade');
    const filtered = component.filteredProducts();
    expect(filtered.length).toBe(1);
    expect(filtered[0].nombre).toBe('Gatorade 500ml');
  });

  it('filters products by low stock flag', () => {
    component.onlyLowStock.set(true);
    const filtered = component.filteredProducts();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe(102);
  });

  it('opens and closes product modal cleanly', () => {
    expect(component.productModalOpen()).toBe(false);
    component.openNewProductModal();
    expect(component.productModalOpen()).toBe(true);
    expect(component.editingProduct()).toBeNull();

    component.closeProductModal();
    expect(component.productModalOpen()).toBe(false);
  });

  it('validates product creation fields before calling catalog service', async () => {
    component.openNewProductModal();
    component.prodNombre = ''; // invalid
    await component.saveProduct();
    expect(component.formError()).toContain('nombre');
    expect(mockCatalogService.createProduct).not.toHaveBeenCalled();
  });

  it('permite seleccionar icono al crear categoría y lo codifica en la descripción', async () => {
    component.openNewCategoryModal();
    expect(component.categoryModalOpen()).toBe(true);
    expect(component.catIcono).toBe('local_drink');

    component.seleccionarIcono('sports_soccer');
    expect(component.catIcono).toBe('sports_soccer');

    component.catNombre = 'Balones de Fútbol';
    component.catDescripcion = 'Pelotas reglamentarias';
    await component.saveCategory();

    expect(mockCatalogService.createCategory).toHaveBeenCalledWith(
      1,
      'Balones de Fútbol',
      '[icon:sports_soccer] Pelotas reglamentarias',
    );
    expect(component.categoryModalOpen()).toBe(false);
  });

  it('resuelve el icono del producto heredándolo de su categoría', () => {
    const prodSinIcono = {
      id: 201,
      categoriaId: 1,
      categoriaNombre: 'Bebidas Rehidratantes',
      codigoBarras: '775999',
      nombre: 'Agua Mineral 625ml',
      precioCompra: 1.0,
      precioVenta: 2.5,
      stock: 15,
      stockMinimo: 5,
    };
    const icono = component.obtenerIconoProducto(prodSinIcono as any);
    expect(icono).toBe('local_drink');
  });
});
