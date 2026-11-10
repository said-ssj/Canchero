import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AdminCompras } from './admin-compras';
import { AdminContext } from '../admin-context.service';
import { PurchaseService } from '@core/services/purchase.service';
import { CatalogService } from '@core/services/catalog.service';
import { ToastService } from '@core/services/toast.service';
import { Compra, Proveedor } from '@shared/models/purchase.model';

describe('AdminCompras component', () => {
  let fixture: ComponentFixture<AdminCompras>;
  let component: AdminCompras;

  const mockVenue = signal<{ id: number; nombre: string } | null>({ id: 1, nombre: 'Sede Principal' });

  const mockSuppliers: Proveedor[] = [
    {
      id: 1,
      sedeId: 1,
      ruc: '20100113610',
      razonSocial: 'Backus y Johnston S.A.A.',
      contacto: 'Carlos Ventas',
      telefono: '013113000',
      correo: 'pedidos@backus.com.pe',
      estado: 'A',
    },
    {
      id: 2,
      sedeId: 1,
      ruc: '20415868019',
      razonSocial: 'Arca Continental Lindley',
      contacto: 'María Distribución',
      telefono: '013116000',
      correo: 'ventas@arcacontal.com',
      estado: 'A',
    },
  ];

  const mockPurchases: Compra[] = [
    {
      id: 101,
      sedeId: 1,
      proveedorId: 1,
      proveedorNombre: 'Backus y Johnston S.A.A.',
      proveedorRuc: '20100113610',
      numeroComprobante: 'F001-002819',
      tipoComprobante: 'factura',
      fechaEmision: '2026-11-08T10:00:00Z',
      subtotal: 100.0,
      igv: 18.0,
      total: 118.0,
      estado: 'RECIBIDA',
      items: [{ productoId: 10, productoNombre: 'Cerveza Cristal', cantidad: 24, costoUnitario: 4.16, subtotal: 100.0 }],
    },
    {
      id: 102,
      sedeId: 1,
      proveedorId: 2,
      proveedorNombre: 'Arca Continental Lindley',
      proveedorRuc: '20415868019',
      numeroComprobante: 'OC-000450',
      tipoComprobante: 'orden',
      fechaEmision: '2026-11-08T11:00:00Z',
      subtotal: 200.0,
      igv: 36.0,
      total: 236.0,
      estado: 'EMITIDA',
      items: [{ productoId: 11, productoNombre: 'Powerade 500ml', cantidad: 40, costoUnitario: 5.0, subtotal: 200.0 }],
    },
  ];

  const mockProducts = signal([
    {
      id: 10,
      categoriaId: 1,
      categoriaNombre: 'Bebidas',
      codigoBarras: '775010',
      nombre: 'Cerveza Cristal',
      precioCompra: 4.16,
      precioVenta: 7.0,
      stock: 48,
      stockMinimo: 12,
      unidadMedida: 'bot',
      estado: 'A' as const,
    },
    {
      id: 11,
      categoriaId: 1,
      categoriaNombre: 'Bebidas',
      codigoBarras: '775011',
      nombre: 'Powerade 500ml',
      precioCompra: 5.0,
      precioVenta: 8.0,
      stock: 20,
      stockMinimo: 10,
      unidadMedida: 'bot',
      estado: 'A' as const,
    },
  ]);

  const mockPurchaseService = {
    suppliers: signal<Proveedor[]>(mockSuppliers),
    purchases: signal<Compra[]>(mockPurchases),
    loading: signal(false),
    error: signal(''),
    loadSuppliers: vi.fn().mockResolvedValue(mockSuppliers),
    loadPurchases: vi.fn().mockResolvedValue(mockPurchases),
    createSupplier: vi.fn().mockResolvedValue({ id: 3, ruc: '20555666771', razonSocial: 'Nuevo Proveedor', estado: 'A' }),
    updateSupplier: vi.fn().mockResolvedValue({ id: 1, ruc: '20100113610', razonSocial: 'Backus Editado', estado: 'A' }),
    toggleSupplierStatus: vi.fn().mockResolvedValue('I'),
    createPurchase: vi.fn().mockResolvedValue({ id: 103, numeroComprobante: 'F001-9999', estado: 'RECIBIDA' }),
    receivePurchase: vi.fn().mockResolvedValue({ id: 102, estado: 'RECIBIDA' }),
    cancelPurchase: vi.fn().mockResolvedValue({ id: 102, estado: 'ANULADA' }),
  };

  const mockCatalogService = {
    products: mockProducts,
    loading: signal(false),
    error: signal(''),
    loadProducts: vi.fn().mockResolvedValue(mockProducts()),
  };

  const mockToast = {
    show: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [AdminCompras],
      providers: [
        provideRouter([]),
        {
          provide: AdminContext,
          useValue: {
            venue: mockVenue,
            loading: signal(false),
            error: signal(''),
          },
        },
        { provide: PurchaseService, useValue: mockPurchaseService },
        { provide: CatalogService, useValue: mockCatalogService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminCompras);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders and calculates purchase KPIs correctly', () => {
    expect(component.currentSedeName()).toBe('Sede Principal');
    expect(component.totalCompras()).toBe(118.0); // Only received purchases count in total: 118
    expect(component.recibidasCount()).toBe(1);
    expect(component.pendientesCount()).toBe(1); // 1 emitida
    expect(component.proveedoresActivosCount()).toBe(2);
  });

  it('filters purchases by status and search query', () => {
    expect(component.filteredPurchases().length).toBe(2);

    component.purchaseStatusFilter.set('EMITIDA');
    expect(component.filteredPurchases().length).toBe(1);
    expect(component.filteredPurchases()[0].numeroComprobante).toBe('OC-000450');

    component.purchaseStatusFilter.set('TODAS');
    component.purchaseSearch.set('Cristal');
    expect(component.filteredPurchases().length).toBe(0); // searched on comp/ruc/prov

    component.purchaseSearch.set('Backus');
    expect(component.filteredPurchases().length).toBe(1);
    expect(component.filteredPurchases()[0].proveedorNombre).toContain('Backus');
  });

  it('filters suppliers by search query', () => {
    expect(component.filteredSuppliers().length).toBe(2);
    component.supplierSearch.set('Lindley');
    expect(component.filteredSuppliers().length).toBe(1);
    expect(component.filteredSuppliers()[0].razonSocial).toContain('Arca Continental');
  });

  it('validates RUC when saving supplier', async () => {
    component.openNewSupplierModal();
    component.supRuc.set('12345'); // invalid
    component.supRazonSocial.set('Empresa Test');

    await component.saveSupplier();

    expect(component.supError()).toContain('RUC');
    expect(mockPurchaseService.createSupplier).not.toHaveBeenCalled();
  });

  it('adds partida to new purchase and calculates total correctly', () => {
    component.openNewPurchaseModal();
    component.itemProductId.set(10);
    component.itemQuantity.set(10);
    component.itemUnitCost.set(4.0);

    component.addPartida();

    expect(component.purchaseItems().length).toBe(1);
    expect(component.newPurchaseSubtotal()).toBe(40.0);
    expect(component.newPurchaseIgv()).toBe(7.2);
    expect(component.newPurchaseTotal()).toBe(47.2);
  });

  it('creates purchase and triggers toast', async () => {
    component.openNewPurchaseModal();
    component.purchaseSupplierId.set(1);
    component.itemProductId.set(10);
    component.itemQuantity.set(10);
    component.itemUnitCost.set(4.0);
    component.addPartida();

    await component.savePurchase();

    expect(mockPurchaseService.createPurchase).toHaveBeenCalled();
    expect(mockToast.show).toHaveBeenCalled();
    expect(component.showPurchaseModal()).toBe(false);
  });
});
