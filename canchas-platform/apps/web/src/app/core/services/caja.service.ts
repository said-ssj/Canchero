import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { supabase } from '@core/supabase/client';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
import type {
  ArqueoFila,
  ArqueoRegistro,
  DenominacionMonetaria,
  MovimientoManualCaja,
  SesionCaja,
} from '@shared/models/caja.model';


export const DENOMINACIONES_PERU: DenominacionMonetaria[] = [
  { id: 1, valor: 200, tipo: 'Billete', label: 'Billete S/ 200.00', icono: 'payments' },
  { id: 2, valor: 100, tipo: 'Billete', label: 'Billete S/ 100.00', icono: 'payments' },
  { id: 3, valor: 50, tipo: 'Billete', label: 'Billete S/ 50.00', icono: 'payments' },
  { id: 4, valor: 20, tipo: 'Billete', label: 'Billete S/ 20.00', icono: 'payments' },
  { id: 5, valor: 10, tipo: 'Billete', label: 'Billete S/ 10.00', icono: 'payments' },
  { id: 6, valor: 5, tipo: 'Moneda', label: 'Moneda S/ 5.00', icono: 'monetization_on' },
  { id: 7, valor: 2, tipo: 'Moneda', label: 'Moneda S/ 2.00', icono: 'monetization_on' },
  { id: 8, valor: 1, tipo: 'Moneda', label: 'Moneda S/ 1.00', icono: 'monetization_on' },
  { id: 9, valor: 0.5, tipo: 'Moneda', label: 'Moneda S/ 0.50', icono: 'toll' },
  { id: 10, valor: 0.2, tipo: 'Moneda', label: 'Moneda S/ 0.20', icono: 'toll' },
  { id: 11, valor: 0.1, tipo: 'Moneda', label: 'Moneda S/ 0.10', icono: 'toll' },
];

@Injectable({ providedIn: 'root' })
export class CajaService {
  private readonly auth = inject(AuthService);
  private readonly db = inject(DatabaseService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/cash`;
  private realtimeReady = false;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;

  // ===== SIGNALS =====
  readonly sesionActiva = signal<SesionCaja | null>(null);
  readonly movimientos = signal<MovimientoManualCaja[]>([]);
  readonly historialSesiones = signal<SesionCaja[]>([]);
  readonly historialArqueos = signal<ArqueoRegistro[]>([]);
  readonly loading = signal(false);
  readonly loadError = signal('');
  readonly paymentsReady = signal(false);
  readonly balanceError = signal('');
  readonly serverBalance = signal<{sesionId: number; pagosEfectivo: number; pagosDigital: number; montoSistema: number} | null>(null);
  private loadRequest = 0;

  // Cajas disponibles de la sede
  readonly cajasRegistradas = signal<Array<{ id: number; nombre: string; sedeId: number }>>([]);

  // ===== COMPUTED GENERALES =====
  readonly tieneSesionActiva = computed(() => this.sesionActiva() !== null);

  readonly totalIngresosManuales = computed(() => {
    return this.movimientos()
      .filter((m) => m.tipo === 'ingreso')
      .reduce((acc, m) => acc + m.monto, 0);
  });

  readonly totalEgresosManuales = computed(() => {
    return this.movimientos()
      .filter((m) => m.tipo === 'egreso')
      .reduce((acc, m) => acc + m.monto, 0);
  });

  readonly balanceMovimientosManuales = computed(() => {
    return this.totalIngresosManuales() - this.totalEgresosManuales();
  });

  /**
   * Pagos cobrados en efectivo durante el turno actual a través de reservas.
   * Si no hay pagos registrados, se toma 0 o el valor asociado al turno.
   */
  readonly pagosEfectivoTurno = computed(() => this.serverBalance()?.sesionId === this.sesionActiva()?.id ? this.serverBalance()?.pagosEfectivo ?? 0 : 0);

  /**
   * Cobros digitales (Yape, Plin, Tarjeta POS) para control sin mezclar con gaveta física.
   */
  readonly pagosDigitalesTurno = computed(() => this.serverBalance()?.sesionId === this.sesionActiva()?.id ? this.serverBalance()?.pagosDigital ?? 0 : 0);

  /**
   * FÓRMULA OFICIAL 5.4:
   * Monto Sistema = Monto Apertura + ∑ Pagos Efectivo + ∑ Ingresos - ∑ Egresos
   */
  readonly montoSistemaEsperado = computed(() => {
    const sesion = this.sesionActiva();
    if (!sesion) return 0;
    const apertura = Number(sesion.montoApertura || 0);
    const cobrosEfectivo = this.pagosEfectivoTurno();
    const ingresos = this.totalIngresosManuales();
    const egresos = this.totalEgresosManuales();
    return Number((apertura + cobrosEfectivo + ingresos - egresos).toFixed(2));
  });

  constructor() {
    this.setupRealtimeSubscriptions();
    effect(() => {
      this.auth.currentUser()?.id;
      this.db.sedeOperativaId();
      this.sesionActiva.set(null);
      this.serverBalance.set(null);
      this.paymentsReady.set(false);
      this.movimientos.set([]);
      this.historialSesiones.set([]);
      this.historialArqueos.set([]);
      this.cajasRegistradas.set([]);
      void this.cargarDesdeBackendSiExiste();
    });
  }

  private currentSedeId(): number {
    return this.db.getSedeOperativaId();
  }

  recargar(): void {
    void this.cargarDesdeBackendSiExiste();
  }


  // ===== OPERACIONES DE CAJA =====

  /**
   * 1. Apertura de Turno: Registro obligatorio del fondo inicial de sencillo (monto_apertura)
   */
  readonly processing = signal(false);

  private async confirmedOperation<T>(work: () => Promise<T>): Promise<T> {
    if (this.processing()) throw new Error('Ya hay una operacion de caja en curso.');
    const sede = this.currentSedeId();
    const user = this.auth.currentUser()?.id;
    if (!user) throw new Error('Inicia sesion para operar caja.');
    this.processing.set(true);
    try {
      const saved = await work();
      if (sede !== this.currentSedeId() || user !== this.auth.currentUser()?.id)
        throw new Error('La operacion se guardo en el contexto anterior. Consulta su estado antes de reintentar.');
      return saved;
    } finally { this.processing.set(false); }
  }

  async abrirTurno(cajaId: number, cajaNombre: string, sedeId: number,
      cajeroNombre: string, cajeroEmail: string, montoApertura: number): Promise<SesionCaja> {
    return this.confirmedOperation(async () => {
      const saved = await this.sincronizarAperturaBackend({
        id: 0, cajaId, cajaNombre, sedeId, cajeroNombre, cajeroEmail, montoApertura,
        fechaApertura: '', estado: 'abierta',
        resumen: { pagosEfectivo: 0, pagosDigital: 0, ingresosManuales: 0, egresosManuales: 0, totalReservasAtendidas: 0 },
      });
      if (!saved?.id) throw new Error('El servidor no confirmo la apertura.');
      return saved;
    }).then(saved => {
      this.sesionActiva.set(saved);
      this.movimientos.set([]);
      return saved;
    });
  }

  async registrarMovimiento(tipo: 'ingreso' | 'egreso', monto: number, concepto: string,
      autorizadoPor = 'Administrador'): Promise<MovimientoManualCaja> {
    const session = this.sesionActiva();
    if (!session) throw new Error('No hay un turno abierto.');
    const saved = await this.confirmedOperation(() => this.sincronizarMovimientoBackend({
      id: '', sesionId: session.id, tipo, monto, concepto, hora: '', autorizadoPor,
    }, session.id));
    if (!saved?.id) throw new Error('El servidor no confirmo el movimiento.');
    if (this.sesionActiva()?.id !== session.id) throw new Error('El turno cambio durante la operacion.');
    this.movimientos.update(current => [saved, ...current]);
    return saved;
  }

  async cerrarTurnoConArqueo(cantidades: Record<number, number>, observaciones = ''): Promise<ArqueoRegistro> {
    const session = this.sesionActiva();
    if (!session) throw new Error('No hay un turno abierto.');
    const filas: ArqueoFila[] = DENOMINACIONES_PERU.map(denominacion => {
      const cantidad = cantidades[denominacion.id] ?? 0;
      if (!Number.isInteger(cantidad) || cantidad < 0) throw new Error('Conteo fisico invalido.');
      return { denominacion, cantidad, subtotal: Number((cantidad * denominacion.valor).toFixed(2)) };
    });
    const totalEfectivoFisico = Number(filas.reduce((sum, fila) => sum + fila.subtotal, 0).toFixed(2));
    const saved = await this.confirmedOperation(() => this.sincronizarCierreBackend(session, {
      totalEfectivoFisico, observaciones,
    }));
    if (!saved?.id) throw new Error('El servidor no confirmo el cierre.');
    if (this.sesionActiva()?.id !== session.id) throw new Error('El turno cambio durante el cierre.');
    const record: ArqueoRegistro = { ...saved, filas };
    this.historialArqueos.update(current => [record, ...current.filter(a => a.id !== record.id)]);
    this.sesionActiva.set(null);
    this.movimientos.set([]);
    return record;
  }

  private sincronizarAperturaBackend(session: SesionCaja): Promise<SesionCaja> {
    return firstValueFrom(this.http.post<SesionCaja>(`${this.apiUrl}/sessions`, {
      cajaId: session.cajaId, montoApertura: session.montoApertura,
    }));
  }

  private sincronizarMovimientoBackend(movement: MovimientoManualCaja, sessionId: number): Promise<MovimientoManualCaja> {
    return firstValueFrom(this.http.post<MovimientoManualCaja>(`${this.apiUrl}/movements`, {
      sesionId: sessionId, tipo: movement.tipo, monto: movement.monto, concepto: movement.concepto,
    }));
  }

  private sincronizarCierreBackend(session: SesionCaja,
      count: { totalEfectivoFisico: number; observaciones?: string }): Promise<ArqueoRegistro> {
    return firstValueFrom(this.http.patch<ArqueoRegistro>(`${this.apiUrl}/sessions/${session.id}/close`, {
      totalEfectivoFisico: count.totalEfectivoFisico, observaciones: count.observaciones || '',
    }));
  }


  private setupRealtimeSubscriptions(): void {
    if (this.realtimeReady) return;
    this.realtimeReady = true;

    try {
      const channelName = `canchero-caja-refresh-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      supabase
        .channel(channelName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'caja' }, () => this.scheduleBackendRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sesion_caja' }, () => this.scheduleBackendRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'movimiento_caja' }, () => this.scheduleBackendRefresh())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'arqueo_caja' }, () => this.scheduleBackendRefresh())
        .subscribe();
    } catch {
      // Realtime subscription fallback for tests or offline mode
    }
  }

  private scheduleBackendRefresh(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null;
      void this.cargarDesdeBackendSiExiste();
    }, 450);
  }

  private async cargarDesdeBackendSiExiste(): Promise<void> {
    const sedeId = this.currentSedeId();
    const request = ++this.loadRequest;
    this.loadError.set('');
    if (!sedeId) { this.loading.set(false); return; }
    this.loading.set(true);
    try {
      const state = await firstValueFrom(this.http.get<{
        pagosListos?: boolean;
        balance?: {sesionId: number; pagosEfectivo: number; pagosDigital: number; montoSistema: number};
        balanceError?: string;
        cajas: Array<{ id: number; nombre: string; sedeId: number }>;
        sesion: SesionCaja | null;
        movimientos: MovimientoManualCaja[];
        arqueos: Array<{
          id: string; sesionId: number; cajaNombre: string; cajeroNombre: string; fechaArqueo: string;
          montoApertura: number; totalPagosEfectivo: number; totalIngresos: number; totalEgresos: number;
          totalEfectivoFisico: number; montoSistema: number; diferencia: number;
          balanceEstado: ArqueoRegistro['balanceEstado']; observaciones: string; desgloseDisponible?: boolean;
        }>;
      }>(`${this.apiUrl}/venues/${sedeId}/state`));
      if (request !== this.loadRequest || this.currentSedeId() !== sedeId) return;
      this.cajasRegistradas.set((state?.cajas ?? []).filter(caja => Number(caja.sedeId) === sedeId));
      const session = state?.sesion && Number(state.sesion.sedeId) === sedeId ? state.sesion : null;
      this.sesionActiva.set(session);
      this.paymentsReady.set(state?.pagosListos === true);
      this.serverBalance.set(state?.balance ?? null);
      this.balanceError.set(state?.balanceError ?? '');
      this.movimientos.set(session ? (state.movimientos ?? []).filter(movement => Number(movement.sesionId) === Number(session.id)) : []);
      this.historialArqueos.set((state?.arqueos ?? []).map(audit => ({ ...audit, filas: [] })));
    } catch {
      if (request === this.loadRequest) this.loadError.set('No se pudo cargar la caja de esta sede.');
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }

}
