import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '@env/environment';
import type {
  CuentaPorCobrar,
  CreditSummary,
  CrearCuentaCreditoRequest,
  RegistrarAbonoRequest,
  EstadoCuentaCredito,
} from '@shared/models/credit.model';

@Injectable({
  providedIn: 'root',
})
export class CreditService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl || 'http://localhost:8080/api';

  readonly cuentas = signal<CuentaPorCobrar[]>([]);
  readonly resumen = signal<CreditSummary>({
    totalPorCobrar: 0,
    totalVencido: 0,
    totalCobradoMes: 0,
    clientesDeudores: 0,
    cuentasVencidas: 0,
  });
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly filtroEstado = signal<EstadoCuentaCredito>('TODOS');
  readonly busqueda = signal<string>('');

  private lastLoadedSedeId: number | null = null;
  private lastFetchTime = 0;
  private readonly CACHE_TTL_MS = 60000;

  readonly cuentasFiltradas = computed<CuentaPorCobrar[]>(() => {
    const estado = this.filtroEstado();
    const query = this.busqueda().trim().toLowerCase();

    return this.cuentas().filter((c) => {
      const matchEstado =
        estado === 'TODOS' || c.estado.toUpperCase() === estado.toUpperCase();
      const matchQuery =
        !query ||
        c.clienteNombre.toLowerCase().includes(query) ||
        (c.equipo && c.equipo.toLowerCase().includes(query)) ||
        (c.clienteDocumento && c.clienteDocumento.includes(query)) ||
        c.concepto.toLowerCase().includes(query);
      return matchEstado && matchQuery;
    });
  });

  async cargarCuentas(sedeId: number, force = false): Promise<void> {
    const now = Date.now();
    if (
      !force &&
      this.lastLoadedSedeId === sedeId &&
      now - this.lastFetchTime < this.CACHE_TTL_MS &&
      this.cuentas().length > 0
    ) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const [cuentasData, resumenData] = await Promise.all([
        firstValueFrom(
          this.http
            .get<CuentaPorCobrar[]>(`${this.apiUrl}/credits?sedeId=${sedeId}`)
            .pipe(timeout(6000)),
        ),
        firstValueFrom(
          this.http
            .get<CreditSummary>(`${this.apiUrl}/credits/summary?sedeId=${sedeId}`)
            .pipe(timeout(6000)),
        ),
      ]);

      this.cuentas.set(Array.isArray(cuentasData) ? cuentasData : []);
      const validSummary =
        resumenData && typeof (resumenData as any).totalPorCobrar === 'number'
          ? resumenData
          : null;
      this.resumen.set(
        validSummary ?? {
          totalPorCobrar: 0,
          totalVencido: 0,
          totalCobradoMes: 0,
          clientesDeudores: 0,
          cuentasVencidas: 0,
        },
      );
      this.lastLoadedSedeId = sedeId;
      this.lastFetchTime = Date.now();
    } catch (err: any) {
      console.warn('Backend /api/credits no disponible, usando fallback local:', err);
      this.cargarFallbackLocal(sedeId);
    } finally {
      this.loading.set(false);
    }
  }

  async crearCuenta(request: CrearCuentaCreditoRequest): Promise<CuentaPorCobrar> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const created = await firstValueFrom(
        this.http.post<CuentaPorCobrar>(`${this.apiUrl}/credits`, request).pipe(timeout(8000)),
      );
      this.cuentas.update((list) => [created, ...list]);
      this.recalcularResumenLocal();
      this.guardarEnStorage(request.sedeId);
      return created;
    } catch (err: any) {
      console.warn('Fallback al crear cuenta de crédito:', err);
      const nueva: CuentaPorCobrar = {
        id: Date.now(),
        sedeId: request.sedeId,
        clienteNombre: request.clienteNombre,
        clienteDocumento: request.clienteDocumento || '',
        telefono: request.telefono || '',
        equipo: request.equipo || '',
        montoOriginal: Number(request.montoOriginal.toFixed(2)),
        saldo: Number(request.montoOriginal.toFixed(2)),
        totalAbonado: 0,
        concepto: request.concepto,
        fechaEmision: new Date().toISOString(),
        fechaVencimiento:
          request.fechaVencimiento ||
          new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
        estado: 'PENDIENTE',
        abonos: [],
      };
      this.cuentas.update((list) => [nueva, ...list]);
      this.recalcularResumenLocal();
      this.guardarEnStorage(request.sedeId);
      return nueva;
    } finally {
      this.loading.set(false);
    }
  }

  async registrarAbono(cuentaId: number, request: RegistrarAbonoRequest): Promise<CuentaPorCobrar> {
    this.loading.set(true);
    this.error.set(null);
    try {
      const updated = await firstValueFrom(
        this.http
          .post<CuentaPorCobrar>(`${this.apiUrl}/credits/${cuentaId}/payments`, request)
          .pipe(timeout(8000)),
      );
      this.cuentas.update((list) => list.map((c) => (c.id === cuentaId ? updated : c)));
      this.recalcularResumenLocal();
      if (this.lastLoadedSedeId) this.guardarEnStorage(this.lastLoadedSedeId);
      return updated;
    } catch (err: any) {
      console.warn('Fallback al registrar abono:', err);
      let cuentaModificada!: CuentaPorCobrar;
      this.cuentas.update((list) =>
        list.map((c) => {
          if (c.id !== cuentaId) return c;
          const abonoMonto = Number(request.monto.toFixed(2));
          const nuevoSaldo = Number(Math.max(0, c.saldo - abonoMonto).toFixed(2));
          const nuevoTotalAbonado = Number((c.totalAbonado + abonoMonto).toFixed(2));
          const nuevoEstado = nuevoSaldo <= 0 ? 'CANCELADA' : c.estado;
          const nuevoAbono = {
            id: Date.now(),
            cuentaId: c.id,
            sesionCajaId: request.sesionCajaId,
            fecha: new Date().toISOString(),
            monto: abonoMonto,
            medioPago: request.medioPago,
            nroOperacion: request.nroOperacion,
            observacion: request.observacion,
            cajeroNombre: 'Cajero Mostrador',
          };
          cuentaModificada = {
            ...c,
            saldo: nuevoSaldo,
            totalAbonado: nuevoTotalAbonado,
            estado: nuevoEstado,
            abonos: [nuevoAbono, ...c.abonos],
          };
          return cuentaModificada;
        }),
      );
      this.recalcularResumenLocal();
      if (this.lastLoadedSedeId) this.guardarEnStorage(this.lastLoadedSedeId);
      return cuentaModificada;
    } finally {
      this.loading.set(false);
    }
  }

  private recalcularResumenLocal(): void {
    const list = this.cuentas();
    const hoyStr = new Date().toISOString().slice(0, 10);
    let totalPorCobrar = 0;
    let totalVencido = 0;
    let clientesDeudores = 0;
    let cuentasVencidas = 0;

    for (const c of list) {
      if (c.saldo > 0) {
        totalPorCobrar += c.saldo;
        clientesDeudores++;
      }
      if (c.estado === 'VENCIDA' || (c.saldo > 0 && c.fechaVencimiento < hoyStr)) {
        totalVencido += c.saldo;
        cuentasVencidas++;
      }
    }

    this.resumen.set({
      totalPorCobrar: Number(totalPorCobrar.toFixed(2)),
      totalVencido: Number(totalVencido.toFixed(2)),
      totalCobradoMes: Number(
        list
          .reduce(
            (sum, c) =>
              sum +
              c.abonos.reduce((s, a) => s + (a.fecha.slice(0, 7) === hoyStr.slice(0, 7) ? a.monto : 0), 0),
            0,
          )
          .toFixed(2),
      ),
      clientesDeudores,
      cuentasVencidas,
    });
  }

  private getStorageKey(sedeId: number): string {
    return `canchero_credits_data_v2_${sedeId}`;
  }

  private guardarEnStorage(sedeId: number): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(this.getStorageKey(sedeId), JSON.stringify(this.cuentas()));
    } catch (e) {
      console.warn('No se pudo guardar créditos en localStorage:', e);
    }
  }

  private cargarFallbackLocal(sedeId: number): void {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem(this.getStorageKey(sedeId));
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            this.cuentas.set(parsed);
            this.recalcularResumenLocal();
            return;
          }
        }
      } catch (e) {
        console.warn('Error leyendo créditos de localStorage:', e);
      }
    }

    // Inicio limpio para la sede: sin datos inventados
    this.cuentas.set([]);
    this.recalcularResumenLocal();
    this.lastLoadedSedeId = sedeId;
    this.lastFetchTime = Date.now();
  }
}
