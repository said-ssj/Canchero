import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController, TestRequest } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { DatabaseService } from '@core/supabase/database.service';
import { CajaService } from './caja.service';
import { PosService } from './pos.service';
import { AuthService } from '@core/auth/auth.service';

describe('POS venue loading isolation', () => {
  let service: PosService;
  let http: HttpTestingController;
  const selected = signal<number | null>(1);
  const currentUser = signal<{id: string} | null>({ id: 'owner-a' });
  beforeEach(() => {
    selected.set(1);
    currentUser.set({ id: 'owner-a' });
    vi.spyOn(PosService.prototype as any, 'setupRealtimeSubscriptions').mockImplementation(() => {});
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(), provideHttpClientTesting(),
      { provide: CajaService, useValue: {} },
      { provide: AuthService, useValue: { currentUser } },
      { provide: DatabaseService, useValue: { sedeOperativaId: selected, getSedeOperativaId: () => selected() ?? 0 } },
    ] });
    service = TestBed.inject(PosService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });
  function requests(): TestRequest[] {
    TestBed.tick();
    return http.match(request => request.method === 'GET');
  }
  function complete(batch: TestRequest[], sedeId: number, hasProducts: boolean): void {
    batch.forEach(request => request.flush(
      request.request.url.includes('/products?') && hasProducts
        ? [{ id: sedeId, sedeId, nombre: 'Producto', stock: 4, stockMinimo: 1 }] : []));
  }
  it('ignores late responses from the previously selected venue', async () => {
    const previous = requests();
    selected.set(2);
    const current = requests();
    complete(current, 2, true);
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    complete(previous, 1, true);
    await Promise.resolve();
    expect(service.productos().map(product => product.sedeId)).toEqual([2]);
  });
  it('clears old products and cart when the next venue has no inventory', async () => {
    complete(requests(), 1, true);
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    expect(service.productos()).toHaveLength(1);
    selected.set(2);
    const current = requests();
    expect(service.productos()).toEqual([]);
    complete(current, 2, false);
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    expect(service.productos()).toEqual([]);
    expect(service.carrito()).toEqual([]);
  });
  it('shows a load failure without generating fallback stock', async () => {
    requests().forEach(request => request.flush({ message: 'offline' }, { status: 503, statusText: 'Unavailable' }));
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    expect(service.loadError()).not.toBe('');
    expect(service.productos()).toEqual([]);
  });

  it('clears inventory on logout and ignores the previous owners pending response', async () => {
    const previous = requests();
    currentUser.set(null);
    expect(requests()).toEqual([]);
    complete(previous, 1, true);
    await Promise.resolve();
    expect(service.productos()).toEqual([]);
    expect(service.carrito()).toEqual([]);
  });

  it('reloads when the owner changes even if the selected venue id stays the same', async () => {
    const previous = requests();
    currentUser.set({ id: 'owner-b' });
    const current = requests();
    expect(current).toHaveLength(4);
    current.forEach(request => request.flush(null, { status: 403, statusText: 'Forbidden' }));
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    complete(previous, 1, true);
    await Promise.resolve();
    expect(service.productos()).toEqual([]);
    expect(service.loadError()).not.toBe('');
  });

  it('rejects rows from another venue or without a proven venue association', async () => {
    requests().forEach(request => request.flush(request.request.url.includes('/products?') ? [
      { id: 1, sedeId: 1, stock: 0 }, { id: 2, sedeId: 2, stock: 8 }, { id: 3, stock: 8 },
    ] : []));
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    expect(service.productos().map(product => product.id)).toEqual([1]);
    expect(service.productos()[0].stock).toBe(0);
  });

  it('does not accept a foreign product into the cart', async () => {
    complete(requests(), 1, true);
    await vi.waitFor(() => expect(service.loading()).toBe(false));
    expect(() => service.agregarAlCarrito({ id: 99, sedeId: 2, stock: 9 } as any)).toThrow();
    expect(service.carrito()).toEqual([]);
  });
});
