import { Injectable, signal } from '@angular/core';
import type {
  AuditoriaCaja,
  BloqueoMantenimiento,
  Cancha,
  ConfiguracionPrecio,
  DatabaseSnapshot,
  DetalleVentaExtra,
  HorarioAtencion,
  MetodoPago,
  MetricasDueno,
  Pago,
  Reserva,
  Sede,
  Usuario,
  Producto,
} from '../models/supabase.types';
import type { Venue } from '../models/venue.model';
import type { Court } from '../models/court.model';
import {
  SEED_CANCHAS,
  SEED_PAGOS,
  SEED_RESERVAS,
  SEED_SEDES,
  SEED_USUARIOS,
} from '../data/seed.data';

const STORAGE_KEY = 'canchero_db_v2';
const DB_VERSION = 2;
const COMISION_PORCENTAJE = 0.05;

/** Datos a pasar a createReservaConPago (monto es el bruto a cobrar). */
export interface NuevaReservaInput {
  cancha_id: number;
  usuario_id: number;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  monto: number;
}

/** Datos del pago: separa comisión 5% Canchero vs. neto 95% del dueño. */
export interface NuevoPagoInput {
  metodo_pago: string;
  codigo_operacion?: string;
  comprobante_url?: string;
}

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  readonly usuarios = signal<Usuario[]>([]);
  readonly sedes = signal<Sede[]>([]);
  readonly canchas = signal<Cancha[]>([]);
  readonly reservas = signal<Reserva[]>([]);
  readonly pagos = signal<Pago[]>([]);

  readonly horarios = signal<HorarioAtencion[]>([]);
  readonly bloqueos = signal<BloqueoMantenimiento[]>([]);
  readonly configPrecios = signal<ConfiguracionPrecio[]>([]);
  readonly productos = signal<Producto[]>([]);
  readonly detalleVentas = signal<DetalleVentaExtra[]>([]);
  readonly auditorias = signal<AuditoriaCaja[]>([]);

  constructor() {
    this.load();
  }

  /* ================= INICIALIZACIÓN: ESTADO VACÍO POR DEFECTO ================= */

  private load(): void {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        const snap = JSON.parse(raw) as DatabaseSnapshot;
        if (snap && snap.version === DB_VERSION) {
          this.apply(snap);
          this.ensureBaseUsuarios();
          return;
        }
      } catch {
        /* snapshot corrupto -> modo vacío */
      }
    }
    this.toBaseUsuariosSolo();
    this.persist();
  }

  private apply(snap: DatabaseSnapshot): void {
    this.usuarios.set(snap.usuarios ?? []);
    this.sedes.set(snap.sedes ?? []);
    this.canchas.set(snap.canchas ?? []);
    this.reservas.set(snap.reservas ?? []);
    this.pagos.set(snap.pagos ?? []);
    this.horarios.set(snap.horarios ?? []);
    this.bloqueos.set(snap.bloqueos ?? []);
    this.configPrecios.set(snap.config_precios ?? []);
    this.productos.set(snap.productos ?? []);
    this.detalleVentas.set(snap.detalle_ventas ?? []);
    this.auditorias.set(snap.auditorias ?? []);
  }

  private persist(): void {
    const snap: DatabaseSnapshot = {
      version: DB_VERSION,
      usuarios: this.usuarios(),
      sedes: this.sedes(),
      canchas: this.canchas(),
      reservas: this.reservas(),
      pagos: this.pagos(),
      horarios: this.horarios(),
      bloqueos: this.bloqueos(),
      config_precios: this.configPrecios(),
      productos: this.productos(),
      detalle_ventas: this.detalleVentas(),
      auditorias: this.auditorias(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  }

  /* ================= CONTROL DE ESTADO: VACÍO VS DEMO ================= */

  /**
   * Modo virgen ("calato"): vacía todas las colecciones y mantiene únicamente
   * los 2 accesos base (dueno@canchero.pe y jugador@canchero.pe) para poder
   * iniciar sesión. La base vuelve a quedar sin sedes, canchas ni reservas.
   */
  limpiarBaseDatos(): void {
    this.usuarios.set([]);
    this.sedes.set([]);
    this.canchas.set([]);
    this.reservas.set([]);
    this.pagos.set([]);
    this.horarios.set([]);
    this.bloqueos.set([]);
    this.configPrecios.set([]);
    this.productos.set([]);
    this.detalleVentas.set([]);
    this.auditorias.set([]);
    this.ensureBaseUsuarios();
    this.persist();
  }

  /** Puebla el sistema con los datos de semilla de `seed.data.ts`. */
  cargarDatosDemo(): void {
    this.usuarios.set(SEED_USUARIOS);
    this.sedes.set(SEED_SEDES);
    this.canchas.set(SEED_CANCHAS);
    this.reservas.set(SEED_RESERVAS);
    this.pagos.set(SEED_PAGOS);
    this.horarios.set([]);
    this.bloqueos.set([]);
    this.configPrecios.set([]);
    this.productos.set([]);
    this.detalleVentas.set([]);
    this.auditorias.set([]);
    this.persist();
  }

  isBaseDatosVacia(): boolean {
    return this.canchas().length === 0;
  }

  /** Si no hay usuarios, crea los 2 accesos base para iniciar sesión. */
  private ensureBaseUsuarios(): void {
    if (this.usuarios().length === 0) {
      this.toBaseUsuariosSolo();
    }
  }

  private toBaseUsuariosSolo(): void {
    const now = this.nowIso();
    const dueño: Usuario = {
      id: 1,
      nombre: 'Dueño Magdalena',
      email: 'dueno@canchero.pe',
      password_hash: '123456',
      telefono: '987 654 322',
      rol: 'dueno',
      activo: true,
      creado_en: now,
      actualizado_en: now,
    };
    const jugador: Usuario = {
      id: 2,
      nombre: 'Carlos Jugador',
      email: 'jugador@canchero.pe',
      password_hash: '123456',
      telefono: '987 654 321',
      rol: 'cliente',
      activo: true,
      creado_en: now,
      actualizado_en: now,
    };
    this.usuarios.set([dueño, jugador]);
  }

  /* ================= HELPERS ================= */

  private nowIso(): string {
    return new Date().toISOString();
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  private nextId(items: { id: number }[]): number {
    return items.reduce((acc, item) => Math.max(acc, item.id), 0) + 1;
  }

  private normalizarMetodoPago(raw: string): MetodoPago {
    const m = (raw ?? '').toLowerCase();
    if (m.includes('plin')) {
      return 'Plin';
    }
    if (m.includes('yape')) {
      return 'Yape';
    }
    if (m.includes('tarj')) {
      return 'POS Tarjeta';
    }
    if (m.includes('transfer')) {
      return 'Transferencia';
    }
    if (m.includes('efectivo')) {
      return 'Efectivo Counter';
    }
    return 'Yape';
  }

  cancha(nombre: string): Cancha | undefined {
    return this.canchas().find((c) => c.nombre.toLowerCase().includes(nombre.toLowerCase()));
  }

  canchaById(id: number): Cancha | undefined {
    return this.canchas().find((c) => c.id === id);
  }

  sedeById(id: number | string): Sede | undefined {
    return this.sedes().find((s) => String(s.id) === String(id));
  }

  /* ================= SEPARACIÓN POR DUEÑO ================= */

  getSedesPorDueno(duenoId: number): Sede[] {
    return this.sedes().filter((s) => s.dueno_id === duenoId);
  }

  getSedeDelDueno(duenoId: number): Sede | undefined {
    return this.getSedesPorDueno(duenoId)[0];
  }

  saveOrUpdateSede(duenoId: number, data: Partial<Sede>): Sede {
    const existing = this.getSedeDelDueno(duenoId);
    const now = this.nowIso();
    if (existing) {
      const updated: Sede = {
        ...existing,
        ...data,
        actualizado_en: now,
      };
      this.sedes.update((list) => list.map((s) => (s.id === existing.id ? updated : s)));
      this.persist();
      return updated;
    } else {
      const nueva: Sede = {
        id: this.nextId(this.sedes()),
        dueno_id: duenoId,
        nombre: data.nombre?.trim() || 'Mi Sede Deportiva',
        direccion: data.direccion?.trim() || 'Sin dirección física',
        distrito: data.distrito?.trim() || 'Ica',
        ciudad: data.ciudad?.trim() || 'Ica',
        telefono: data.telefono?.trim() || '+51 987 654 321',
        descripcion: data.descripcion?.trim() || '',
        imagen_url:
          data.imagen_url ||
          'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
        activo: true,
        creado_en: now,
        actualizado_en: now,
        ...data,
      };
      this.sedes.update((list) => [...list, nueva]);
      this.persist();
      return nueva;
    }
  }

  getCanchasPorDueno(duenoId: number): Cancha[] {
    const sedeIds = this.getSedesPorDueno(duenoId).map((s) => s.id);
    return this.canchas().filter((c) => sedeIds.includes(c.sede_id));
  }

  /* ================= CRUD: CANCHAS ================= */

  toggleCanchaActiva(canchaId: number): void {
    this.canchas.update((list) =>
      list.map((c) =>
        c.id === canchaId
          ? { ...c, activa: !c.activa, actualizado_en: this.nowIso() }
          : c,
      ),
    );
    this.persist();
  }

  createCancha(data: Omit<Cancha, 'id' | 'creado_en' | 'actualizado_en'>): Cancha {
    const now = this.nowIso();
    const cancha: Cancha = {
      ...data,
      id: this.nextId(this.canchas()),
      creado_en: now,
      actualizado_en: now,
    };
    this.canchas.update((list) => [...list, cancha]);
    this.persist();
    return cancha;
  }

  /* ================= RESERVAS & PAGOS ================= */

  createReservaConPago(reservaData: NuevaReservaInput, pagoData: NuevoPagoInput): Reserva {
    const now = this.nowIso();
    const monto = this.round2(reservaData.monto);
    const reserva: Reserva = {
      id: this.nextId(this.reservas()),
      cancha_id: reservaData.cancha_id,
      usuario_id: reservaData.usuario_id,
      fecha: reservaData.fecha,
      hora_inicio: reservaData.hora_inicio,
      hora_fin: reservaData.hora_fin,
      estado: 'pendiente',
      codigo_pase: `#CAN-${Math.floor(1000 + Math.random() * 9000)}`,
      creado_en: now,
      actualizado_en: now,
    };
    const pago: Pago = {
      id: this.nextId(this.pagos()),
      reserva_id: reserva.id,
      monto,
      comision_plataforma: this.round2(monto * COMISION_PORCENTAJE),
      monto_neto_dueno: this.round2(monto * (1 - COMISION_PORCENTAJE)),
      metodo_pago: this.normalizarMetodoPago(pagoData.metodo_pago),
      estado: 'completado',
      codigo_operacion: pagoData.codigo_operacion || '000000',
      comprobante_url: pagoData.comprobante_url,
      estado_liquidacion: 'pendiente',
      fecha_pago: now.slice(0, 10),
      creado_en: now,
      actualizado_en: now,
    };
    this.reservas.update((list) => [...list, reserva]);
    this.pagos.update((list) => [...list, pago]);
    this.persist();
    return reserva;
  }

  aprobarReserva(reservaId: number): void {
    this.reservas.update((list) =>
      list.map((r) =>
        r.id === reservaId ? { ...r, estado: 'confirmada', actualizado_en: this.nowIso() } : r,
      ),
    );
    this.persist();
  }

  descartarReserva(reservaId: number): void {
    this.reservas.update((list) =>
      list.map((r) =>
        r.id === reservaId ? { ...r, estado: 'cancelada', actualizado_en: this.nowIso() } : r,
      ),
    );
    this.persist();
  }

  getReservasPorDueno(duenoId: number): Reserva[] {
    const canchaIds = this.getCanchasPorDueno(duenoId).map((c) => c.id);
    return this.reservas().filter((r) => canchaIds.includes(r.cancha_id));
  }

  getReservasPorJugador(usuarioId: number): Reserva[] {
    return this.reservas().filter((r) => r.usuario_id === usuarioId);
  }

  getPagosPorDueno(duenoId: number): Pago[] {
    const reservaIds = this.getReservasPorDueno(duenoId).map((r) => r.id);
    return this.pagos().filter((p) => reservaIds.includes(p.reserva_id));
  }

  pagoDeReserva(reservaId: number): Pago | undefined {
    return this.pagos().find((p) => p.reserva_id === reservaId);
  }

  /* ================= MÉTRICAS FINANCIERAS POR DUEÑO ================= */

  getMetricasFinancierasDueno(duenoId: number): MetricasDueno {
    const pagos = this.getPagosPorDueno(duenoId).filter((p) => p.estado !== 'fallido');
    const ingresoBruto = this.round2(pagos.reduce((acc, p) => acc + p.monto, 0));
    const comisionApp = this.round2(pagos.reduce((acc, p) => acc + p.comision_plataforma, 0));
    const ingresoNeto = this.round2(pagos.reduce((acc, p) => acc + p.monto_neto_dueno, 0));
    const liquidacionesPendientes = pagos.filter(
      (p) => p.estado_liquidacion === 'pendiente',
    ).length;
    const totalLiquidado = this.round2(
      pagos
        .filter((p) => p.estado_liquidacion === 'transferido')
        .reduce((acc, p) => acc + p.monto_neto_dueno, 0),
    );
    return { ingresoBruto, comisionApp, ingresoNeto, liquidacionesPendientes, totalLiquidado };
  }

  /* ================= CATÁLOGO PÚBLICO (solamente canchas activas) ================= */

  getCanchasPublicasActivas(): Cancha[] {
    return this.canchas().filter((c) => c.activa);
  }

  getVenuesPublicos(): Venue[] {
    const result: Venue[] = [];
    for (const sede of this.sedes()) {
      const venue = this.mapSede(sede, true);
      if (venue) {
        result.push(venue);
      }
    }
    return result;
  }

  getVenueDetalle(id: string): Venue | undefined {
    const sede = this.sedeById(id);
    return sede ? this.mapSede(sede, false) : undefined;
  }

  private mapSede(sede: Sede, onlyActive: boolean): Venue | undefined {
    const canchas = this.canchas().filter((c) => c.sede_id === sede.id && (!onlyActive || c.activa));
    if (onlyActive && canchas.length === 0) {
      return undefined;
    }
    const courts: Court[] = canchas.map((c) => ({
      id: String(c.id),
      nombre: c.nombre,
      tipo: this.toCourtType(c.tipo),
      precioHora: c.precio_hora,
      disponible: c.activa,
      foto: c.foto_url,
    }));
    const precioBase = courts.reduce((min, court) => Math.min(min, court.precioHora), Number.MAX_SAFE_INTEGER);
    return {
      id: String(sede.id),
      nombre: sede.nombre,
      ciudad: sede.ciudad,
      distrito: sede.distrito,
      direccion: sede.direccion,
      rating: sede.rating ?? 4.6,
      precioBase: courts.length ? (precioBase === Number.MAX_SAFE_INTEGER ? 80 : precioBase) : 80,
      fotos: sede.imagen_url ? [sede.imagen_url] : [],
      amenidades: [],
      canchas: courts,
      descripcion: sede.descripcion,
      telefono: sede.telefono,
    };
  }

  private toCourtType(tipo: string): Court['tipo'] {
    const value = (tipo ?? '').toLowerCase();
    if (value.includes('7')) {
      return 'Grass 7';
    }
    if (value.includes('5')) {
      return 'Grass 5';
    }
    return 'techada';
  }
}