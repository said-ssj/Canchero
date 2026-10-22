import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { supabase } from './client';
import type { VenueDayHours } from '../../shared/models/venue-hours.model';
import type { Venue } from '@shared/models/venue.model';
import type { Court, CourtType } from '@shared/models/court.model';
import type { CourtSlotAvailability, BookingBlock } from '@shared/models/availability.model';
import { resolveSlotAvailability, normalizeTimeString } from '../utils/availability.utils';
import type { NuevaReservaPresencialInput } from './legacy.types';
import { UBIGEO_LOOKUP } from './ubigeo-data';
import { environment } from '../../../environments/environment';

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
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  // ===== SIGNALS REACTIVOS (API principal) =====
  readonly usuarios = signal<any[]>([]);
  readonly clientes = signal<any[]>([]);
  readonly sedes = signal<any[]>([]);
  readonly canchas = signal<any[]>([]);
  readonly roles = signal<any[]>([]);
  readonly tipoCanchas = signal<any[]>([]);
  readonly reservas = signal<any[]>([]);
  readonly pagos = signal<any[]>([]);
  readonly horarios = signal<any[]>([]);
  readonly bloqueos = signal<any[]>([]);
  readonly tarifasCancha = signal<any[]>([]);
  readonly estadosReserva = signal<any[]>([]);
  readonly metodosPago = signal<any[]>([]);
  readonly loadErrors = signal<string[]>([]);
  readonly catalogLoading = signal(true);
  private catalogRequest: Promise<void> | null = null;
  readonly sedeOperativaId = signal<number | null>(null);
  private realtimeReady = false;

  constructor() {
    void this.refreshCatalogo();
  }

  private async cargarDatosIniciales() {
    try {
      const backendLoaded = await this.cargarCatalogoDesdeBackend();
      // The authoritative venue/court catalog is ready; auxiliary catalogs must not block it.
      if (backendLoaded) this.catalogLoading.set(false);
      const [
        usuarios,
        clientes,
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
        roles,
      ] = await Promise.all([
        backendLoaded ? Promise.resolve([]) : this.fetchAll<any>('usuario'),
        backendLoaded ? Promise.resolve([]) : this.fetchAll<any>('cliente'),
        backendLoaded ? Promise.resolve([]) : this.fetchAll<any>('sede'),
        backendLoaded ? Promise.resolve([]) : this.fetchAll<any>('cancha'),
        this.fetchCatalog<any>('/catalog/court-types', 'tipo_cancha'),
        backendLoaded ? Promise.resolve([]) : this.fetchAll<any>('reserva'),
        backendLoaded ? Promise.resolve([]) : this.fetchAll<any>('pago_reserva'),
        this.fetchAll<any>('tarifa_cancha'),
        this.fetchAll<any>('tipo_horario'),
        this.fetchAll<any>('bloqueo_mantenimiento'),
        this.fetchCatalog<any>('/catalog/reservation-statuses', 'estado_reserva'),
        this.fetchCatalog<any>('/catalog/payment-methods', 'metodo_pago'),
        this.fetchCatalog<any>('/catalog/roles', 'rol'),
      ]);

      this.roles.set(roles ?? []);
      if (!backendLoaded) this.usuarios.set((usuarios ?? []).map(u => this.enhanceUsuario(u)));
      if (!backendLoaded) this.clientes.set(clientes ?? []);
      if (!backendLoaded) this.sedes.set((sedes ?? []).map(s => this.enhanceSede(s)));
      this.tipoCanchas.set(tipoCanchas ?? []);
      this.tarifasCancha.set(tarifasCancha ?? []);
      this.estadosReserva.set(estadosReserva ?? []);
      this.metodosPago.set(metodosPago ?? []);
      if (!backendLoaded) this.canchas.set((canchas ?? []).map(c => this.enhanceCancha(c)));
      if (!backendLoaded) this.reservas.set((reservas ?? []).map(r => this.enhanceReserva(r)));
      if (!backendLoaded) this.pagos.set((pagosReserva ?? []).map(p => this.enhancePago(p)));
      this.horarios.set((horarios ?? []).map(h => this.enhanceHorario(h)));
      this.bloqueos.set((bloqueos ?? []).map(b => this.enhanceBloqueo(b)));

      if (this.canchas().length === 0 && !this.loadErrors().includes('cancha')) {
        console.warn('Base de datos vacía - sin datos de canchas');
      }
      this.setupRealtimeSubscriptions();
    } catch (error) {
      console.error('Error cargando datos iniciales:', error);
      this.loadErrors.update(errors => [...new Set([...errors, 'catalogo'])]);
    }
  }

  private setupRealtimeSubscriptions(): void {
    if (this.realtimeReady) return;
    this.realtimeReady = true;

    supabase
      .channel('canchero-ui-refresh')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sede' }, () => this.refreshCatalogo())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cancha' }, () => this.refreshCatalogo())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tarifa_cancha' }, () => this.refreshCatalogo())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reserva' }, () => this.refreshCatalogo())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pago_reserva' }, () => this.refreshCatalogo())
      .subscribe();
  }

  public refreshCatalogo(): Promise<void> {
    if (this.catalogRequest) return this.catalogRequest;
    this.catalogLoading.set(true);
    this.loadErrors.set([]);
    this.catalogRequest = this.cargarDatosIniciales().finally(() => {
      this.catalogLoading.set(false);
      this.catalogRequest = null;
    });
    return this.catalogRequest;
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

  private async fetchCatalog<T>(path: string, fallbackTable: string): Promise<T[]> {
    try {
      return await firstValueFrom(this.http.get<T[]>(`${this.apiUrl}${path}`));
    } catch (error: any) {
      if (error?.code !== -205 && !error?.message?.includes?.('NG0205')) {
        console.warn(`Backend catalog ${path} no disponible, usando Supabase directo:`, error);
      }
      return this.fetchAll<T>(fallbackTable);
    }
  }

  private async cargarCatalogoDesdeBackend(): Promise<boolean> {
    try {
      const venues = await firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/venues`));
      const bookings = await firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/bookings`));
      const courts = await firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/courts`));

      const sedes = venues.map((v) => this.mapBackendVenueToSede(v));
      const canchas = courts.map((c) => this.mapBackendCourtToCancha(c, Number(c.venueId)));
      const reservas = bookings.map((b) => this.mapBackendBookingToReserva(b, canchas));

      this.sedes.set(sedes);
      this.canchas.set(canchas);
      this.reservas.set(reservas);
      return true;
    } catch (error) {
      console.warn('Backend no disponible, usando Supabase directo como fallback temporal:', error);
      return false;
    }
  }

  private mapBackendVenueToSede(v: any) {
    const fotos = Array.isArray(v.fotos) ? v.fotos.filter(Boolean) : [];
    const ownerId = v.ownerId ? this.uuidToNumber(v.ownerId) : 0;
    return {
      id: Number(v.id),
      id_sede: Number(v.id),
      nombre: v.nombre,
      direccion: v.direccion,
      distrito: v.distrito || '',
      ciudad: v.ciudad || 'Ica',
      provincia: v.ciudad || 'Ica',
      telefono: v.telefono || '',
      descripcion: v.descripcion || '',
      imagen_url: v.portadaUrl || fotos[0] || '',
      fotos,
      latitud: v.latitud,
      longitud: v.longitud,
      rating: v.rating ?? 4.5,
      activo: true,
      estado: 'A',
      dueno_id: ownerId,
      creado_por: ownerId,
      porcentaje_adelanto_minimo: Number(v.porcentajeAdelantoMinimo || v.porcentaje_adelanto_minimo || 50),
    };
  }

  private mapBackendCourtToCancha(c: any, sedeId: number) {
    return {
      id: Number(c.id),
      id_cancha: Number(c.id),
      sede_id: sedeId,
      id_sede: sedeId,
      nombre: c.nombre,
      nombre_numero: c.nombre,
      tipo: c.tipo || c.formato || 'Fútbol 7',
      formato: c.formato || c.tipo || 'Fútbol 7',
      superficie: c.superficie || 'Grass Sintético',
      cobertura: c.cobertura || (c.techada ? 'Techada' : 'Al Aire Libre'),
      techada: !!c.techada,
      precio_hora: Number(c.precioHora || 80),
      precio_hora_noche: Number(c.precioHoraNoche || c.precio_hora_noche || c.precioHora || 100),
      hora_inicio_noche: c.horaInicioNoche || c.hora_inicio_noche || '18:00',
      activa: c.disponible !== false,
      estado: c.disponible === false ? 'I' : 'A',
      foto_url: c.foto || c.foto_url || null,
      fotos: Array.isArray(c.fotos) && c.fotos.length > 0 ? c.fotos : (c.foto || c.foto_url ? [c.foto || c.foto_url] : []),
      equipamiento: Array.isArray(c.equipamiento) ? c.equipamiento : [],
      usar_horario_sede: c.usarHorarioSede ?? c.usar_horario_sede ?? true,
      horarios_semana: Array.isArray(c.horariosSemana) ? c.horariosSemana : (Array.isArray(c.horarios_semana) ? c.horarios_semana : []),
      descansos_recurrentes: Array.isArray(c.descansosRecurrentes) ? c.descansosRecurrentes : (Array.isArray(c.descansos_recurrentes) ? c.descansos_recurrentes : []),
    };
  }

  private mapBackendBookingToReserva(b: any, canchas: any[]) {
    const rawCourtId = b.courtId ?? b.id_cancha ?? b.cancha_id;
    const explicitCourtId = rawCourtId != null && rawCourtId !== '' ? Number(rawCourtId) : null;
    const venueIdNum = b.venueId != null && b.venueId !== '' ? Number(b.venueId) : null;
    const cancha =
      explicitCourtId != null && !Number.isNaN(explicitCourtId)
        ? canchas.find((c) => Number(c.id) === explicitCourtId)
        : canchas.find(
            (c) =>
              (venueIdNum == null || Number(c.sede_id) === venueIdNum) &&
              c.nombre === b.courtName,
          );
    const resolvedCanchaId = explicitCourtId ?? cancha?.id ?? 0;
    const [horaInicio = '', horaFin = ''] = String(b.horario || '').split(' - ');
    const estado = String(b.status || 'pendiente').toLowerCase();
    const paidAmount = Number(b.paidAmount ?? b.adelanto ?? b.total ?? 0);
    const balanceAmount = Number(b.balanceAmount ?? b.saldo ?? 0);
    return {
      id: Number(b.id),
      id_reserva: Number(b.id),
      cancha_id: resolvedCanchaId,
      id_cancha: resolvedCanchaId,
      usuario_id: 0,
      fecha: b.fecha,
      fecha_reserva: b.fecha,
      hora_inicio: horaInicio,
      hora_fin: horaFin,
      monto_total: Number(b.total || 0),
      adelanto: paidAmount,
      saldo: balanceAmount,
      estado,
      estado_label: estado,
      codigo_pase: b.codigoPase,
      payment_status: b.paymentStatus ?? (paidAmount > 0 && balanceAmount === 0 ? 'aprobado' : 'pendiente'),
      retention_status: b.retentionStatus ?? 'sin_retencion',
      creado_en: new Date().toISOString(),
    };
  }

  // ===== LEGACY COMPATIBILITY: Mapear schema real a propiedades legacy =====
  private enhanceUsuario(u: any) {
    const rol = this.roles().find((r: any) => r.id_rol === u.id_rol);
    const rolNombre = String(rol?.nombre || '').trim().toLowerCase();
    const userEmail = u.correo ?? u.email ?? '';
    return {
      ...u,
      id: this.uuidToNumber(u.id_usuario),
      id_usuario: u.id_usuario,
      correo: userEmail,
      email: userEmail,
      password_hash: u.password_hash,
      rol: rolNombre.includes('due') || rolNombre.includes('owner') || rolNombre.includes('admin') ? 'dueno' : 'cliente',
      activo: u.estado === 'A',
      creado_en: u.feccre,
      actualizado_en: u.fecmod || u.feccre,
    };
  }

  private enhanceSede(s: any) {
    const loc = UBIGEO_LOOKUP[s.id_distrito] || { distrito: '', ciudad: 'Ica', provincia: 'Ica' };
    return {
      ...s,
      id: s.id_sede,
      id_sede: s.id_sede,
      id_dueno: s.id_dueno,
      dueno_id: this.uuidToNumber(s.id_dueno || '0'),
      distrito: loc.distrito,
      ciudad: loc.ciudad,
      provincia: loc.provincia,
      activo: s.estado === 'A',
      latitud: s.latitud != null ? Number(s.latitud) : -14.06778,
      longitud: s.longitud != null ? Number(s.longitud) : -75.72861,
      creado_en: s.feccre,
      actualizado_en: s.fecmod || s.feccre,
      creado_por: this.uuidToNumber(s.id_dueno || '0'),
      porcentaje_adelanto_minimo: Number(s.porcentaje_adelanto_minimo || 50),
    };
  }

  private enhanceCancha(c: any) {
    const tipoCancha = this.tipoCanchas().find((t: any) => t.id_tipo_cancha === c.id_tipo_cancha);
    const tarifas = this.tarifasCancha().filter((t: any) => t.id_cancha === c.id_cancha && t.estado === 'A');
    const tarifasDia = tarifas.filter((t: any) => normalizeTimeString(t.hora_inicio) < '18:00');
    const tarifasNoche = tarifas.filter(
      (t: any) =>
        normalizeTimeString(t.hora_inicio) >= '18:00' ||
        normalizeTimeString(t.hora_fin) > '18:00' ||
        normalizeTimeString(t.hora_fin) === '00:00',
    );
    const precioDia = Number(c.precio_hora ?? tarifasDia[0]?.precio ?? tarifas[0]?.precio ?? 80);
    const precioNoche = Number(
      c.precio_hora_noche ?? tarifasNoche[tarifasNoche.length - 1]?.precio ?? precioDia,
    );
    const reglaInicioNoche = tarifas.find(
      (t: any) =>
        normalizeTimeString(t.hora_inicio) >= '17:00' &&
        normalizeTimeString(t.hora_inicio) < '23:00',
    );
    const horaInicioNoche =
      c.hora_inicio_noche ||
      (reglaInicioNoche ? normalizeTimeString(reglaInicioNoche.hora_inicio) : '18:00');

    // Normalizar etiquetas de superficie
    let supNorm = c.superficie || 'Grass Sintético';
    const supLower = String(supNorm).toLowerCase();
    if (supLower.includes('natural')) supNorm = 'Césped Natural';
    else if (supLower.includes('sintétic') || supLower.includes('sintetic')) supNorm = 'Grass Sintético';
    else if (supLower.includes('loza') || supLower.includes('losa') || supLower.includes('concreto') || supLower.includes('cemento')) supNorm = 'Losa Deportiva';
    else if (supLower.includes('parquet') || supLower.includes('madera')) supNorm = 'Piso de Madera';
    else if (supLower.includes('goma') || supLower.includes('caucho')) supNorm = 'Piso de Goma';
    else if (supLower.includes('arena') || supLower.includes('playa')) supNorm = 'Arena';

    const canchaNombre = c.nombre_numero ?? c.nombre;
    return {
      ...c,
      id: c.id_cancha,
      id_cancha: c.id_cancha,
      sede_id: c.id_sede,
      id_sede: c.id_sede,
      nombre: canchaNombre,
      nombre_numero: canchaNombre,
      tipo: tipoCancha?.nombre || 'Fútbol 7',
      superficie: supNorm,
      techada: !!c.techada,
      precio_hora: precioDia,
      precio_hora_noche: precioNoche,
      hora_inicio_noche: horaInicioNoche,
      activa: c.estado === 'A',
      equipamiento: Array.isArray(c.equipamiento) ? c.equipamiento : [],
      creado_en: c.feccre,
      actualizado_en: c.fecmod || c.feccre,
      creado_por: 1,
    };
  }

  private enhanceReserva(r: any) {
    const estadoReserva = this.estadosReserva().find((e: any) => e.id_estado_reserva === r.id_estado_reserva);
    const esClienteSinCuenta = !!r.es_cliente_sin_cuenta;
    const fechaRes = r.fecha_reserva ?? r.fecha;
    return {
      ...r,
      id: r.id_reserva,
      id_reserva: r.id_reserva,
      cancha_id: r.id_cancha,
      id_cancha: r.id_cancha,
      usuario_id: esClienteSinCuenta ? 0 : this.uuidToNumber(r.id_cliente),
      fecha: fechaRes,
      fecha_reserva: fechaRes,
      hora_inicio: r.hora_inicio,
      hora_fin: r.hora_fin,
      monto_total: Number(r.monto_total ?? 0),
      adelanto: Number(r.adelanto ?? 0),
      saldo: Number(r.saldo ?? 0),
      es_cliente_sin_cuenta: esClienteSinCuenta,
      nombre_cliente: r.nombre_cliente,
      telefono_cliente: r.telefono_cliente,
      check_in_realizado: !!r.check_in_realizado,
      devolucion_monto: Number(r.devolucion_monto ?? 0),
      motivo_cancelacion: r.motivo_cancelacion,
      estado_label: estadoReserva?.nombre || 'pendiente',
      estado: (estadoReserva?.nombre || 'pendiente').toLowerCase(),
      codigo_pase: r.codigo_pase || `#CAN-${r.id_reserva.toString().padStart(4, '0')}`,
      creado_en: r.feccre,
      actualizado_en: r.fecmod || r.feccre,
    };
  }

  private enhancePago(p: any) {
    const metodoPago = this.metodosPago().find((m: any) => m.id_metodo_pago === p.id_metodo_pago);
    const numOp = p.numero_operacion || p.codigo_operacion || '';
    return {
      ...p,
      id: p.id_pago_reserva,
      id_pago_reserva: p.id_pago_reserva,
      reserva_id: p.id_reserva,
      id_reserva: p.id_reserva,
      monto: p.monto,
      comision_plataforma: p.comision_plataforma,
      monto_neto_dueno: p.monto_neto_dueno,
      metodo_pago: metodoPago?.nombre || p.id_metodo_pago.toString(),
      estado: p.estado_liquidacion === 'transferido' ? 'completado' : 'pendiente',
      numero_operacion: numOp,
      codigo_operacion: numOp,
      estado_liquidacion: p.estado_liquidacion,
      fecha_pago: (p.fecha_pago || p.feccre || '').split('T')[0],
      creado_en: p.feccre,
      actualizado_en: p.fecmod || p.feccre,
    };
  }

  async cargarHorariosSede(sedeId: number): Promise<VenueDayHours[]> {
    return firstValueFrom(this.http.get<VenueDayHours[]>(`${this.apiUrl}/venues/${sedeId}/hours`));
  }

  async guardarHorariosSede(sedeId: number, days: VenueDayHours[]): Promise<void> {
    const saved = await firstValueFrom(
      this.http.put<VenueDayHours[]>(`${this.apiUrl}/venues/${sedeId}/hours`, days),
    );
    this.horarios.update(list => [
      ...list.filter(h => Number(h.sede_id) !== sedeId),
      ...saved.map(h => ({
        sede_id: sedeId, dia_semana: h.diaSemana,
        hora_apertura: h.apertura, hora_cierre: h.cierre, activo: h.activo,
      })),
    ]);
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
    const id = b.id_bloqueo || b.id;
    return {
      ...b,
      id,
      id_bloqueo: id,
      cancha_id: b.id_cancha != null ? Number(b.id_cancha) : (b.cancha_id != null ? Number(b.cancha_id) : null),
      sede_id: b.id_sede != null ? Number(b.id_sede) : (b.sede_id != null ? Number(b.sede_id) : 0),
      alcance: b.alcance || (b.id_cancha || b.cancha_id ? 'cancha' : 'sede'),
      tipo: b.tipo || (b.fecha_fin ? 'programado' : 'inmediato'),
      motivo: b.motivo || 'Mantenimiento preventivo',
      fecha_inicio: b.fecha_inicio,
      fecha_fin: b.fecha_fin || null,
      activo: b.estado !== 'I' && b.activo !== false,
      creado_en: b.feccre || b.creado_en || this.nowIso(),
      creado_por: b.creado_por ?? 1,
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

  private resolveEstadoReservaId(nombre: string): number {
    const normalized = nombre.trim().toLowerCase();
    const estado = this.estadosReserva().find((e: any) => String(e.nombre || '').trim().toLowerCase() === normalized);
    return Number(estado?.id_estado_reserva || 1);
  }

  private resolveMetodoPagoId(input?: number | string): number {
    if (typeof input === 'number' && input > 0) return input;
    const normalized = String(input || '').trim().toLowerCase();
    const metodo = this.metodosPago().find((m: any) => {
      const name = String(m.nombre || '').trim().toLowerCase();
      return normalized && (name === normalized || normalized.includes(name) || name.includes(normalized));
    });
    if (metodo?.id_metodo_pago) return Number(metodo.id_metodo_pago);
    const fallback = this.metodosPago().find((m: any) => m.estado === 'A');
    if (fallback?.id_metodo_pago) return Number(fallback.id_metodo_pago);
    throw new Error('No existe un método de pago activo en Supabase');
  }

  private resolveClienteId(clienteId: string, usuarioLegacyId?: number): string {
    const cleanId = (clienteId || '').trim();
    const clientes = this.clientes();
    if (cleanId && clientes.some((c: any) => c.id_cliente === cleanId)) {
      return cleanId;
    }

    const byUsuarioUuid = cleanId ? clientes.find((c: any) => c.id_usuario === cleanId) : null;
    if (byUsuarioUuid?.id_cliente) return byUsuarioUuid.id_cliente;

    const usuario = this.usuarios().find((u: any) => u.id === usuarioLegacyId || u.id_usuario === cleanId);
    const byUsuario = usuario?.id_usuario ? clientes.find((c: any) => c.id_usuario === usuario.id_usuario) : null;
    if (byUsuario?.id_cliente) return byUsuario.id_cliente;

    const usuarioEmail = usuario?.correo ?? usuario?.email;
    const byCorreo = usuarioEmail ? clientes.find((c: any) => String(c.correo ?? c.email ?? '').toLowerCase() === String(usuarioEmail).toLowerCase()) : null;
    if (byCorreo?.id_cliente) return byCorreo.id_cliente;

    const active = clientes.find((c: any) => c.estado === 'A') || clientes[0];
    return active?.id_cliente || cleanId;
  }

  private resolveUsuarioReservaUuid(clienteId: string, usuarioLegacyId: number | undefined, resolvedClienteId: string): string | null {
    const cleanId = (clienteId || '').trim();
    const directUser = this.usuarios().find((u: any) => u.id_usuario === cleanId);
    if (directUser?.id_usuario) return directUser.id_usuario;

    const legacyUser = this.usuarios().find((u: any) => u.id === usuarioLegacyId);
    if (legacyUser?.id_usuario) return legacyUser.id_usuario;

    const cliente = this.clientes().find((c: any) => c.id_cliente === resolvedClienteId);
    return cliente?.id_usuario || null;
  }

  private resolveDuenoUuid(duenoId: string | number): string {
    const cleanId = String(duenoId || '').trim();
    const byUuid = this.usuarios().find((u: any) => u.id_usuario === cleanId && u.rol === 'dueno');
    if (byUuid?.id_usuario) return byUuid.id_usuario;

    const byLegacyId = this.usuarios().find((u: any) => u.id === duenoId && u.rol === 'dueno');
    if (byLegacyId?.id_usuario) return byLegacyId.id_usuario;

    const firstOwner = this.usuarios().find((u: any) => u.rol === 'dueno');
    return firstOwner?.id_usuario || cleanId;
  }

  getUsuarioOperativoUuid(): string {
    const owner = this.usuarios().find((u: any) => u.rol === 'dueno' && u.estado === 'A');
    const active = owner || this.usuarios().find((u: any) => u.estado === 'A') || this.usuarios()[0];
    return active?.id_usuario || '';
  }

  getSedeOperativaId(): number {
    return this.sedeOperativaId() ?? 0;
  }

  setSedeOperativaId(sedeId: number | string | null | undefined): void {
    const value = sedeId == null ? null : Number(sedeId);
    this.sedeOperativaId.set(Number.isFinite(value as number) ? value : null);
  }

  cancha(nombre: string) { return this.canchas().find((c) => c.nombre?.toLowerCase().includes(nombre.toLowerCase())); }
  canchaById(id: number) { return this.canchas().find((c) => c.id === id); }
  sedeById(id: number | string) { return this.sedes().find((s) => String(s.id) === String(id)); }

  // ===== PERSISTENCIA LOCAL (RESILIENCIA OFFLINE Y SIN PÉRDIDA AL RECARGAR) =====
  private readonly STORAGE_KEY_SEDES = 'canchero_sedes_locales';
  private readonly STORAGE_KEY_CANCHAS = 'canchero_canchas_locales';

  getLocalSedes(): any[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_SEDES);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private persistLocalSede(sede: any): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const sedes = this.getLocalSedes();
      const index = sedes.findIndex((s: any) => s.id === sede.id);
      if (index >= 0) {
        sedes[index] = { ...sedes[index], ...sede };
      } else {
        sedes.push(sede);
      }
      localStorage.setItem(this.STORAGE_KEY_SEDES, JSON.stringify(sedes));
    } catch {}
  }

  private updateLocalSedeId(oldId: number, newId: number): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const sedes = this.getLocalSedes();
      const updated = sedes.map((s: any) => s.id === oldId ? { ...s, id: newId, id_sede: newId } : s);
      localStorage.setItem(this.STORAGE_KEY_SEDES, JSON.stringify(updated));
    } catch {}
  }

  getLocalCanchas(): any[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_CANCHAS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private persistLocalCancha(cancha: any): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const canchas = this.getLocalCanchas();
      const index = canchas.findIndex((c: any) => c.id === cancha.id);
      if (index >= 0) {
        canchas[index] = { ...canchas[index], ...cancha };
      } else {
        canchas.push(cancha);
      }
      localStorage.setItem(this.STORAGE_KEY_CANCHAS, JSON.stringify(canchas));
    } catch {}
  }

  private readonly STORAGE_KEY_BLOQUEOS = 'canchero_bloqueos_locales';

  getLocalBloqueos(): any[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const data = localStorage.getItem(this.STORAGE_KEY_BLOQUEOS);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  persistLocalBloqueo(bloqueo: any): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const list = this.getLocalBloqueos();
      const index = list.findIndex((b: any) => String(b.id) === String(bloqueo.id));
      if (index >= 0) {
        list[index] = { ...list[index], ...bloqueo };
      } else {
        list.push(bloqueo);
      }
      localStorage.setItem(this.STORAGE_KEY_BLOQUEOS, JSON.stringify(list));
    } catch {}
  }

  removeLocalBloqueo(id: number | string): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const list = this.getLocalBloqueos().filter((b: any) => String(b.id) !== String(id));
      localStorage.setItem(this.STORAGE_KEY_BLOQUEOS, JSON.stringify(list));
    } catch {}
  }

  private updateLocalCanchaId(oldId: number, newId: number): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const canchas = this.getLocalCanchas();
      const updated = canchas.map((c: any) => c.id === oldId ? { ...c, id: newId, id_cancha: newId } : c);
      localStorage.setItem(this.STORAGE_KEY_CANCHAS, JSON.stringify(updated));
    } catch {}
  }

  private mapFormatoToTipoId(formato?: string): number {
    const f = (formato || '').toLowerCase();
    const token = f.includes('11') ? '11'
      : f.includes('9') ? '9'
      : f.includes('8') ? '8'
      : f.includes('7') ? '7'
      : f.includes('6') ? '6'
      : f.includes('5') ? '5'
      : f.includes('playa') ? 'playa'
      : f;
    const tipo = this.tipoCanchas().find((t: any) => {
      const nombre = String(t.nombre || '').trim().toLowerCase();
      return token && (nombre === token || nombre.includes(token) || token.includes(nombre));
    });
    if (tipo?.id_tipo_cancha) return Number(tipo.id_tipo_cancha);
    const fallback = this.tipoCanchas().find((t: any) => t.estado === 'A');
    if (fallback?.id_tipo_cancha) return Number(fallback.id_tipo_cancha);
    throw new Error('No existe un tipo de cancha activo en Supabase');
  }

  // ===== SEPARACIÓN POR DUEÑO =====
  getSedesPorDueno(duenoId: string | number) {
    if (duenoId === '' || duenoId == null) return [];
    // Existing catalog adapters expose numeric aliases for UUID owners.
    const legacyId = typeof duenoId === 'string' ? this.uuidToNumber(duenoId) : duenoId;
    const belongsToOwner = (s: { dueno_id?: string | number; creado_por?: string | number; id_dueno?: string }) =>
      s.id_dueno === duenoId || s.dueno_id === duenoId || s.creado_por === duenoId
      || s.dueno_id === legacyId || s.creado_por === legacyId;
    const list = this.sedes().filter(belongsToOwner);
    if (list.length > 0) return list;
    const local = this.getLocalSedes();
    return local.filter(belongsToOwner);
  }

  getSedeDelDueno(duenoId: string | number) {
    return this.getSedesPorDueno(duenoId)[0];
  }

  saveOrUpdateSede(duenoId: string | number, data: any) {
    const existing = data['id'] ? this.sedeById(data['id']) : (data['isNew'] ? null : this.getSedeDelDueno(duenoId));
    const now = this.nowIso();

    if (existing) {
      const updated = {
        ...existing,
        ...data,
        dueno_id: duenoId,
        creado_por: duenoId,
        latitud: data['latitud'] !== undefined ? Number(data['latitud']) : (existing.latitud ?? -14.06778),
        longitud: data['longitud'] !== undefined ? Number(data['longitud']) : (existing.longitud ?? -75.72861),
        actualizado_en: now,
      };
      delete updated.isNew;
      this.sedes.update((list) => list.map((s) => (s.id === existing.id ? { ...s, ...updated } : s)));
      this.persistLocalSede(updated);

      const apiPayload = {
        nombre: updated.nombre,
        direccion: updated.direccion,
        telefono: updated.telefono,
        descripcion: updated.descripcion,
        portadaUrl: updated.imagen_url,
        fotos: Array.isArray(updated.fotos) ? updated.fotos : (updated.imagen_url ? [updated.imagen_url] : []),
        latitud: updated.latitud,
        longitud: updated.longitud,
        ownerId: String(duenoId),
      };
      firstValueFrom(this.http.put<any>(`${this.apiUrl}/venues/${existing.id_sede || existing.id}`, apiPayload))
        .then((saved) => {
          const synced = this.mapBackendVenueToSede(saved);
          const merged = {
            ...updated,
            ...synced,
            imagen_url: synced.imagen_url || updated.imagen_url,
            fotos: synced.fotos?.length ? synced.fotos : (updated.fotos ?? []),
          };
          this.sedes.update((list) => list.map((s) => (s.id === existing.id ? { ...s, ...merged } : s)));
          this.persistLocalSede(merged);
        })
        .catch((error) => console.warn('Advertencia actualizando sede por Spring Boot:', error));
      return { ...existing, ...updated };
    } else {
      const nextNum = this.nextId(this.sedes());
      const nueva = {
        id: nextNum,
        id_sede: nextNum,
        dueno_id: duenoId,
        creado_por: duenoId,
        nombre: data['nombre']?.trim() || 'Mi Sede Deportiva',
        direccion: data['direccion']?.trim() || 'Sin dirección física',
        ciudad: data['ciudad']?.trim() || 'Ica',
        telefono: data['telefono']?.trim() || '+51 987 654 321',
        descripcion: data['descripcion']?.trim() || '',
        imagen_url: data['imagen_url'] || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80',
        fotos: Array.isArray(data['fotos']) ? data['fotos'] : (data['imagen_url'] ? [data['imagen_url']] : []),
        latitud: data['latitud'] !== undefined ? Number(data['latitud']) : -14.06778,
        longitud: data['longitud'] !== undefined ? Number(data['longitud']) : -75.72861,
        rating: 4.5,
        activo: true,
        estado: 'A',
        creado_en: now,
        actualizado_en: now,
        ...data,
      };
      delete nueva.isNew;
      this.sedes.update((list) => [...list, nueva]);
      this.persistLocalSede(nueva);

      const apiInsert = {
        ownerId: String(duenoId),
        nombre: nueva.nombre,
        direccion: nueva.direccion,
        telefono: nueva.telefono,
        descripcion: nueva.descripcion,
        portadaUrl: nueva.imagen_url,
        fotos: Array.isArray(nueva.fotos) ? nueva.fotos : (nueva.imagen_url ? [nueva.imagen_url] : []),
        latitud: nueva.latitud,
        longitud: nueva.longitud,
      };
      firstValueFrom(this.http.post<any>(`${this.apiUrl}/venues`, apiInsert))
        .then((saved) => {
          const synced = this.mapBackendVenueToSede(saved);
          const merged = {
            ...nueva,
            ...synced,
            imagen_url: synced.imagen_url || nueva.imagen_url,
            fotos: synced.fotos?.length ? synced.fotos : (nueva.fotos ?? []),
          };
          this.sedes.update((list) => list.map((s) => (s.id === nextNum ? merged : s)));
          this.updateLocalSedeId(nextNum, synced.id);
        })
        .catch((error) => console.warn('Advertencia creando sede por Spring Boot (respaldada localmente):', error));
      return nueva;
    }
  }

  getCanchasPorDueno(duenoId: string | number) {
    const sedeIds = this.getSedesPorDueno(duenoId).map((s) => s.id);
    const matches = this.canchas().filter((c) => sedeIds.includes(Number(c.sede_id ?? c.id_sede)));
    if (matches.length > 0) return matches;
    const local = this.getLocalCanchas();
    if (local.length > 0) {
      return local.filter((c: any) => sedeIds.includes(Number(c.sede_id ?? c.id_sede)));
    }
    return [];
  }

  getCanchasPorSede(sedeId: string | number | null | undefined) {
    if (sedeId == null || sedeId === '') return [];
    const id = Number(sedeId);
    return this.canchas().filter((c) => Number(c.sede_id ?? c.id_sede) === id);
  }

  getBorradoresCanchasPorSede(sedeId: number) {
    const savedIds = new Set(this.getCanchasPorSede(sedeId).map(c => Number(c.id)));
    return this.getLocalCanchas().filter((c: any) =>
      Number(c.sede_id ?? c.id_sede) === Number(sedeId) && !savedIds.has(Number(c.id)),
    );
  }

  async recuperarCancha(data: any) {
    const saved = await firstValueFrom(this.http.post<any>(`${this.apiUrl}/courts/recover`, this.toCourtApiPayload(data)));
    if (!saved?.id || Number(saved.venueId) !== Number(data.sede_id ?? data.id_sede)) {
      throw new Error('El servidor no confirmo el registro de la cancha en esta sede.');
    }
    const synced = this.mapBackendCourtToCancha(saved, Number(saved.venueId));
    this.updateLocalCanchaId(data.id, synced.id);
    this.canchas.update(list => [...list.filter(c => Number(c.id) !== synced.id), synced]);
    return synced;
  }

  // ===== CANCHAS =====
  async toggleCanchaActiva(canchaId: number) {
    const id = Number(canchaId);
    const cancha = this.canchas().find((c) => Number(c.id) === id);
    if (!cancha) throw new Error('La cancha no esta en el catalogo actual. Actualiza la pagina.');
    const saved = await firstValueFrom(this.http.put<{ id: number; disponible: boolean }>(
      `${this.apiUrl}/courts/${id}/operation`, { disponible: !cancha.activa },
    ));
    if (Number(saved.id) !== id || typeof saved.disponible !== 'boolean') {
      throw new Error('El servidor no confirmo el estado de la cancha.');
    }
    const updated = { ...cancha, activa: saved.disponible, estado: saved.disponible ? 'A' : 'I' };
    this.canchas.update(list => list.map(c => Number(c.id) === id ? updated : c));
    return updated;
  }

  createCancha(data: any) {
    const now = this.nowIso();
    const nextNum = this.nextId(this.canchas());
    const tipoId = this.mapFormatoToTipoId(data.formato || data.tipo);

    const cancha: any = {
      ...data,
      id: nextNum,
      id_cancha: nextNum,
      sede_id: data.sede_id,
      nombre: data.nombre,
      tipo: data.tipo || data.formato || 'Fútbol 7',
      superficie: data.superficie || 'Grass Sintético',
      techada: data.techada ?? (data.cobertura !== 'Al Aire Libre'),
      precio_hora: Number(data.precio_hora) || 100,
      precio_hora_noche: Number(data.precio_hora_noche) || Number(data.precio_hora) || 120,
      hora_inicio_noche: data.hora_inicio_noche || '18:00',
      foto_url: data.foto_url || data.foto || null,
      fotos: Array.isArray(data.fotos) && data.fotos.length > 0 ? data.fotos : (data.foto_url ? [data.foto_url] : []),
      usar_horario_sede: data.usar_horario_sede !== false,
      horarios_semana: Array.isArray(data.horarios_semana) ? data.horarios_semana : [],
      descansos_recurrentes: Array.isArray(data.descansos_recurrentes) ? data.descansos_recurrentes : [],
      activa: data.activa !== undefined ? data.activa : true,
      creado_en: now,
      actualizado_en: now,
    };

    // 1. Guardar en memoria Angular
    this.canchas.update((list) => [...list, cancha]);

    // 2. Persistir en localStorage
    this.persistLocalCancha(cancha);

    firstValueFrom(this.http.post<any>(`${this.apiUrl}/courts`, this.toCourtApiPayload(cancha)))
      .then((saved) => {
        const synced = this.mapBackendCourtToCancha(saved, Number(cancha.sede_id));
        this.canchas.update((list) => list.map((c) => (c.id === nextNum ? synced : c)));
        this.updateLocalCanchaId(nextNum, synced.id);
      })
      .catch((error) => console.warn('Advertencia guardando cancha por Spring Boot (respaldada localmente):', error));

    return cancha;
  }

  updateCancha(id: number, data: any) {
    const now = this.nowIso();
    this.canchas.update((list) =>
      list.map((c) =>
        c.id === id
          ? {
              ...c,
              ...data,
              id,
              precio_hora: Number(data.precio_hora) || c.precio_hora,
              precio_hora_noche: Number(data.precio_hora_noche) || c.precio_hora_noche || Number(data.precio_hora) || 120,
              hora_inicio_noche: data.hora_inicio_noche || c.hora_inicio_noche || '18:00',
              fotos: Array.isArray(data.fotos) ? data.fotos : (c.fotos ?? (data.foto_url ? [data.foto_url] : [])),
              usar_horario_sede: data.usar_horario_sede !== undefined ? data.usar_horario_sede : (c.usar_horario_sede !== false),
              horarios_semana: data.horarios_semana !== undefined ? data.horarios_semana : (c.horarios_semana ?? []),
              descansos_recurrentes: data.descansos_recurrentes !== undefined ? data.descansos_recurrentes : (c.descansos_recurrentes ?? []),
              actualizado_en: now,
            }
          : c,
      ),
    );
    const updated = this.canchas().find((c) => c.id === id);
    if (updated) {
      this.persistLocalCancha(updated);
      firstValueFrom(this.http.put<any>(`${this.apiUrl}/courts/${id}`, this.toCourtApiPayload(updated)))
        .then((saved) => {
          const synced = this.mapBackendCourtToCancha(saved, Number(updated.sede_id));
          this.canchas.update((list) => list.map((c) => (c.id === id ? synced : c)));
          this.persistLocalCancha(synced);
        })
        .catch((error) => console.warn('Advertencia actualizando cancha por Spring Boot:', error));
    }
    return updated;
  }

  private toCourtApiPayload(cancha: any) {
    return {
      venueId: String(cancha.sede_id ?? cancha.id_sede),
      nombre: cancha.nombre,
      tipo: cancha.formato || cancha.tipo || 'Fútbol 7',
      superficie: cancha.superficie || 'Grass Sintético',
      foto: cancha.foto_url || cancha.foto || null,
      fotos: Array.isArray(cancha.fotos) ? cancha.fotos : (cancha.foto_url ? [cancha.foto_url] : []),
      equipamiento: Array.isArray(cancha.equipamiento) ? cancha.equipamiento : [],
      techada: !!cancha.techada,
      disponible: cancha.activa !== false,
      precioHora: Number(cancha.precio_hora) || 80,
      precioHoraNoche: Number(cancha.precio_hora_noche) || Number(cancha.precio_hora) || 100,
      horaInicioNoche: cancha.hora_inicio_noche || '18:00',
      usarHorarioSede: cancha.usar_horario_sede !== false,
      horariosSemana: cancha.horarios_semana ?? [],
      descansosRecurrentes: cancha.descansos_recurrentes ?? [],
    };
  }

  // ===== BLOQUEOS & CIERRES (REGLA 5) =====
  createBloqueo(data: {
    cancha_id?: number | null;
    sede_id: number;
    alcance: 'cancha' | 'sede';
    tipo: 'inmediato' | 'programado';
    motivo: string;
    fecha_inicio: string;
    fecha_fin?: string | null;
  }) {
    const nextNum = this.nextId(this.bloqueos());
    const now = this.nowIso();
    const bloqueo = {
      id: nextNum,
      id_bloqueo: nextNum,
      cancha_id: data.cancha_id ?? null,
      sede_id: data.sede_id,
      alcance: data.alcance,
      tipo: data.tipo,
      motivo: data.motivo.trim() || 'Mantenimiento preventivo',
      fecha_inicio: data.fecha_inicio || now,
      fecha_fin: data.fecha_fin || null,
      activo: true,
      estado: 'A',
      creado_en: now,
    };

    this.bloqueos.update((list) => [...list, bloqueo]);
    this.persistLocalBloqueo(bloqueo);

    // Si es cierre inmediato, pausar operatividad de las canchas afectadas
    if (data.cancha_id && (data.tipo === 'inmediato' || !data.fecha_fin)) {
      this.canchas.update((list) =>
        list.map((c) => (c.id === data.cancha_id ? { ...c, activa: false, actualizado_en: now } : c)),
      );
      const updated = this.canchaById(data.cancha_id);
      if (updated) this.persistLocalCancha(updated);
    } else if (data.alcance === 'sede' && data.tipo === 'inmediato') {
      this.canchas.update((list) =>
        list.map((c) => (Number(c.sede_id) === Number(data.sede_id) ? { ...c, activa: false, actualizado_en: now } : c)),
      );
    }

    if (data.cancha_id) {
      supabase
        .from('bloqueo_mantenimiento')
        .insert({
          id_cancha: data.cancha_id,
          motivo: bloqueo.motivo,
          fecha_inicio: bloqueo.fecha_inicio,
          fecha_fin: bloqueo.fecha_fin || new Date(Date.now() + 86400000).toISOString(),
          estado: 'A',
        })
        .then(({ error }) => {
          if (error) console.warn('Advertencia guardando bloqueo en Supabase:', error);
        });
    }

    return bloqueo;
  }

  reabrirBloqueo(bloqueoId: number | string) {
    const now = this.nowIso();
    this.bloqueos.update((list) =>
      list.map((b) => (String(b.id) === String(bloqueoId) ? { ...b, activo: false, estado: 'I', actualizado_en: now } : b)),
    );
    const target = this.bloqueos().find((b) => String(b.id) === String(bloqueoId));
    if (target) {
      this.persistLocalBloqueo({ ...target, activo: false, estado: 'I' });
      if (target.cancha_id) {
        const otherActive = this.bloqueos().some(
          (b) => String(b.id) !== String(bloqueoId) && b.cancha_id === target.cancha_id && b.activo,
        );
        if (!otherActive) {
          this.canchas.update((list) =>
            list.map((c) => (c.id === target.cancha_id ? { ...c, activa: true, actualizado_en: now } : c)),
          );
          const c = this.canchaById(target.cancha_id);
          if (c) this.persistLocalCancha(c);
        }
      } else if (target.alcance === 'sede') {
        this.canchas.update((list) =>
          list.map((c) => (Number(c.sede_id) === Number(target.sede_id) ? { ...c, activa: true, actualizado_en: now } : c)),
        );
      }

      supabase
        .from('bloqueo_mantenimiento')
        .update({ estado: 'I', fecmod: now })
        .eq('id_bloqueo', target.id_bloqueo || target.id)
        .then();
    }
  }

  reprogramarReserva(reservaId: number, nuevaFecha: string, nuevoHorario: string) {
    const [horaInicio = '', horaFin = ''] = nuevoHorario.split(' - ');
    const now = this.nowIso();
    this.reservas.update((list) =>
      list.map((r) =>
        r.id === reservaId
          ? {
              ...r,
              fecha: nuevaFecha,
              fecha_reserva: nuevaFecha,
              hora_inicio: horaInicio.trim(),
              hora_fin: horaFin.trim(),
              actualizado_en: now,
            }
          : r,
      ),
    );
    firstValueFrom(
      this.http.patch<any>(`${this.apiUrl}/bookings/${reservaId}`, {
        fecha: nuevaFecha,
        horario: nuevoHorario,
      }),
    ).catch((err) => console.warn('Advertencia reprogramando reserva en backend:', err));
  }

  // ===== RESERVAS & PAGOS =====
  async createOnlineBooking(payload: {
    courtId: string | number;
    venueId?: string | number;
    courtName?: string;
    venueName?: string;
    fecha: string;
    horario: string;
    hours: number[];
    total: number;
    metodoPago: string;
    jugadores?: string[];
    idempotencyKey?: string;
    numeroOperacion?: string;
    comprobanteUrl?: string | null;
    paymentOutcome?: string;
    cardNumber?: string;
    cardHolder?: string;
  }): Promise<{ reserva: any; pago: any; response: any }> {
    const canchaIdNum = Number(payload.courtId);
    const cancha = this.canchaById(canchaIdNum);
    const sede = cancha ? this.sedeById(cancha.sede_id) : undefined;
    const metodoPagoId = this.resolveMetodoPagoId(payload.metodoPago);
    const metodoPagoNombre =
      this.metodosPago().find((m: any) => m.id_metodo_pago === metodoPagoId)?.nombre ||
      this.normalizarMetodoPago(payload.metodoPago || String(metodoPagoId));

    const apiPayload = {
      courtName: payload.courtName || cancha?.nombre || '',
      venueName: payload.venueName || sede?.nombre || '',
      venueId: payload.venueId ? String(payload.venueId) : sede ? String(sede.id) : '',
      courtId: String(payload.courtId),
      fecha: payload.fecha,
      horario: payload.horario,
      hours: payload.hours,
      total: this.round2(payload.total),
      metodoPago: metodoPagoNombre,
      jugadores: payload.jugadores ?? [],
      idempotencyKey: payload.idempotencyKey ?? null,
      paymentOutcome: payload.paymentOutcome ?? null,
      cardNumber: payload.cardNumber ?? null,
      cardHolder: payload.cardHolder ?? null,
    };

    const headers: Record<string, string> = {};
    if (payload.idempotencyKey) {
      headers['Idempotency-Key'] = payload.idempotencyKey;
    }

    const saved = await firstValueFrom(
      this.http.post<any>(`${this.apiUrl}/bookings`, apiPayload, { headers }),
    );

    const syncedReserva = this.mapBackendBookingToReserva(saved, this.canchas());
    const now = this.nowIso();
    const montoConfirmado = this.round2(Number(saved?.total ?? payload.total));
    const pagoEstado = saved?.paymentStatus || 'aprobado';
    const pago = {
      id: syncedReserva.id,
      id_pago_reserva: syncedReserva.id,
      reserva_id: syncedReserva.id,
      id_reserva: syncedReserva.id,
      id_metodo_pago: metodoPagoId,
      monto: montoConfirmado,
      comision_plataforma: this.round2(montoConfirmado * COMISION_PORCENTAJE),
      monto_neto_dueno: this.round2(montoConfirmado * (1 - COMISION_PORCENTAJE)),
      metodo_pago: metodoPagoNombre,
      estado: pagoEstado,
      codigo_operacion: saved?.paymentOperationNumber || payload.numeroOperacion || (payload.idempotencyKey ? `IDEMP:${payload.idempotencyKey}` : `API-${syncedReserva.id}`),
      numero_operacion: saved?.paymentOperationNumber || payload.numeroOperacion || (payload.idempotencyKey ? `IDEMP:${payload.idempotencyKey}` : `API-${syncedReserva.id}`),
      es_adelanto: false,
      comprobante_url: payload.comprobanteUrl || null,
      estado_liquidacion: pagoEstado,
      fecha_pago: now.split('T')[0],
      creado_en: now,
      actualizado_en: now,
    };

    this.reservas.update((list) => {
      const exists = list.some((r) => Number(r.id) === Number(syncedReserva.id));
      return exists
        ? list.map((r) => (Number(r.id) === Number(syncedReserva.id) ? syncedReserva : r))
        : [...list, syncedReserva];
    });
    this.pagos.update((list) => {
      const exists = list.some((p) => Number(p.reserva_id ?? p.id_reserva) === Number(syncedReserva.id));
      return exists
        ? list.map((p) => (Number(p.reserva_id ?? p.id_reserva) === Number(syncedReserva.id) ? pago : p))
        : [...list, pago];
    });

    return { reserva: syncedReserva, pago, response: saved };
  }

  createReservaConPago(reservaData: NuevaReservaInput, pagoData: NuevoPagoReservaInput) {
    const now = this.nowIso();
    const monto = this.round2(reservaData.monto);
    const montoPago = this.round2(pagoData.monto ?? reservaData.adelanto ?? reservaData.monto);
    const adelanto = this.round2(reservaData.adelanto ?? montoPago);
    const saldo = this.round2(monto - adelanto);
    const tempReservaId = this.nextId(this.reservas());
    const tempPagoId = this.nextId(this.pagos());
    const codigoPase = `#CAN-${Math.floor(1000 + Math.random() * 9000)}`;
    const metodoPagoId = this.resolveMetodoPagoId(pagoData.metodo_pago_id ?? pagoData.metodo_pago);
    const metodoPagoNombre = this.metodosPago().find((m: any) => m.id_metodo_pago === metodoPagoId)?.nombre || this.normalizarMetodoPago(pagoData.metodo_pago || String(metodoPagoId));
    const clienteId = this.resolveClienteId(reservaData.cliente_id, reservaData.usuario_id);
    const usuarioReservaId = this.resolveUsuarioReservaUuid(reservaData.cliente_id, reservaData.usuario_id, clienteId);
    const estadoPendienteId = this.resolveEstadoReservaId('pendiente');

    const reserva = {
      id: tempReservaId,
      id_reserva: tempReservaId,
      cancha_id: reservaData.cancha_id,
      id_cancha: reservaData.cancha_id,
      id_cliente: clienteId,
      id_estado_reserva: estadoPendienteId,
      usuario_id: this.uuidToNumber(clienteId),
      fecha: reservaData.fecha_reserva,
      fecha_reserva: reservaData.fecha_reserva,
      hora_inicio: reservaData.hora_inicio,
      hora_fin: reservaData.hora_fin,
      monto_total: monto,
      adelanto,
      saldo,
      estado: 'pendiente',
      codigo_pase: codigoPase,
      creado_en: now,
      actualizado_en: now,
    };

    const pago = {
      id: tempPagoId,
      id_pago_reserva: tempPagoId,
      reserva_id: reserva.id,
      id_reserva: reserva.id,
      id_metodo_pago: metodoPagoId,
      monto: montoPago,
      comision_plataforma: this.round2(montoPago * COMISION_PORCENTAJE),
      monto_neto_dueno: this.round2(montoPago * (1 - COMISION_PORCENTAJE)),
      metodo_pago: metodoPagoNombre,
      estado: 'pendiente',
      codigo_operacion: pagoData.numero_operacion || pagoData.codigo_operacion || '000000',
      numero_operacion: pagoData.numero_operacion || pagoData.codigo_operacion || '000000',
      es_adelanto: pagoData.es_adelanto ?? adelanto < monto,
      comprobante_url: pagoData.comprobante_url || null,
      estado_liquidacion: 'pendiente',
      fecha_pago: now.split('T')[0],
      creado_en: now,
      actualizado_en: now,
    };

    const cancha = this.canchaById(reservaData.cancha_id);
    const sede = cancha ? this.sedeById(cancha.sede_id) : undefined;
    const apiPayload = {
      courtName: cancha?.nombre || '',
      venueName: sede?.nombre || '',
      venueId: sede ? String(sede.id) : '',
      courtId: String(reservaData.cancha_id),
      playerId: usuarioReservaId || undefined,
      fecha: reservaData.fecha_reserva,
      horario: `${reservaData.hora_inicio} - ${reservaData.hora_fin}`,
      total: monto,
      metodoPago: metodoPagoNombre,
      jugadores: [],
    };

    firstValueFrom(this.http.post<any>(`${this.apiUrl}/bookings`, apiPayload))
      .then((saved) => {
        const syncedReserva = this.mapBackendBookingToReserva(saved, this.canchas());
        this.reservas.update((list) => [...list.filter((r) => r.id !== tempReservaId), syncedReserva]);
        this.pagos.update((list) => [
          ...list.filter((p) => p.id !== tempPagoId),
          { ...pago, reserva_id: syncedReserva.id, id_reserva: syncedReserva.id },
        ]);
      })
      .catch((error) => {
        this.reservas.update((list) => list.filter((r) => r.id !== tempReservaId));
        this.pagos.update((list) => list.filter((p) => p.id !== tempPagoId));
        console.warn('Error registrando reserva en servidor:', error);
      });

    return reserva;
  }

  async aprobarReserva(reservaId: number): Promise<void> {
    const saved = await firstValueFrom(this.http.patch<any>(`${this.apiUrl}/bookings/${reservaId}/confirm`, {}));
    const synced = this.mapBackendBookingToReserva(saved, this.canchas());
    this.reservas.update(list => list.map(row => row.id === reservaId ? { ...row, ...synced, estado: 'confirmada' } : row));
  }

  async descartarReserva(reservaId: number): Promise<void> {
    const saved = await firstValueFrom(this.http.patch<any>(`${this.apiUrl}/bookings/${reservaId}/cancel`, {}));
    const synced = this.mapBackendBookingToReserva(saved, this.canchas());
    this.reservas.update(list => list.map(row => row.id === reservaId ? { ...row, ...synced, estado: 'cancelada' } : row));
  }

  async fetchMyBookings(): Promise<any[]> {
    return firstValueFrom(this.http.get<any[]>(`${this.apiUrl}/bookings/my`));
  }

  async cancelPlayerBooking(reservaId: number | string): Promise<any> {
    const saved = await firstValueFrom(this.http.patch<any>(`${this.apiUrl}/bookings/${reservaId}/cancel`, {}));
    const synced = this.mapBackendBookingToReserva(saved, this.canchas());
    this.reservas.update(list => list.map(row => String(row.id) === String(reservaId) ? { ...row, ...synced, estado: 'cancelada' } : row));
    return saved;
  }

  crearReservaPresencial(_input: NuevaReservaPresencialInput): never {
    throw new Error('Esta operacion requiere un contrato de servidor que todavia no esta implementado.');
  }

  cobrarSaldoReserva(_reservaId: number, _montoSaldo: number, _metodoPago: string, _numeroOperacion?: string): never {
    throw new Error('Esta operacion requiere un contrato de servidor que todavia no esta implementado.');
  }

  registrarCheckIn(_reservaId: number): never {
    throw new Error('Esta operacion requiere un contrato de servidor que todavia no esta implementado.');
  }

  cancelarReservaConDevolucion(_reservaId: number, _motivo: string, _montoDevolucion: number): never {
    throw new Error('Esta operacion requiere un contrato de servidor que todavia no esta implementado.');
  }

  updateSedeAdelantoMinimo(_sedeId: number, _porcentaje: number): never {
    throw new Error('Esta operacion requiere un contrato de servidor que todavia no esta implementado.');
  }

  getReservasPorDueno(duenoId: string | number) {
    const canchaIds = this.getCanchasPorDueno(duenoId).map((c) => c.id);
    return this.reservas().filter((r) => canchaIds.includes(r.cancha_id));
  }

  getReservasPorCliente(clienteId: string) {
    return this.reservas().filter((r) => r.usuario_id === clienteId);
  }

  getReservasPorJugador(usuarioId: string) {
    const usuario = this.usuarios().find(u => u.id_usuario === usuarioId || String(u.id) === String(usuarioId));
    if (!usuario) return [];
    return this.reservas().filter((r) => r.usuario_id === usuario.id || (usuario.id_usuario && r.id_usuario === usuario.id_usuario));
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

  getCourtPublica(courtId: string | number): { court: Court; venue: Venue } | undefined {
    if (courtId == null || courtId === '') return undefined;
    const courtIdStr = String(courtId).trim();
    const c = this.canchas().find((item) => String(item.id) === courtIdStr && item.activa);
    if (!c) return undefined;
    const venue = this.getVenueDetalle(String(c.sede_id));
    if (!venue) return undefined;
    const court = venue.canchas.find((item) => String(item.id) === courtIdStr);
    if (!court) return undefined;
    return { court, venue };
  }

  private mapSede(sede: any, onlyActive: boolean): Venue | undefined {
    const canchas = this.canchas().filter((c) => c.sede_id === sede.id && (!onlyActive || c.activa));
    if (onlyActive && canchas.length === 0) return undefined;

    const courts: Court[] = canchas.map((c) => {
      let cobertura = c.cobertura || (c.techada ? 'Techada' : 'Al Aire Libre');
      if (typeof c.superficie === 'string' && c.superficie.toLowerCase().includes('lona')) {
        cobertura = 'Techada con Lona';
      }

      return {
        id: String(c.id),
        id_cancha: Number(c.id_cancha ?? c.id),
        id_sede: Number(c.id_sede ?? c.sede_id),
        nombre: c.nombre,
        tipo: (c.tipo as CourtType) || 'Fútbol 7',
        formato: c.formato || c.tipo || 'Fútbol 7',
        superficie: c.superficie || 'Grass Sintético',
        cobertura,
        techada: c.cobertura ? c.cobertura !== 'Al Aire Libre' : !!c.techada,
        equipamiento: Array.isArray(c.equipamiento) ? c.equipamiento : [],
        precioHora: c.precio_hora,
        precioHoraNoche: c.precio_hora_noche ?? c.precio_hora,
        horaInicioNoche: c.hora_inicio_noche || '18:00',
        disponible: c.activa,
        foto: c.foto_url,
        usar_horario_sede: c.usar_horario_sede ?? true,
        horarios_semana: Array.isArray(c.horarios_semana) ? c.horarios_semana : [],
        descansos_recurrentes: Array.isArray(c.descansos_recurrentes) ? c.descansos_recurrentes : [],
      };
    });

    // Agrupar etiquetas únicas de las canchas para las amenidades / tags de la sede
    const amenidadesSet = new Set<string>();
    for (const c of courts) {
      if (c.tipo) amenidadesSet.add(c.tipo);
      if (c.superficie) amenidadesSet.add(c.superficie);
      if (c.cobertura) amenidadesSet.add(c.cobertura);
      if (Array.isArray(c.equipamiento)) {
        c.equipamiento.forEach((e) => amenidadesSet.add(e));
      }
    }

    const precioBase = courts.reduce((min, court) => Math.min(min, court.precioHora), Number.MAX_SAFE_INTEGER);
    const fallbackFoto = 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=800&auto=format&fit=crop';
    const fotosGuardadas = Array.isArray(sede.fotos) ? sede.fotos.filter(Boolean) : [];
    const fotosCanchas = courts.map((court) => court.foto).filter(Boolean);
    const fotos = Array.from(new Set([sede.imagen_url, ...fotosGuardadas, ...fotosCanchas].filter(Boolean)));
    return {
      id: String(sede.id),
      nombre: sede.nombre,
      ciudad: sede.ciudad || 'Ica',
      distrito: sede.distrito || 'Ica',
      direccion: sede.direccion,
      latitud: sede.latitud != null ? Number(sede.latitud) : -14.06778,
      longitud: sede.longitud != null ? Number(sede.longitud) : -75.72861,
      rating: sede.rating ?? 4.6,
      precioBase: courts.length ? (precioBase === Number.MAX_SAFE_INTEGER ? 80 : precioBase) : 80,
      fotos: fotos.length ? fotos : [fallbackFoto],
      amenidades: Array.from(amenidadesSet),
      canchas: courts,
      descripcion: sede.descripcion,
      telefono: sede.telefono,
    };
  }

  getCourtSlotAvailability(court: Court, dateStr: string, hour: number, nowDate?: Date): CourtSlotAvailability {
    return resolveSlotAvailability(
      court,
      dateStr,
      hour,
      this.reservas(),
      this.bloqueos(),
      this.horarios(),
      this.tarifasCancha(),
      nowDate,
    );
  }

  async fetchCourtAvailability(
    courtId: string | number,
    from: string,
    to: string,
  ): Promise<{ horarios: any[]; tarifas: any[]; bloqueos: any[]; ocupaciones: any[] }> {
    const idStr = String(courtId).replace(/^court-/, '');
    try {
      const resp = await firstValueFrom(
        this.http.get<any>(`${this.apiUrl}/courts/${encodeURIComponent(idStr)}/availability`, {
          params: { from, to },
        }),
      );
      if (resp) {
        const horarios = Array.isArray(resp.horarios) ? resp.horarios : [];
        const tarifas = Array.isArray(resp.tarifas) ? resp.tarifas : [];
        const bloqueos = Array.isArray(resp.bloqueos) ? resp.bloqueos : [];
        const ocupaciones = Array.isArray(resp.ocupaciones) ? resp.ocupaciones : [];
        return { horarios, tarifas, bloqueos, ocupaciones };
      }
    } catch (error: any) {
      if (error?.status === 404 || error?.status === 400) {
        throw new Error(error?.error?.message || 'No se pudo consultar la disponibilidad de la cancha');
      }
    }

    // Fallback acotado por cancha y rango de fechas sin exponer PII
    const numericCourtId = Number(idStr);
    if (!Number.isNaN(numericCourtId) && numericCourtId > 0) {
      const { data: resData, error: resErr } = await supabase
        .from('reserva')
        .select('id_cancha, fecha_reserva, hora_inicio, hora_fin, id_estado_reserva, estado')
        .eq('id_cancha', numericCourtId)
        .gte('fecha_reserva', from)
        .lte('fecha_reserva', to)
        .eq('estado', 'A');

      if (resErr) {
        this.loadErrors.update((errs) => [...new Set([...errs, 'reserva'])]);
        throw new Error('No se pudo verificar la disponibilidad en línea.');
      }

      const ocupaciones = (resData ?? []).map((r: any) => this.enhanceReserva(r));
      return {
        horarios: this.horarios(),
        tarifas: this.tarifasCancha(),
        bloqueos: this.bloqueos(),
        ocupaciones,
      };
    }

    if (
      this.loadErrors().includes('reserva') ||
      this.loadErrors().includes('bloqueo_mantenimiento') ||
      this.loadErrors().includes('tipo_horario') ||
      this.loadErrors().includes('catalogo')
    ) {
      throw new Error('No se pudo comprobar la disponibilidad actual de la cancha.');
    }

    return {
      horarios: this.horarios(),
      tarifas: this.tarifasCancha(),
      bloqueos: this.bloqueos(),
      ocupaciones: this.reservas(),
    };
  }

  async quoteCourtBooking(
    courtId: string | number,
    fecha: string,
    hours: number[],
  ): Promise<BookingBlock | null> {
    const idStr = String(courtId).replace(/^court-/, '');
    try {
      const resp = await firstValueFrom(
        this.http.post<any>(`${this.apiUrl}/courts/${encodeURIComponent(idStr)}/quote`, {
          fecha,
          hours,
        }),
      );
      if (resp) {
        return {
          isValid: !!resp.valid,
          errorMessage: resp.errorMessage ?? undefined,
          dateStr: resp.fecha ?? fecha,
          timeStart: resp.timeStart ?? undefined,
          timeEnd: resp.timeEnd ?? undefined,
          displayRange: resp.displayRange ?? undefined,
          durationHours: Number(resp.durationHours ?? hours.length),
          tranches: Array.isArray(resp.tranches) ? resp.tranches : [],
          subtotal: Number(resp.subtotal ?? 0),
        };
      }
    } catch {
      // Fallback a cotización local por tramo cuando la API local no está levantada
    }
    return null;
  }

  // ===== UTILIDADES =====
  async uploadPublicImage(file: File, folder = 'uploads'): Promise<string> {
    const safeName = file.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase();
    const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName || 'imagen.jpg'}`;
    const buckets = ['canchero-media', 'canchero-assets', 'sedes', 'imagenes', 'public'];
    let lastError: unknown = null;

    for (const bucket of buckets) {
      const { error } = await supabase.storage.from(bucket).upload(path, file, {
        cacheControl: '3600',
        contentType: file.type || 'image/jpeg',
        upsert: false,
      });
      if (!error) {
        return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      }
      lastError = error;
    }

    throw lastError ?? new Error('No se pudo subir la imagen a Supabase Storage');
  }
}
