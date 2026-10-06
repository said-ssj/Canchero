import { Injectable, signal, computed } from '@angular/core';
import { supabase } from './client';
import type { Venue } from '@shared/models/venue.model';
import type { Court, CourtType } from '@shared/models/court.model';

const COMISION_PORCENTAJE = 0.05;

export interface NuevaReservaInput {
  cancha_id: number;
  cliente_id: string; // UUID
  usuario_id: number; // legacy number ID
  fecha_reserva: string; // DATE
  hora_inicio: string; // TIME
  hora_fin: string; // TIME
  monto: number;
  monto_total?: number;
  adelanto?: number;
}

export interface NuevoPagoReservaInput {
  reserva_id?: number;
  metodo_pago_id?: number;
  metodo_pago?: string; // legacy compat
  monto?: number;
  numero_operacion?: string;
  codigo_operacion?: string; // legacy compat
  es_adelanto?: boolean;
  comprobante_url?: string;
}

@Injectable({ providedIn: 'root' })
export class DatabaseService {
  // ===== SIGNALS REACTIVOS (API principal) =====
  readonly usuarios = signal<any[]>([]);
  readonly sedes = signal<any[]>([]);
  readonly canchas = signal<any[]>([]);
  readonly tipoCanchas = signal<any[]>([]);
  readonly reservas = signal<any[]>([]);
  readonly pagos = signal<any[]>([]);
  readonly horarios = signal<any[]>([]);
  readonly bloqueos = signal<any[]>([]);
  readonly tarifasCancha = signal<any[]>([]);
  readonly estadosReserva = signal<any[]>([]);
  readonly metodosPago = signal<any[]>([]);
  readonly loadErrors = signal<string[]>([]);

  constructor() {
    this.cargarDatosIniciales();
  }

  private async cargarDatosIniciales() {
    try {
      const [
        usuarios,
        sedes,
        canchas,
        tipoCanchas,
        reservas,
        pagosReserva,
        tarifasCancha,
        horarios,
        bloqueos,
        estadosReserva,
        metodosPago,
      ] = await Promise.all([
        this.fetchAll<any>('usuario'),
        this.fetchAll<any>('sede'),
        this.fetchAll<any>('cancha'),
        this.fetchAll<any>('tipo_cancha'),
        this.fetchAll<any>('reserva'),
        this.fetchAll<any>('pago_reserva'),
        this.fetchAll<any>('tarifa_cancha'),
        this.fetchAll<any>('tipo_horario'),
        this.fetchAll<any>('bloqueo_mantenimiento'),
        this.fetchAll<any>('estado_reserva'),
        this.fetchAll<any>('metodo_pago'),
      ]);

      this.usuarios.set((usuarios ?? []).map(u => this.enhanceUsuario(u)));
      this.sedes.set((sedes ?? []).map(s => this.enhanceSede(s)));
      this.tipoCanchas.set(tipoCanchas ?? []);
      this.tarifasCancha.set(tarifasCancha ?? []);
      this.estadosReserva.set(estadosReserva ?? []);
      this.metodosPago.set(metodosPago ?? []);
      this.canchas.set((canchas ?? []).map(c => this.enhanceCancha(c)));
      this.reservas.set((reservas ?? []).map(r => this.enhanceReserva(r)));
      this.pagos.set((pagosReserva ?? []).map(p => this.enhancePago(p)));
      this.horarios.set((horarios ?? []).map(h => this.enhanceHorario(h)));
      this.bloqueos.set((bloqueos ?? []).map(b => this.enhanceBloqueo(b)));

      if (this.canchas().length === 0 && !this.loadErrors().includes('cancha')) {
        console.warn('Base de datos vacía - sin datos de canchas');
      }
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
    }
  }

  private async fetchAll<T>(table: string): Promise<T[]> {
    const { data, error } = await supabase.from(table).select('*');
    if (error) {
      console.error(`No se pudo leer la tabla "${table}" de Supabase:`, error);
      this.loadErrors.update(tables => [...tables, table]);
      return [];
    }
    return (data ?? []) as T[];
  }

  // ===== LEGACY COMPATIBILITY: Mapear schema real a propiedades legacy =====
  private enhanceUsuario(u: any) {
    return {
      ...u,
      id: this.uuidToNumber(u.id_usuario),
      email: u.correo,
      password_hash: u.password_hash,
      rol: u.id_rol === 1 ? 'dueno' : 'cliente',
      activo: u.estado === 'A',
      creado_en: u.feccre,
      actualizado_en: u.fecmod || u.feccre,
    };
  }

  private enhanceSede(s: any) {
    return {
      ...s,
      id: s.id_sede,
      dueno_id: this.uuidToNumber(s.id_dueno || '0'),
      distrito: '',
      ciudad: '',
      activo: s.estado === 'A',
      latitud: s.latitud ?? undefined,
      longitud: s.longitud ?? undefined,
      creado_en: s.feccre,
      actualizado_en: s.fecmod || s.feccre,
      creado_por: this.uuidToNumber(s.id_dueno || '0'),
    };
  }

  private enhanceCancha(c: any) {
    const tipoCancha = this.tipoCanchas().find((t: any) => t.id_tipo_cancha === c.id_tipo_cancha);
    const tarifas = this.tarifasCancha().filter((t: any) => t.id_cancha === c.id_cancha && t.estado === 'A');
    const precioDia = tarifas.find((t: any) => [0,1,2,3,4].includes(t.dia_semana))?.precio || 80;
    const precioNoche = tarifas.find((t: any) => [5,6].includes(t.dia_semana))?.precio || precioDia;
    return {
      ...c,
      id: c.id_cancha,
      sede_id: c.id_sede,
      nombre: c.nombre_numero,
      tipo: tipoCancha?.nombre || 'Grass 7',
      superficie: c.superficie || '',
      precio_hora: precioDia,
      precio_hora_noche: precioNoche,
      activa: c.estado === 'A',
      equipamiento: c.equipamiento || [],
      creado_en: c.feccre,
      actualizado_en: c.fecmod || c.feccre,
      creado_por: 1,
    };
  }

  private enhanceReserva(r: any) {
    const estadoReserva = this.estadosReserva().find((e: any) => e.id_estado_reserva === r.id_estado_reserva);
    return {
      ...r,
      id: r.id_reserva,
      cancha_id: r.id_cancha,
      usuario_id: this.uuidToNumber(r.id_cliente),
      fecha: r.fecha_reserva,
      hora_inicio: r.hora_inicio,
      hora_fin: r.hora_fin,
      estado: estadoReserva?.nombre || 'pendiente',
      codigo_pase: r.codigo_pase || `#CAN-${r.id_reserva.toString().padStart(4, '0')}`,
      creado_en: r.feccre,
      actualizado_en: r.fecmod || r.feccre,
    };
  }

  private enhancePago(p: any) {
    const metodoPago = this.metodosPago().find((m: any) => m.id_metodo_pago === p.id_metodo_pago);
    return {
      ...p,
      id: p.id_pago_reserva,
      reserva_id: p.id_reserva,
      monto: p.monto,
      comision_plataforma: p.comision_plataforma,
      monto_neto_dueno: p.monto_neto_dueno,
      metodo_pago: metodoPago?.nombre || p.id_metodo_pago.toString(),
      estado: p.estado_liquidacion === 'transferido' ? 'completado' : 'pendiente',
      codigo_operacion: p.numero_operacion || '',
      estado_liquidacion: p.estado_liquidacion,
      fecha_pago: p.fecha_pago.split('T')[0],
      creado_en: p.feccre,
      actualizado_en: p.fecmod || p.feccre,
    };
  }

  private enhanceHorario(h: any) {
    return {
      ...h,
      id: h.id_tipo_horario,
      sede_id: h.id_sede,
      dia_semana: h.dia_semana,
      hora_apertura: h.apertura,
      hora_cierre: h.cierre,
      activo: h.estado === 'A',
      creado_en: h.feccre,
      actualizado_en: h.fecmod || h.feccre,
    };
  }

  private enhanceBloqueo(b: any) {
    return {
      ...b,
      id: b.id_bloqueo,
      cancha_id: b.id_cancha,
      motivo: b.motivo,
      fecha_inicio: b.fecha_inicio,
      fecha_fin: b.fecha_fin,
      recurrente: false,
      creado_en: b.feccre,
      creado_por: 1,
    };
  }

  private uuidToNumber(uuid: string): number {
    if (!uuid) return 0;
    // Convertir UUID a número determinista para compatibilidad
    let hash = 0;
    for (let i = 0; i < uuid.length; i++) {
      hash = ((hash << 5) - hash) + uuid.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // ===== HELPERS =====
  private nowIso(): string { return new Date().toISOString(); }
  private round2(n: number): number { return Math.round(n * 100) / 100; }

  private nextId<T extends { id: number | string }>(items: T[]): number {
    const nums = items.map(i => Number(i.id)).filter(n => !isNaN(n));
    return nums.reduce((acc, n) => Math.max(acc, n), 0) + 1;
  }

  private normalizarMetodoPago(raw: string): string {
    const m = (raw ?? '').toLowerCase();
    if (m.includes('plin')) return 'Plin';
    if (m.includes('yape')) return 'Yape';
    if (m.includes('tarj')) return 'POS Tarjeta';
    if (m.includes('transfer')) return 'Transferencia';
    if (m.includes('efectivo')) return 'Efectivo Counter';
    return 'Yape';
  }

  cancha(nombre: string) { return this.canchas().find((c) => c.nombre?.toLowerCase().includes(nombre.toLowerCase())); }
  canchaById(id: number) { return this.canchas().find((c) => c.id === id); }
  sedeById(id: number | string) { return this.sedes().find((s) => String(s.id) === String(id)); }

  // ===== SEPARACIÓN POR DUEÑO =====
  getSedesPorDueno(duenoId: string | number) { return this.sedes().filter((s) => s.dueno_id === duenoId); }
  getSedeDelDueno(duenoId: string | number) { return this.getSedesPorDueno(duenoId)[0]; }

  saveOrUpdateSede(duenoId: string | number, data: any) {
    const existing = this.getSedeDelDueno(duenoId);
    const now = this.nowIso();

    if (existing) {
      const updated = { ...existing, ...data, actualizado_en: now };
      supabase.from('sede').update(updated).eq('id', existing.id).then(({ error }) => {
        if (error) console.error('Error actualizando sede:', error);
      });
      this.sedes.update((list) => list.map((s) => (s.id === existing.id ? { ...s, ...updated } : s)));
      return { ...existing, ...updated };
    } else {
      const nueva = {
        id: this.nextId(this.sedes()),
        dueno_id: duenoId,
        nombre: data['nombre']?.trim() || 'Mi Sede Deportiva',
        direccion: data['direccion']?.trim() || 'Sin dirección física',
        telefono: data['telefono']?.trim() || '+51 987 654 321',
        descripcion: data['descripcion']?.trim() || '',
        imagen_url: data['imagen_url'] || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
        rating: 4.5,
        activo: true,
        creado_en: now,
        actualizado_en: now,
        ...data,
      };
      supabase.from('sede').insert(nueva).then(({ error }) => {
        if (error) console.error('Error creando sede:', error);
      });
      this.sedes.update((list) => [...list, nueva]);
      return nueva;
    }
  }

  getCanchasPorDueno(duenoId: string | number) {
    const sedeIds = this.getSedesPorDueno(duenoId).map((s) => s.id);
    return this.canchas().filter((c) => sedeIds.includes(c.sede_id));
  }

  // ===== CANCHAS =====
  toggleCanchaActiva(canchaId: number) {
    this.canchas.update((list) =>
      list.map((c) =>
        c.id === canchaId
          ? { ...c, activa: !c.activa, actualizado_en: this.nowIso() }
          : c,
      ),
    );
    const cancha = this.canchas().find((c) => c.id === canchaId);
    if (cancha) {
      supabase.from('cancha').update({ activa: cancha.activa, actualizado_en: cancha.actualizado_en }).eq('id', canchaId);
    }
  }

  createCancha(data: any) {
    const now = this.nowIso();
    const cancha = {
      ...data,
      id: this.nextId(this.canchas()),
      activa: true,
      creado_en: now,
      actualizado_en: now,
    };
    supabase.from('cancha').insert(cancha);
    this.canchas.update((list) => [...list, cancha]);
    return cancha;
  }

  // ===== RESERVAS & PAGOS =====
  createReservaConPago(reservaData: NuevaReservaInput, pagoData: NuevoPagoReservaInput) {
    const now = this.nowIso();
    const monto = this.round2(reservaData.monto);
    const adelanto = this.round2(reservaData.adelanto ?? 0);
    const saldo = this.round2(monto - adelanto);

    const reserva = {
      id: this.nextId(this.reservas()),
      cancha_id: reservaData.cancha_id,
      usuario_id: reservaData.cliente_id,
      fecha: reservaData.fecha_reserva,
      hora_inicio: reservaData.hora_inicio,
      hora_fin: reservaData.hora_fin,
      estado: 'pendiente',
      codigo_pase: `#CAN-${Math.floor(1000 + Math.random() * 9000)}`,
      creado_en: now,
      actualizado_en: now,
    };

    const montoPago = pagoData.monto ?? 0;
    const metodoPagoId = pagoData.metodo_pago_id ?? 1;

    const pago = {
      id: this.nextId(this.pagos()),
      reserva_id: reserva.id,
      monto: montoPago,
      comision_plataforma: this.round2(montoPago * COMISION_PORCENTAJE),
      monto_neto_dueno: this.round2(montoPago * (1 - COMISION_PORCENTAJE)),
      metodo_pago: this.normalizarMetodoPago(metodoPagoId.toString()),
      estado: 'pendiente',
      codigo_operacion: pagoData.numero_operacion || pagoData.codigo_operacion || '000000',
      estado_liquidacion: 'pendiente',
      fecha_pago: now.split('T')[0],
      creado_en: now,
      actualizado_en: now,
    };

    supabase.from('reserva').insert(reserva);
    supabase.from('pago_reserva').insert(pago);

    this.reservas.update((list) => [...list, reserva]);
    this.pagos.update((list) => [...list, pago]);

    return reserva;
  }

  aprobarReserva(reservaId: number) {
    const now = this.nowIso();
    this.reservas.update((list) =>
      list.map((r) =>
        r.id === reservaId ? { ...r, estado: 'confirmada', actualizado_en: now } : r,
      ),
    );
    supabase.from('reserva').update({ id_estado_reserva: 2, fecmod: now }).eq('id_reserva', reservaId);
  }

  descartarReserva(reservaId: number) {
    const now = this.nowIso();
    this.reservas.update((list) =>
      list.map((r) =>
        r.id === reservaId ? { ...r, estado: 'cancelada', actualizado_en: now } : r,
      ),
    );
    supabase.from('reserva').update({ id_estado_reserva: 4, fecmod: now }).eq('id_reserva', reservaId);
  }

  getReservasPorDueno(duenoId: string | number) {
    const canchaIds = this.getCanchasPorDueno(duenoId).map((c) => c.id);
    return this.reservas().filter((r) => canchaIds.includes(r.cancha_id));
  }

  getReservasPorCliente(clienteId: string) {
    return this.reservas().filter((r) => r.usuario_id === clienteId);
  }

  getReservasPorJugador(usuarioId: string) {
    const usuario = this.usuarios().find(u => u.id_usuario === usuarioId);
    if (!usuario) return [];
    return this.reservas().filter((r) => r.usuario_id === usuario.id);
  }

  getPagosPorDueno(duenoId: string | number) {
    const reservaIds = this.getReservasPorDueno(duenoId).map((r) => r.id);
    return this.pagos().filter((p) => reservaIds.includes(p.reserva_id));
  }

  pagoDeReserva(reservaId: number) {
    return this.pagos().find((p) => p.reserva_id === reservaId);
  }

  // ===== MÉTRICAS =====
  getMetricasFinancierasDueno(duenoId: string | number) {
    const pagos = this.getPagosPorDueno(duenoId).filter((p) => p.estado_liquidacion !== 'fallido');
    const ingresoBruto = this.round2(pagos.reduce((acc, p) => acc + p.monto, 0));
    const comisionApp = this.round2(pagos.reduce((acc, p) => acc + p.comision_plataforma, 0));
    const ingresoNeto = this.round2(pagos.reduce((acc, p) => acc + p.monto_neto_dueno, 0));
    const liquidacionesPendientes = pagos.filter((p) => p.estado_liquidacion === 'pendiente').length;
    const totalLiquidado = this.round2(
      pagos.filter((p) => p.estado_liquidacion === 'transferido').reduce((acc, p) => acc + p.monto_neto_dueno, 0),
    );
    return { ingresoBruto, comisionApp, ingresoNeto, liquidacionesPendientes, totalLiquidado };
  }

  // ===== CATÁLOGO PÚBLICO =====
  getCanchasPublicasActivas() { return this.canchas().filter((c) => c.activa); }

  getVenuesPublicos(): Venue[] {
    const result: Venue[] = [];
    for (const sede of this.sedes().filter(s => s.activo)) {
      const venue = this.mapSede(sede, true);
      if (venue) result.push(venue);
    }
    return result;
  }

  getVenueDetalle(id: string): Venue | undefined {
    const sede = this.sedeById(id);
    return sede ? this.mapSede(sede, false) : undefined;
  }

  private mapSede(sede: any, onlyActive: boolean): Venue | undefined {
    const canchas = this.canchas().filter((c) => c.sede_id === sede.id && (!onlyActive || c.activa));
    if (onlyActive && canchas.length === 0) return undefined;

    const courts: Court[] = canchas.map((c) => ({
      id: String(c.id),
      nombre: c.nombre,
      tipo: (c.tipo as CourtType) || 'Grass 7',
      precioHora: c.precio_hora,
      disponible: c.activa,
      foto: c.foto_url,
    }));

    const precioBase = courts.reduce((min, court) => Math.min(min, court.precioHora), Number.MAX_SAFE_INTEGER);
    return {
      id: String(sede.id),
      nombre: sede.nombre,
      ciudad: sede.ciudad || '',
      distrito: sede.distrito || '',
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

  // ===== UTILIDADES =====
  isBaseDatosVacia(): boolean { return this.canchas().length === 0; }
}