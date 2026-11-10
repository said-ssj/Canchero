import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';
import {
  CategoriaProducto,
  Producto,
  inferirIconoCategoria,
  parseCategoryIconAndDescription,
} from '@shared/models/pos.model';

export interface ProductPayload {
  sedeId: number;
  categoriaId: number;
  nombre: string;
  codigoBarras?: string;
  descripcion?: string;
  contenido: number;
  unidadMedida: string;
  precioCompra: number;
  precioVenta: number;
  stockInicial?: number;
  stockMinimo: number;
  fotoUrl?: string;
}

@Injectable({ providedIn: 'root' })
export class CatalogService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/pos/catalog`;
  private readonly posUrl = `${environment.apiUrl}/pos`;

  private readonly productsCache = new Map<string, { timestamp: number; data: Producto[] }>();
  private readonly categoriesCache = new Map<number, { timestamp: number; data: CategoriaProducto[] }>();
  private readonly CACHE_TTL_MS = 60_000;

  readonly categories = signal<CategoriaProducto[]>([]);
  readonly products = signal<Producto[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');

  async loadCategories(
    sedeId: number,
    includeInactive = true,
    force = false,
  ): Promise<CategoriaProducto[]> {
    if (!force) {
      const cached = this.categoriesCache.get(sedeId);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.categories.set(cached.data);
        return cached.data;
      }
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const data = await firstValueFrom(
        this.http.get<CategoriaProducto[]>(`${this.url}/categories`, {
          params: { sedeId, includeInactive: String(includeInactive) },
        }),
      );
      const res: CategoriaProducto[] = (data || []).map((c) => {
        const parsed = parseCategoryIconAndDescription(c.descripcion, c.nombre);
        return {
          ...c,
          icono: parsed.icono,
          descripcion: parsed.descripcion,
        };
      });
      this.categoriesCache.set(sedeId, { timestamp: Date.now(), data: res });
      this.categories.set(res);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'No se pudieron cargar las categorías';
      this.error.set(msg);
      throw new Error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  async loadProducts(
    sedeId: number,
    filters?: { estado?: string; categoriaId?: number; buscar?: string },
    force = false,
  ): Promise<Producto[]> {
    const cacheKey = `${sedeId}_${filters?.estado || 'ALL'}_${filters?.categoriaId || 0}_${filters?.buscar?.trim() || ''}`;
    if (!force && !filters?.buscar?.trim()) {
      const cached = this.productsCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
        this.products.set(cached.data);
        return cached.data;
      }
    }
    this.loading.set(true);
    this.error.set('');
    const params: Record<string, string> = { sedeId: String(sedeId) };
    if (filters?.estado) params['estado'] = filters.estado;
    if (filters?.categoriaId && filters.categoriaId > 0)
      params['categoriaId'] = String(filters.categoriaId);
    if (filters?.buscar?.trim()) params['buscar'] = filters.buscar.trim();

    try {
      const data = await firstValueFrom(
        this.http.get<Producto[]>(`${this.url}/products`, { params }),
      );
      const catMap = new Map<number, string>();
      this.categories().forEach((c) => catMap.set(c.id, c.icono || 'category'));

      const res: Producto[] = (data || []).map((p) => {
        const catIcon = p.categoriaId ? catMap.get(p.categoriaId) : undefined;
        const icono =
          (p.icono && p.icono !== 'inventory_2' && p.icono !== 'assignment_turned_in' ? p.icono : undefined) ||
          catIcon ||
          inferirIconoCategoria(p.categoriaNombre || p.nombre);
        return {
          ...p,
          icono,
        };
      });
      if (!filters?.buscar?.trim()) {
        this.productsCache.set(cacheKey, { timestamp: Date.now(), data: res });
      }
      this.products.set(res);
      return res;
    } catch (err: any) {
      const msg = err?.error?.error || 'No se pudieron cargar los productos del catálogo';
      this.error.set(msg);
      throw new Error(msg);
    } finally {
      this.loading.set(false);
    }
  }

  clearCache(): void {
    this.productsCache.clear();
    this.categoriesCache.clear();
  }

  async createCategory(
    sedeId: number,
    nombre: string,
    descripcion?: string,
  ): Promise<CategoriaProducto> {
    const res = await firstValueFrom(
      this.http.post<CategoriaProducto>(`${this.url}/categories`, {
        sedeId,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
      }),
    );
    this.categoriesCache.delete(sedeId);
    await this.loadCategories(sedeId, true, true);
    return res;
  }

  async updateCategory(
    id: number,
    sedeId: number,
    nombre: string,
    descripcion?: string,
  ): Promise<CategoriaProducto> {
    const res = await firstValueFrom(
      this.http.put<CategoriaProducto>(`${this.url}/categories/${id}`, {
        sedeId,
        nombre: nombre.trim(),
        descripcion: descripcion?.trim() || null,
      }),
    );
    this.categoriesCache.delete(sedeId);
    await this.loadCategories(sedeId, true, true);
    return res;
  }

  async toggleCategoryStatus(id: number, sedeId: number): Promise<string> {
    const res = await firstValueFrom(
      this.http.patch<{ id: string; estado: string }>(
        `${this.url}/categories/${id}/status`,
        {},
        { params: { sedeId } },
      ),
    );
    this.categoriesCache.delete(sedeId);
    await this.loadCategories(sedeId, true, true);
    return res.estado;
  }

  async createProduct(payload: ProductPayload): Promise<{ id: number }> {
    const res = await firstValueFrom(
      this.http.post<{ id: number }>(`${this.url}/products`, {
        ...payload,
        nombre: payload.nombre.trim(),
        codigoBarras: payload.codigoBarras?.trim() || null,
        descripcion: payload.descripcion?.trim() || null,
        stockInicial: payload.stockInicial ?? 0,
        stockMinimo: payload.stockMinimo ?? 5,
      }),
    );
    this.productsCache.clear();
    await this.loadProducts(payload.sedeId, undefined, true);
    return res;
  }

  async updateProduct(id: number, payload: ProductPayload): Promise<void> {
    await firstValueFrom(
      this.http.put(`${this.url}/products/${id}`, {
        ...payload,
        nombre: payload.nombre.trim(),
        codigoBarras: payload.codigoBarras?.trim() || null,
        descripcion: payload.descripcion?.trim() || null,
        stockMinimo: payload.stockMinimo ?? 5,
      }),
    );
    this.productsCache.clear();
    await this.loadProducts(payload.sedeId, undefined, true);
  }

  async toggleProductStatus(id: number, sedeId: number): Promise<string> {
    const res = await firstValueFrom(
      this.http.patch<{ id: string; estado: string }>(
        `${this.url}/products/${id}/status`,
        {},
        { params: { sedeId } },
      ),
    );
    this.productsCache.clear();
    await this.loadProducts(sedeId, undefined, true);
    return res.estado;
  }

  async adjustStock(
    sedeId: number,
    productoId: number,
    cantidad: number,
    motivo: string,
    precioCompra: number,
  ): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.posUrl}/inventory/entries`, {
        sedeId,
        productoId,
        cantidad,
        precioCompra,
        motivo: motivo.trim() || 'Ajuste de inventario',
      }),
    );
    this.productsCache.clear();
    await this.loadProducts(sedeId, undefined, true);
  }
}
