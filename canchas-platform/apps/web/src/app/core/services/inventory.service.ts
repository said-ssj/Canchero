import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';
import {
  AjusteInventarioRequest,
  MovimientoKardex,
  ResumenInventario,
  TransformacionRequest,
  TransformacionResultado,
} from '@shared/models/pos.model';

@Injectable({ providedIn: 'root' })
export class InventoryService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/pos/inventory`;

  private readonly summaryCache = new Map<number, { timestamp: number; data: ResumenInventario }>();
  private readonly movementsCache = new Map<number, { timestamp: number; data: MovimientoKardex[] }>();
  private readonly CACHE_TTL_MS = 60_000;

  clearCache(): void {
    this.summaryCache.clear();
    this.movementsCache.clear();
  }

  readonly summary = signal<ResumenInventario | null>(null);
  readonly movements = signal<MovimientoKardex[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  async loadSummary(sedeId: number, force = false): Promise<ResumenInventario> {
    if (!force) {
      const cached = this.summaryCache.get(sedeId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.summary.set(cached.data);
        return cached.data;
      }
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(
        this.http.get<ResumenInventario>(`${this.apiUrl}/summary`, {
          params: { sedeId: String(sedeId) },
        }),
      );
      if (data) {
        this.summaryCache.set(sedeId, { timestamp: Date.now(), data });
      }
      this.summary.set(data);
      return data;
    } catch (err: any) {
      const msg = err?.error?.error || 'No se pudo cargar el resumen de inventario';
      this.error.set(msg);
      throw new Error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  async loadMovements(sedeId: number, force = false): Promise<MovimientoKardex[]> {
    if (!force) {
      const cached = this.movementsCache.get(sedeId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.movements.set(cached.data);
        return cached.data;
      }
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(
        this.http.get<MovimientoKardex[]>(`${this.apiUrl}`, {
          params: { sedeId: String(sedeId) },
        }),
      );
      const res = data || [];
      this.movementsCache.set(sedeId, { timestamp: Date.now(), data: res });
      this.movements.set(res);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'No se pudo consultar el historial del kardex';
      this.error.set(msg);
      throw new Error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  private onMutation(sedeId: number): void {
    this.summaryCache.delete(sedeId);
    this.movementsCache.delete(sedeId);
  }

  async registerEntry(
    sedeId: number,
    productoId: number,
    cantidad: number,
    precioCompra: number,
    motivo: string,
  ): Promise<MovimientoKardex> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<MovimientoKardex>(`${this.apiUrl}/entries`, {
          sedeId,
          productoId,
          cantidad,
          precioCompra,
          motivo: motivo.trim() || 'Ingreso de mercadería / Reposición',
        }),
      );
      this.onMutation(sedeId);
      await Promise.all([this.loadSummary(sedeId, true), this.loadMovements(sedeId, true)]);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'Error al registrar ingreso de mercadería';
      this.error.set(msg);
      throw new Error(msg);
    }
  }

  async registerAdjustment(payload: AjusteInventarioRequest): Promise<MovimientoKardex> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<MovimientoKardex>(`${this.apiUrl}/adjustments`, payload),
      );
      this.onMutation(payload.sedeId);
      await Promise.all([this.loadSummary(payload.sedeId, true), this.loadMovements(payload.sedeId, true)]);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'Error al asentar ajuste de inventario';
      this.error.set(msg);
      throw new Error(msg);
    }
  }

  async executeTransformation(payload: TransformacionRequest): Promise<TransformacionResultado> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<TransformacionResultado>(`${this.apiUrl}/transformations`, payload),
      );
      this.onMutation(payload.sedeId);
      await Promise.all([this.loadSummary(payload.sedeId, true), this.loadMovements(payload.sedeId, true)]);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'Error al ejecutar transformación / fraccionamiento';
      this.error.set(msg);
      throw new Error(msg);
    }
  }

  async transferStock(payload: {
    sourceSedeId: number;
    targetSedeId: number;
    productoId: number;
    cantidad: number;
    motivo?: string;
  }): Promise<{
    sourceSedeId: number;
    targetSedeId: number;
    productoId: number;
    cantidad: number;
    stockOrigenFinal: number;
    stockDestinoFinal: number;
    sourceKardexId: number;
    targetKardexId: number;
    mensaje: string;
  }> {
    this.error.set('');
    try {
      const res = await firstValueFrom(
        this.http.post<any>(`${this.apiUrl}/transfers`, payload),
      );
      this.onMutation(payload.sourceSedeId);
      this.onMutation(payload.targetSedeId);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || err?.error?.message || 'Error al trasladar mercadería entre sedes';
      this.error.set(msg);
      throw new Error(msg);
    }
  }
}
