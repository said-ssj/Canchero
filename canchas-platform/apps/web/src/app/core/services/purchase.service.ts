import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';
import {
  Compra,
  CrearCompraPayload,
  CrearProveedorPayload,
  Proveedor,
} from '@shared/models/purchase.model';

@Injectable({ providedIn: 'root' })
export class PurchaseService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/pos/purchases`;

  private readonly suppliersCache = new Map<number, { timestamp: number; data: Proveedor[] }>();
  private readonly purchasesCache = new Map<number, { timestamp: number; data: Compra[] }>();
  private readonly CACHE_TTL_MS = 60_000;

  clearCache(): void {
    this.suppliersCache.clear();
    this.purchasesCache.clear();
  }

  readonly suppliers = signal<Proveedor[]>([]);
  readonly purchases = signal<Compra[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  // =========================================================================
  // PROVEEDORES
  // =========================================================================

  async loadSuppliers(sedeId: number, includeInactive = false, force = false): Promise<Proveedor[]> {
    if (!force) {
      const cached = this.suppliersCache.get(sedeId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.suppliers.set(cached.data);
        return cached.data;
      }
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(
        this.http.get<Proveedor[]>(`${this.apiUrl}/suppliers`, {
          params: { sedeId: String(sedeId), includeInactive: String(includeInactive) },
        }),
      );
      const res = data || [];
      this.suppliersCache.set(sedeId, { timestamp: Date.now(), data: res });
      this.suppliers.set(res);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'No se pudieron cargar los proveedores';
      this.error.set(msg);
      throw new Error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  async createSupplier(payload: CrearProveedorPayload): Promise<Proveedor> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<Proveedor>(`${this.apiUrl}/suppliers`, payload),
      );
      await this.loadSuppliers(payload.sedeId, true);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'Error al crear proveedor';
      this.error.set(msg);
      throw new Error(msg);
    }
  }

  async updateSupplier(id: number, payload: CrearProveedorPayload): Promise<Proveedor> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.put<Proveedor>(`${this.apiUrl}/suppliers/${id}`, payload),
      );
      await this.loadSuppliers(payload.sedeId, true);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'Error al actualizar proveedor';
      this.error.set(msg);
      throw new Error(msg);
    }
  }

  async toggleSupplierStatus(id: number, sedeId: number): Promise<string> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.patch<{ id: number; estado: string }>(
          `${this.apiUrl}/suppliers/${id}/status`,
          {},
          { params: { sedeId: String(sedeId) } },
        ),
      );
      await this.loadSuppliers(sedeId, true);
      return res.estado;
    } catch (err: any) {
      const msg = err?.error?.error || 'Error al cambiar estado del proveedor';
      this.error.set(msg);
      throw new Error(msg);
    }
  }

  // =========================================================================
  // COMPRAS
  // =========================================================================

  async loadPurchases(sedeId: number, force = false): Promise<Compra[]> {
    if (!force) {
      const cached = this.purchasesCache.get(sedeId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.purchases.set(cached.data);
        return cached.data;
      }
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(
        this.http.get<Compra[]>(`${this.apiUrl}/purchases`, {
          params: { sedeId: String(sedeId) },
        }),
      );
      const res = data || [];
      this.purchasesCache.set(sedeId, { timestamp: Date.now(), data: res });
      this.purchases.set(res);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'No se pudo cargar el historial de compras';
      this.error.set(msg);
      throw new Error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  async getPurchase(id: number, sedeId: number): Promise<Compra> {
    return firstValueFrom(
      this.http.get<Compra>(`${this.apiUrl}/purchases/${id}`, {
        params: { sedeId: String(sedeId) },
      }),
    );
  }

  async createPurchase(payload: CrearCompraPayload): Promise<Compra> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<Compra>(`${this.apiUrl}/purchases`, payload),
      );
      this.purchasesCache.delete(payload.sedeId);
      await this.loadPurchases(payload.sedeId, true);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'Error al registrar la compra';
      this.error.set(msg);
      throw new Error(msg);
    }
  }

  async receivePurchase(id: number, sedeId: number): Promise<Compra> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<Compra>(`${this.apiUrl}/purchases/${id}/receive`, {}, {
          params: { sedeId: String(sedeId) },
        }),
      );
      this.purchasesCache.delete(sedeId);
      await this.loadPurchases(sedeId, true);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'Error al recepcionar la compra';
      this.error.set(msg);
      throw new Error(msg);
    }
  }

  async cancelPurchase(id: number, sedeId: number, motivo?: string): Promise<Compra> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<Compra>(`${this.apiUrl}/purchases/${id}/cancel`, { motivo: motivo || 'Anulada por usuario' }, {
          params: { sedeId: String(sedeId) },
        }),
      );
      await this.loadPurchases(sedeId);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'Error al anular la compra';
      this.error.set(msg);
      throw new Error(msg);
    }
  }
}
