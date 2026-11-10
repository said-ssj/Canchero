import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AdminInventario } from './admin-inventario';
import { AdminContext } from '../admin-context.service';
import { InventoryService } from '@core/services/inventory.service';
import { CatalogService } from '@core/services/catalog.service';
import { ToastService } from '@core/services/toast.service';
import { MovimientoKardex, ResumenInventario } from '@shared/models/pos.model';

describe('AdminInventario component', () => {
  let fixture: ComponentFixture<AdminInventario>;
  let component: AdminInventario;

  const mockVenue = signal<{ id: number; nombre: string } | null>({ id: 1, nombre: 'Sede Principal' });

  const mockSummary: ResumenInventario = {
    sedeId: 1,
    totalValorizado: 450.0,
    totalUnidades: 85,
    totalProductos: 4,
    productosBajoStock: 1,
    productosAgotados: 0,
    movimientosMes: 12,
    proyeccionesAgotamiento: [
      {
        productoId: 10,
        nombre: 'Gatorade 500ml',
        stockActual: 15,
        stockMinimo: 5,
        promedioDiarioVenta: 5.0,
        diasRestantesEstimados: 3.0,
        nivelAlerta: 'CRITICO',
      },
      {
        productoId: 11,
        nombre: 'Agua Mineral 600ml',
        stockActual: 50,
        stockMinimo: 10,
        promedioDiarioVenta: 2.0,
        diasRestantesEstimados: 25.0,
        nivelAlerta: 'OPTIMO',
      },
    ],
  };

  const mockMovements: MovimientoKardex[] = [
    {
      id: 1,
      sedeId: 1,
      productoId: 10,
      productoNombre: 'Gatorade 500ml',
      fecha: '2026-11-08T10:00:00Z',
      tipo: '+',
      cantidad: 20,
      precioUnitario: 3.5,
      saldoStock: 20,
      motivo: 'Ingreso inicial proveedor',
    },
    {
      id: 2,
      sedeId: 1,
      productoId: 10,
      productoNombre: 'Gatorade 500ml',
      fecha: '2026-11-08T11:00:00Z',
      tipo: '-',
      cantidad: 2,
      precioUnitario: 3.5,
      saldoStock: 18,
      motivo: 'Ajuste [MERMA]: Botella rota',
    },
    {
      id: 3,
      sedeId: 1,
      productoId: 11,
      productoNombre: 'Agua Mineral 600ml',
      fecha: '2026-11-08T12:00:00Z',
      tipo: '+',
      cantidad: 12,
      precioUnitario: 1.0,
      saldoStock: 50,
      motivo: 'Transformación: entrada desde Fardo Agua x 12',
    },
  ];

  const mockProducts = signal([
    {
      id: 10,
      categoriaId: 1,
      categoriaNombre: 'Bebidas',
      codigoBarras: '775010',
      nombre: 'Gatorade 500ml',
      precioCompra: 3.5,
      precioVenta: 6.0,
      stock: 15,
      stockMinimo: 5,
      unidadMedida: 'bot',
      estado: 'A' as const,
    },
    {
      id: 11,
      categoriaId: 1,
      categoriaNombre: 'Bebidas',
      codigoBarras: '775011',
      nombre: 'Agua Mineral 600ml',
      precioCompra: 1.0,
      precioVenta: 2.5,
      stock: 50,
      stockMinimo: 10,
      unidadMedida: 'bot',
      estado: 'A' as const,
    },
  ]);

  const mockInventoryService = {
    summary: signal<ResumenInventario | null>(mockSummary),
    movements: signal<MovimientoKardex[]>(mockMovements),
    loading: signal(false),
    error: signal(''),
    loadSummary: vi.fn().mockResolvedValue(mockSummary),
    loadMovements: vi.fn().mockResolvedValue(mockMovements),
    registerEntry: vi.fn().mockResolvedValue(mockMovements[0]),
    registerAdjustment: vi.fn().mockResolvedValue(mockMovements[1]),
    executeTransformation: vi.fn().mockResolvedValue({
      productoOrigenId: 10,
      productoOrigenNombre: 'Gatorade 500ml',
      cantidadOrigen: 1,
      stockFinalOrigen: 14,
      productoDestinoId: 11,
      productoDestinoNombre: 'Agua Mineral 600ml',
      cantidadDestino: 6,
      stockFinalDestino: 56,
      costoUnitarioDestino: 0.58,
      fecha: '2026-11-08',
      motivo: 'Fraccionamiento',
    }),
    transferStock: vi.fn().mockResolvedValue({
      sourceSedeId: 1,
      targetSedeId: 2,
      productoId: 10,
      cantidad: 5,
      stockOrigenFinal: 10,
      stockDestinoFinal: 5,
      sourceKardexId: 101,
      targetKardexId: 102,
      mensaje: 'Traslado completado correctamente',
    }),
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
      imports: [AdminInventario],
      providers: [
        provideRouter([]),
        {
          provide: AdminContext,
          useValue: {
            venue: mockVenue,
            venues: signal([{ id: 1, nombre: 'Sede Principal' }, { id: 2, nombre: 'Sede Secundaria' }]),
            loading: signal(false),
            error: signal(''),
          },
        },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: CatalogService, useValue: mockCatalogService },
        { provide: ToastService, useValue: mockToast },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminInventario);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('renders and displays summary metrics from inventory service', () => {
    expect(component.currentSedeName()).toBe('Sede Principal');
    expect(component.summary()?.totalValorizado).toBe(450.0);
    expect(component.summary()?.totalUnidades).toBe(85);
    expect(component.summary()?.productosBajoStock).toBe(1);
  });

  it('filters movements by query and movement type', () => {
    expect(component.filteredMovements().length).toBe(3);

    component.tipoFilter.set('MERMA');
    expect(component.filteredMovements().length).toBe(1);
    expect(component.filteredMovements()[0].motivo).toContain('MERMA');

    component.tipoFilter.set('TRANSFORMACION');
    expect(component.filteredMovements().length).toBe(1);
    expect(component.filteredMovements()[0].motivo).toContain('Transformación');

    component.tipoFilter.set('TODOS');
    component.searchQuery.set('Agua');
    expect(component.filteredMovements().length).toBe(1);
    expect(component.filteredMovements()[0].productoNombre).toBe('Agua Mineral 600ml');
  });

  it('opens and closes entry modal', () => {
    expect(component.showEntryModal()).toBe(false);
    component.openEntryModal();
    expect(component.showEntryModal()).toBe(true);
    expect(component.entryQuantity()).toBe(1);
  });

  it('submits adjustment and triggers toast notification', async () => {
    component.openAdjustmentModal();
    component.adjProduct.set(10);
    component.adjType.set('ROTURA');
    component.adjQuantity.set(2);
    component.adjReason.set('Se quebraron al caer del estante');

    await component.submitAdjustment();

    expect(mockInventoryService.registerAdjustment).toHaveBeenCalledWith({
      sedeId: 1,
      productoId: 10,
      tipoAjuste: 'ROTURA',
      cantidad: 2,
      motivo: 'Se quebraron al caer del estante',
    });
    expect(mockToast.show).toHaveBeenCalled();
    expect(component.showAdjustmentModal()).toBe(false);
  });

  it('calculates proportional cost during transformation setup', () => {
    component.openTransformationModal();
    component.transOriginProduct.set(10); // Gatorade 500ml: precioCompra 3.5
    component.transOriginQuantity.set(2); // total cost = 7.0
    component.transDestProduct.set(11); // Agua Mineral 600ml
    component.transDestQuantity.set(10); // 7.0 / 10 = 0.70

    expect(component.estimatedCostPerDestUnit()).toBe(0.7);
  });

  it('rejects transformation if origin equals destination', async () => {
    component.openTransformationModal();
    component.transOriginProduct.set(10);
    component.transDestProduct.set(10); // same!

    await component.submitTransformation();

    expect(mockToast.show).toHaveBeenCalledWith(
      expect.stringContaining('El producto origen y destino no pueden ser el mismo'),
    );
    expect(mockInventoryService.executeTransformation).not.toHaveBeenCalled();
  });

  it('submits transfer to another venue of the same owner and triggers toast', async () => {
    component.openTransferModal();
    expect(component.showTransferModal()).toBe(true);
    expect(component.canTransfer()).toBe(true);
    expect(component.otherVenues().length).toBe(1);

    component.transferProduct.set(10);
    component.transferTargetVenue.set(2);
    component.transferQuantity.set(5);
    component.transferReason.set('Reposición para sede Norte');

    await component.submitTransfer();

    expect(mockInventoryService.transferStock).toHaveBeenCalledWith({
      sourceSedeId: 1,
      targetSedeId: 2,
      productoId: 10,
      cantidad: 5,
      motivo: 'Reposición para sede Norte',
    });
    expect(mockToast.show).toHaveBeenCalledWith(expect.stringContaining('Traslado completado'));
    expect(component.showTransferModal()).toBe(false);
  });
});
