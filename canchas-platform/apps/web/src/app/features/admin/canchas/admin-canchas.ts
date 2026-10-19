import { Component, ElementRef, computed, effect, inject, input, output, signal, untracked, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import { AdminAddAction } from '../components/add-action/add-action';
import type {
  AdminCourt,
  AdminVenueOption,
  CierreCancha,
  DescansoRecurrente,
  ReservaAfectada,
} from './admin-canchas.models';
import type { VenueDayHours } from '@shared/models/venue-hours.model';

export const FORMATOS_CANCHA = [
  'Fútbol 5 (10 jugadores)',
  'Fútbol 6 (12 jugadores)',
  'Fútbol 7 (14 jugadores)',
  'Fútbol 8 (16 jugadores)',
  'Fútbol 9 (18 jugadores)',
  'Fútbol 11 (Cancha reglamentaria oficial)',
] as const;

export const SUPERFICIES_CANCHA = [
  'Grass Sintético',
  'Césped Natural',
  'Losa Deportiva',
  'Piso de Madera',
  'Piso de Goma',
  'Arena',
] as const;

export const COBERTURAS_CANCHA = [
  'Al Aire Libre',
  'Techada',
  'Techada con Lona',
  'Completamente Cerrada',
] as const;

export const EQUIPAMIENTOS_CANCHA = [
  'Con Iluminación',
  'Con Paredes / Muros',
  'Medidas Oficiales',
  'Con Rejas',
  'Con Malla',
  'Cancha Multiuso',
] as const;

export const DIAS_SEMANA_LABELS = [
  { dia: 1, label: 'Lunes' },
  { dia: 2, label: 'Martes' },
  { dia: 3, label: 'Miércoles' },
  { dia: 4, label: 'Jueves' },
  { dia: 5, label: 'Viernes' },
  { dia: 6, label: 'Sábado' },
  { dia: 0, label: 'Domingo' },
];

@Component({
  selector: 'app-admin-canchas',
  standalone: true,
  imports: [
    CommonModule,
    MatButtonModule,
    MatCardModule,
    MatChipsModule,
    MatIconModule,
    MatSlideToggleModule,
    MatTooltipModule,
    AdminAddAction,
  ],
  templateUrl: './admin-canchas.html',
  styleUrl: './admin-canchas.css',
})
export class AdminCanchas {
  private readonly photoInput = viewChild<ElementRef<HTMLInputElement>>('courtPhotoInput');
  protected readonly db = inject(DatabaseService);

  private readonly auth = inject(AuthService, { optional: true });
  private readonly router = inject(Router, { optional: true });

  readonly duenoIdInput = input<string | number>(undefined, { alias: 'duenoId' });
  readonly duenoId = computed<string | number>(() => {
    const custom = this.duenoIdInput();
    if (custom !== undefined && custom !== null && custom !== '') return custom;
    return this.auth?.currentUser()?.id ?? '';
  });

  readonly sedesDelDuenoInput = input<AdminVenueOption[]>(undefined, { alias: 'sedesDelDueno' });
  readonly sedesDelDueno = computed<AdminVenueOption[]>(() => {
    const custom = this.sedesDelDuenoInput();
    if (custom !== undefined) return custom;
    const dueno = this.duenoId();
    return dueno && this.db.getSedesPorDueno ? (this.db.getSedesPorDueno(dueno) as AdminVenueOption[]) : [];
  });

  readonly sedeDelDuenoInput = input<AdminVenueOption | undefined>(undefined, { alias: 'sedeDelDueno' });
  readonly sedeDelDueno = computed<AdminVenueOption | undefined>(() => {
    const custom = this.sedeDelDuenoInput();
    if (custom !== undefined) return custom;
    const sedes = this.sedesDelDueno();
    const activeId = this.db.sedeOperativaId ? this.db.sedeOperativaId() : null;
    if (activeId) {
      const match = sedes.find((s) => Number(s.id) === Number(activeId));
      if (match) return match;
    }
    return sedes[0] ?? undefined;
  });

  readonly registerVenue = output<void>();
  readonly hoursRequested = output<void>();
  readonly notice = output<string>();
  readonly venueSelected = output<number>();

  private readonly selectedVenueId = computed(() => this.sedeDelDueno()?.id);

  protected readonly canchasDelDueno = computed<AdminCourt[]>(() => {
    const id = this.sedeDelDueno()?.id;
    if (!id || !this.sedesDelDueno().some((sede) => sede.id === id)) return [];
    return this.db.getCanchasPorSede(id);
  });

  protected readonly reservasDelDueno = computed(() => {
    const ids = new Set(this.canchasDelDueno().map((cancha) => cancha.id));
    return this.db
      .reservas()
      .filter((reserva) => ids.has(reserva.cancha_id))
      .map((reserva) => ({ reserva }));
  });

  private readonly recuperacionesIntentadas = new Set<number>();
  private readonly recuperando = signal(false);

  protected readonly isLoading = computed(() => this.db.catalogLoading() || this.recuperando());
  protected readonly hasError = computed(() => this.db.loadErrors().length > 0);
  protected readonly errorMessage = computed(() => this.db.loadErrors().join(', '));

  constructor() {
    effect(() => {
      this.selectedVenueId();
      this.cerrarFormularioCancha();
      this.cerrarGestionCancha();
    });
    effect(() => {
      const sedeId = Number(this.sedeDelDueno()?.id);
      if (this.db.catalogLoading() || !sedeId || !this.sedesDelDueno().some(s => Number(s.id) === sedeId)) return;
      const drafts = this.db.getBorradoresCanchasPorSede?.(sedeId) ?? [];
      if (drafts.length === 0 || this.recuperacionesIntentadas.has(sedeId)) return;
      this.recuperacionesIntentadas.add(sedeId);
      untracked(() => { void this.recuperarCanchas(drafts); });
    });
  }

  private async recuperarCanchas(drafts: AdminCourt[]): Promise<void> {
    this.recuperando.set(true);
    try {
      for (const draft of drafts) await this.db.recuperarCancha(draft);
    } catch (error: any) {
      const status = error?.status ? ` (HTTP ${error.status})` : '';
      this.errorOperatividad.set(`No se pudo registrar la cancha en el servidor${status}. Los datos se conservan; recarga para reintentar.`);
    } finally {
      this.recuperando.set(false);
    }
  }

  protected mostrarToast(message: string): void {
    this.notice.emit(message);
  }

  protected irARegistrarSede(): void {
    this.registerVenue.emit();
    void this.router?.navigate(['/admin/sedes'])?.catch(() => {});
  }

  protected abrirDrawerHorarios(_nombre?: string): void {
    this.hoursRequested.emit();
    void this.router?.navigate(['/admin/sedes'], { queryParams: { openHours: 'true' } })?.catch(() => {});
  }

  /* ================= ESTADOS DEL FORMULARIO DE CANCHA ================= */
  protected readonly formularioCanchaAbierto = signal(false);
  protected readonly crearCanchaOpen = signal(false);
  protected readonly canchaEnEdicion = signal<AdminCourt | null>(null);

  protected readonly nuevaCanchaSedeId = signal<number | null>(null);
  protected readonly nuevaCanchaNombre = signal<string>('');
  protected readonly nuevaCanchaFormato = signal<string>('Fútbol 7 (14 jugadores)');
  protected readonly nuevaCanchaSuperficie = signal<string>('Grass Sintético');
  protected readonly nuevaCanchaCobertura = signal<string>('Techada');
  protected readonly nuevaCanchaEquipamiento = signal<string[]>(['Con Iluminación', 'Medidas Oficiales']);
  protected readonly nuevaCanchaTarifa = signal<number>(100);
  protected readonly nuevaCanchaTarifaNoc = signal<number>(120);
  protected readonly nuevaCanchaHoraInicioNoche = signal<string>('18:00');
  protected readonly nuevaCanchaFoto = signal<string>('');
  protected readonly nuevaCanchaFotos = signal<string[]>([]);
  protected readonly nuevaCanchaDesc = signal<string>('');
  protected readonly nuevaCanchaUsarHorarioSede = signal<boolean>(true);
  protected readonly subiendoFoto = signal<boolean>(false);

  protected readonly formatosCancha = FORMATOS_CANCHA;
  protected readonly superficiesCancha = SUPERFICIES_CANCHA;
  protected readonly coberturasCancha = COBERTURAS_CANCHA;
  protected readonly equipamientosCancha = EQUIPAMIENTOS_CANCHA;
  protected readonly diasSemanaLabels = DIAS_SEMANA_LABELS;

  protected readonly fallbackCourtImg = 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=800&auto=format&fit=crop';

  protected onCourtImgError(event: Event): void {
    const el = event.target as HTMLImageElement;
    if (el && el.src !== this.fallbackCourtImg) {
      el.src = this.fallbackCourtImg;
    }
  }

  /* ================= GESTIÓN DE HORARIOS, DESCANSOS Y CIERRES ================= */
  protected readonly canchaGestion = signal<AdminCourt | null>(null);
  protected readonly panelGestionAbierto = signal<boolean>(false);
  protected readonly tabGestion = signal<'horarios' | 'descansos' | 'cierres'>('horarios');

  // Horario individual
  protected readonly horarioModo = signal<'comun' | 'individual'>('comun');
  protected readonly horariosIndividualesSemana = signal<VenueDayHours[]>([
    { diaSemana: 1, apertura: '07:00', cierre: '23:00', activo: true },
    { diaSemana: 2, apertura: '07:00', cierre: '23:00', activo: true },
    { diaSemana: 3, apertura: '07:00', cierre: '23:00', activo: true },
    { diaSemana: 4, apertura: '07:00', cierre: '23:00', activo: true },
    { diaSemana: 5, apertura: '07:00', cierre: '23:00', activo: true },
    { diaSemana: 6, apertura: '07:00', cierre: '23:00', activo: true },
    { diaSemana: 0, apertura: '08:00', cierre: '22:00', activo: true },
  ]);

  // Descansos recurrentes
  protected readonly descansosCancha = signal<DescansoRecurrente[]>([]);
  protected readonly nuevoDescansoNombre = signal<string>('');
  protected readonly nuevoDescansoDias = signal<number[]>([1, 2, 3, 4, 5]);
  protected readonly nuevoDescansoHoraInicio = signal<string>('13:00');
  protected readonly nuevoDescansoHoraFin = signal<string>('14:00');
  protected readonly errorDescanso = signal<string>('');

  // Cierres inmediatos / programados
  protected readonly mostrarFormularioNuevoCierre = signal<boolean>(false);
  protected readonly nuevoCierreAlcance = signal<'cancha' | 'sede'>('cancha');
  protected readonly nuevoCierreTipo = signal<'inmediato' | 'programado'>('inmediato');
  protected readonly nuevoCierreMotivo = signal<string>('');
  protected readonly nuevoCierreFechaInicio = signal<string>('');
  protected readonly nuevoCierreFechaFin = signal<string>('');
  protected readonly errorCierre = signal<string>('');

  // Reprogramación de reservas afectadas
  protected readonly reservaEnReprogramacion = signal<ReservaAfectada | null>(null);
  protected readonly reprogramarFecha = signal<string>('');
  protected readonly reprogramarHoraInicio = signal<string>('18:00');
  protected readonly reprogramarHoraFin = signal<string>('19:00');

  /* ================= COMPUTADOS DE MÉTRICAS KPI ================= */
  protected readonly totalLosas = computed(() => this.canchasDelDueno().length);
  protected readonly activasCount = computed(() => this.canchasDelDueno().filter((c) => c.activa).length);
  protected readonly mantenimientoCount = computed(() => this.canchasDelDueno().filter((c) => !c.activa).length);
  protected readonly primeraNoActiva = computed(() => this.canchasDelDueno().find((c) => !c.activa)?.nombre ?? '');

  protected readonly tarifaPromedio = computed(() => {
    const list = this.canchasDelDueno();
    if (list.length === 0) return 0;
    return list.reduce((acc, c) => acc + c.precio_hora, 0) / list.length;
  });

  protected readonly tarifaVariacionTexto = computed(() => {
    if (this.totalLosas() === 0 || this.tarifaPromedio() === 0) {
      return 'Sin losas configuradas';
    }
    return 'Tarifa base promedio de tus losas';
  });

  protected readonly picoDemandaHorario = computed(() => {
    const res = this.reservasDelDueno();
    if (res.length === 0) return '--:--';
    const counts: Record<string, number> = {};
    for (const r of res) {
      const h = r.reserva.hora_inicio || '20:00';
      counts[h] = (counts[h] || 0) + 1;
    }
    const topHour = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || '20:00';
    const endHour = (parseInt(topHour.split(':')[0], 10) + 1).toString().padStart(2, '0') + ':00';
    return `${topHour} - ${endHour}`;
  });

  protected readonly picoDemandaTexto = computed(() => {
    const res = this.reservasDelDueno();
    if (res.length === 0) return 'Sin reservas registradas aún';
    const nocturnas = res.filter((r) => {
      const hora = parseInt(r.reserva.hora_inicio?.split(':')[0] || '0', 10);
      const cancha = this.canchasDelDueno().find((c) => c.id === r.reserva.cancha_id);
      const horaNocConfigurada = parseInt((cancha?.hora_inicio_noche || '18:00').split(':')[0] || '18', 10);
      return hora >= horaNocConfigurada;
    }).length;
    const pct = Math.round((nocturnas / res.length) * 100);
    return `${pct}% ocupación en horario nocturno`;
  });

  /* ================= CIERRES Y RESERVAS AFECTADAS ================= */
  protected readonly cierresSedeYCancha = computed<CierreCancha[]>(() => {
    const targetCancha = this.canchaGestion();
    const sedeId = this.sedeDelDueno()?.id;
    if (!sedeId) return [];

    return this.db
      .bloqueos()
      .filter((b) => {
        const matchesSede = Number(b.sede_id) === Number(sedeId);
        if (!matchesSede) return false;
        if (!targetCancha) return true;
        return b.alcance === 'sede' || Number(b.cancha_id) === Number(targetCancha.id);
      })
      .map((b) => ({
        id: b.id,
        cancha_id: b.cancha_id,
        sede_id: b.sede_id,
        alcance: (b.alcance || (b.cancha_id ? 'cancha' : 'sede')) as 'cancha' | 'sede',
        tipo: (b.tipo || (b.fecha_fin ? 'programado' : 'inmediato')) as 'inmediato' | 'programado',
        motivo: b.motivo || 'Mantenimiento preventivo',
        fecha_inicio: b.fecha_inicio,
        fecha_fin: b.fecha_fin,
        activo: b.activo !== false,
        creado_en: b.creado_en,
      }));
  });

  protected readonly reservasAfectadasPorCierres = computed<ReservaAfectada[]>(() => {
    const targetCancha = this.canchaGestion();
    const sedeId = this.sedeDelDueno()?.id;
    if (!sedeId) return [];

    const cierresActivos = this.cierresSedeYCancha().filter((c) => c.activo);
    if (cierresActivos.length === 0) return [];

    const canchasSede = this.canchasDelDueno();
    const canchaMap = new Map(canchasSede.map((c) => [c.id, c.nombre]));
    const usuarios = this.db.usuarios();
    const reservas = this.db.reservas().filter((r) => r.estado !== 'cancelada');

    const result: ReservaAfectada[] = [];

    for (const r of reservas) {
      const canchaId = Number(r.cancha_id);
      if (!canchaMap.has(canchaId)) continue;
      if (targetCancha && canchaId !== Number(targetCancha.id)) continue;

      const rFecha = r.fecha || r.fecha_reserva || '';
      const rHoraInicio = r.hora_inicio || '00:00';
      const rHoraFin = r.hora_fin || '23:59';
      const rStart = new Date(`${rFecha}T${rHoraInicio.length === 5 ? rHoraInicio + ':00' : rHoraInicio}`);
      const rEnd = new Date(`${rFecha}T${rHoraFin.length === 5 ? rHoraFin + ':00' : rHoraFin}`);

      const coincideCierre = cierresActivos.some((cierre) => {
        if (cierre.alcance === 'cancha' && Number(cierre.cancha_id) !== canchaId) {
          return false;
        }

        if (cierre.tipo === 'inmediato' || !cierre.fecha_fin) {
          const hoyStr = new Date().toISOString().split('T')[0];
          return rFecha >= hoyStr;
        }

        const cStart = new Date(cierre.fecha_inicio);
        const cEnd = new Date(cierre.fecha_fin);
        return rStart < cEnd && rEnd > cStart;
      });

      if (coincideCierre) {
        const jugador = usuarios.find((u) => u.id === r.usuario_id || u.id_usuario === r.usuario_id);
        result.push({
          reservaId: r.id,
          codigoPase: r.codigo_pase || `#CAN-${1000 + r.id}`,
          canchaId,
          canchaNombre: canchaMap.get(canchaId) || 'Cancha',
          jugadorNombre: jugador?.nombre || r.nombre_cliente || 'Cliente Presencial',
          telefono: jugador?.telefono || r.telefono_cliente || '',
          fecha: rFecha,
          horario: `${rHoraInicio} - ${rHoraFin}`,
          monto: Number(r.monto_total || r.monto || 0),
          estado: r.estado || 'confirmada',
        });
      }
    }

    return result;
  });

  protected tieneCierreActivo(canchaId: number): boolean {
    return this.db
      .bloqueos()
      .some((b) => (b.cancha_id === canchaId || (!b.cancha_id && Number(b.sede_id) === Number(this.selectedVenueId()))) && b.activo !== false);
  }

  /* ================= ACCIONES DE OPERATIVIDAD Y FORMULARIO ================= */
  protected readonly cambiandoOperatividad = signal(false);
  protected readonly errorOperatividad = signal('');

  protected async toggleOperativaCancha(canchaId: number): Promise<void> {
    if (this.cambiandoOperatividad() || !this.canchasDelDueno().some(cancha => Number(cancha.id) === Number(canchaId))) return;
    this.cambiandoOperatividad.set(true);
    this.errorOperatividad.set('');
    try {
      const cancha = await this.db.toggleCanchaActiva(canchaId);
      this.mostrarToast(`Operatividad de "${cancha.nombre}" actualizada (${cancha.activa ? 'Activa' : 'Pausada'})`);
    } catch {
      this.errorOperatividad.set('No se pudo confirmar el cambio. La cancha conserva su estado anterior. Intenta nuevamente.');
    } finally {
      this.cambiandoOperatividad.set(false);
    }
  }

  protected reanudarCanchaMantenimiento(): void {
    const pausada = this.canchasDelDueno().find((c) => !c.activa);
    if (pausada) {
      void this.toggleOperativaCancha(pausada.id);
    } else {
      this.mostrarToast('Todas tus canchas están operativas');
    }
  }

  protected abrirFormularioNuevaCancha(): void {
    if (this.sedesDelDueno().length === 0) {
      this.mostrarToast('No puedes añadir una cancha sin una sede. Registra primero tu complejo deportivo.');
      this.irARegistrarSede();
      return;
    }
    this.canchaEnEdicion.set(null);
    const sedeActual = this.sedeDelDueno() ?? this.sedesDelDueno()[0];
    this.nuevaCanchaSedeId.set(sedeActual ? sedeActual.id : null);
    this.nuevaCanchaNombre.set('');
    this.nuevaCanchaFormato.set('Fútbol 7 (14 jugadores)');
    this.nuevaCanchaSuperficie.set('Grass Sintético');
    this.nuevaCanchaCobertura.set('Techada');
    this.nuevaCanchaEquipamiento.set(['Con Iluminación', 'Medidas Oficiales']);
    this.nuevaCanchaTarifa.set(100);
    this.nuevaCanchaTarifaNoc.set(120);
    this.nuevaCanchaHoraInicioNoche.set('18:00');
    this.nuevaCanchaFoto.set('');
    this.nuevaCanchaFotos.set([]);
    this.nuevaCanchaDesc.set('');
    this.nuevaCanchaUsarHorarioSede.set(true);
    this.crearCanchaOpen.set(false);
    this.formularioCanchaAbierto.set(true);
  }

  protected abrirModalCrearCancha(): void {
    this.abrirFormularioNuevaCancha();
  }

  protected editarCancha(cancha: AdminCourt): void {
    if (!this.canchasDelDueno().some((item) => item.id === cancha.id)) return;
    this.canchaEnEdicion.set(cancha);
    this.nuevaCanchaSedeId.set(cancha.sede_id ?? (this.sedesDelDueno()[0]?.id ?? null));
    this.nuevaCanchaNombre.set(cancha.nombre || '');
    const formato = cancha.formato || cancha.tipo || '';
    const jugadores = formato.match(/\d+/)?.[0];
    this.nuevaCanchaFormato.set(FORMATOS_CANCHA.find(option => option === formato)
      ?? FORMATOS_CANCHA.find(option => option.match(/\d+/)?.[0] === jugadores)
      ?? 'Fútbol 7 (14 jugadores)');
    this.nuevaCanchaSuperficie.set(cancha.superficie || 'Grass Sintético');
    this.nuevaCanchaCobertura.set(cancha.cobertura || (cancha.techada ? 'Techada' : 'Al Aire Libre'));
    this.nuevaCanchaEquipamiento.set(Array.isArray(cancha.equipamiento) ? [...cancha.equipamiento] : []);
    this.nuevaCanchaTarifa.set(cancha.precio_hora != null ? Number(cancha.precio_hora) : 100);
    this.nuevaCanchaTarifaNoc.set(cancha.precio_hora_noche != null ? Number(cancha.precio_hora_noche) : 120);
    this.nuevaCanchaHoraInicioNoche.set(cancha.hora_inicio_noche || '18:00');
    this.nuevaCanchaFoto.set(cancha.foto_url || '');
    this.nuevaCanchaFotos.set(
      Array.isArray(cancha.fotos) && cancha.fotos.length > 0
        ? [...cancha.fotos]
        : cancha.foto_url
          ? [cancha.foto_url]
          : [],
    );
    this.nuevaCanchaDesc.set(cancha.descripcion || '');
    this.nuevaCanchaUsarHorarioSede.set(cancha.usar_horario_sede !== false);
    this.crearCanchaOpen.set(false);
    this.formularioCanchaAbierto.set(true);
  }

  protected cerrarFormularioCancha(): void {
    this.formularioCanchaAbierto.set(false);
    this.crearCanchaOpen.set(false);
    this.canchaEnEdicion.set(null);
  }

  protected cerrarModalCrearCancha(): void {
    this.cerrarFormularioCancha();
  }

  protected getSedeNombreCancha(sedeId: number | null): string {
    if (sedeId) {
      const s = this.sedesDelDueno().find((item) => item.id === sedeId);
      if (s) return s.nombre;
    }
    return this.sedeDelDueno()?.nombre ?? 'Mi Sede Deportiva';
  }

  protected setFormatoCancha(fmt: string): void {
    this.nuevaCanchaFormato.set(fmt);
  }

  protected setSuperficieCancha(sup: string): void {
    this.nuevaCanchaSuperficie.set(sup);
  }

  protected setCoberturaCancha(cob: string): void {
    this.nuevaCanchaCobertura.set(cob);
  }

  protected toggleEquipamientoCancha(eq: string): void {
    this.nuevaCanchaEquipamiento.update((items) => {
      if (items.includes(eq)) {
        return items.filter((i) => i !== eq);
      } else {
        return [...items, eq];
      }
    });
  }

  protected isEquipamientoSelected(eq: string): boolean {
    return this.nuevaCanchaEquipamiento().includes(eq);
  }

  protected triggerInputFotoCancha(): void {
    const input = this.photoInput()?.nativeElement;
    input?.click();
  }

  protected async onCanchaFotoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;

    const files = Array.from(input.files);
    this.subiendoFoto.set(true);
    const uploadedUrls: string[] = [];

    for (const file of files) {
      try {
        const publicUrl = await this.db.uploadPublicImage(file, 'canchas');
        uploadedUrls.push(publicUrl);
      } catch {
        // Fallback resiliente offline
        const dataUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.readAsDataURL(file);
        });
        uploadedUrls.push(dataUrl);
      }
    }

    this.subiendoFoto.set(false);

    if (uploadedUrls.length > 0) {
      if (!this.nuevaCanchaFoto()) {
        this.nuevaCanchaFoto.set(uploadedUrls[0]);
      }
      this.nuevaCanchaFotos.update((prev) => [...prev, ...uploadedUrls]);
      this.mostrarToast(
        uploadedUrls.length === 1 ? 'Fotografía subida con éxito' : `${uploadedUrls.length} fotografías subidas con éxito`,
      );
    }
  }

  protected eliminarFotoCancha(): void {
    this.nuevaCanchaFoto.set('');
    this.nuevaCanchaFotos.set([]);
    const input = this.photoInput()?.nativeElement;
    if (input) input.value = '';
    this.mostrarToast('Fotografías eliminadas');
  }

  protected seleccionarFotoPrincipal(url: string): void {
    this.nuevaCanchaFoto.set(url);
    this.mostrarToast('Foto principal actualizada');
  }

  protected removerFotoDeLista(index: number): void {
    this.nuevaCanchaFotos.update((list) => {
      const item = list[index];
      const updated = list.filter((_, i) => i !== index);
      if (this.nuevaCanchaFoto() === item) {
        this.nuevaCanchaFoto.set(updated[0] || '');
      }
      return updated;
    });
  }

  protected getCanchaTipoCorto(tipo?: string): string {
    if (!tipo) return 'Fútbol 7';
    return tipo.split('(')[0]?.trim() || tipo;
  }

  protected guardarNuevaCancha(): void {
    if (!this.duenoId()) return;
    if (this.sedesDelDueno().length === 0) {
      this.mostrarToast('Primero debes registrar una sede deportiva para poder crear canchas');
      return;
    }

    const nombre = this.nuevaCanchaNombre().trim();
    if (!nombre) {
      this.mostrarToast('Escribe el nombre de la cancha / losa');
      return;
    }

    const targetSedeId = this.nuevaCanchaSedeId() ?? this.sedeDelDueno()?.id ?? this.sedesDelDueno()[0]?.id;
    if (!targetSedeId || !this.sedesDelDueno().some((sede) => sede.id === targetSedeId)) {
      this.mostrarToast('Selecciona una sede deportiva válida');
      return;
    }

    const fotosList = this.nuevaCanchaFotos();
    const fotoPrincipal = this.nuevaCanchaFoto() || fotosList[0] || 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=800&auto=format&fit=crop';

    const payload = {
      sede_id: targetSedeId,
      nombre,
      tipo: this.nuevaCanchaFormato(),
      formato: this.nuevaCanchaFormato(),
      superficie: this.nuevaCanchaSuperficie(),
      cobertura: this.nuevaCanchaCobertura(),
      techada: this.nuevaCanchaCobertura() !== 'Al Aire Libre',
      equipamiento: this.nuevaCanchaEquipamiento(),
      precio_hora: Number(this.nuevaCanchaTarifa()) || 100,
      precio_hora_noche: Number(this.nuevaCanchaTarifaNoc()) || 120,
      hora_inicio_noche: this.nuevaCanchaHoraInicioNoche() || '18:00',
      foto_url: fotoPrincipal,
      fotos: fotosList.length > 0 ? fotosList : [fotoPrincipal],
      descripcion: this.nuevaCanchaDesc().trim(),
      usar_horario_sede: this.nuevaCanchaUsarHorarioSede(),
    };

    try {
      if (this.canchaEnEdicion()) {
        this.db.updateCancha(this.canchaEnEdicion()!.id, payload);
      } else {
        this.db.createCancha({ ...payload, activa: true, creado_por: this.duenoId() });
      }
    } catch {
      this.mostrarToast('No se pudo registrar la cancha. Revisa los datos y vuelve a intentar.');
      return;
    }

    this.mostrarToast('Cancha guardada y sincronizada correctamente.');
    this.venueSelected.emit(targetSedeId);
    this.db.setSedeOperativaId?.(targetSedeId);

    this.formularioCanchaAbierto.set(false);
    this.crearCanchaOpen.set(false);
    this.canchaEnEdicion.set(null);
  }

  /* ================= ACCIONES DE HORARIOS, DESCANSOS Y CIERRES ================= */
  protected abrirGestionCancha(cancha: AdminCourt, tab: 'horarios' | 'descansos' | 'cierres' = 'horarios'): void {
    this.canchaGestion.set(cancha);
    this.tabGestion.set(tab);
    this.horarioModo.set(cancha.usar_horario_sede !== false ? 'comun' : 'individual');

    if (cancha.horarios_semana && cancha.horarios_semana.length === 7) {
      this.horariosIndividualesSemana.set([...cancha.horarios_semana]);
    } else {
      this.horariosIndividualesSemana.set([
        { diaSemana: 1, apertura: '07:00', cierre: '23:00', activo: true },
        { diaSemana: 2, apertura: '07:00', cierre: '23:00', activo: true },
        { diaSemana: 3, apertura: '07:00', cierre: '23:00', activo: true },
        { diaSemana: 4, apertura: '07:00', cierre: '23:00', activo: true },
        { diaSemana: 5, apertura: '07:00', cierre: '23:00', activo: true },
        { diaSemana: 6, apertura: '07:00', cierre: '23:00', activo: true },
        { diaSemana: 0, apertura: '08:00', cierre: '22:00', activo: true },
      ]);
    }

    this.descansosCancha.set(Array.isArray(cancha.descansos_recurrentes) ? [...cancha.descansos_recurrentes] : []);
    this.mostrarFormularioNuevoCierre.set(false);
    this.panelGestionAbierto.set(true);
  }

  protected cerrarGestionCancha(): void {
    this.panelGestionAbierto.set(false);
    this.canchaGestion.set(null);
    this.reservaEnReprogramacion.set(null);
  }

  protected cambiarModoHorario(modo: 'comun' | 'individual'): void {
    this.horarioModo.set(modo);
  }

  protected actualizarHorarioIndividual(dia: number, campo: 'apertura' | 'cierre' | 'activo', valor: string | boolean): void {
    this.horariosIndividualesSemana.update((days) =>
      days.map((day) => (day.diaSemana === dia ? { ...day, [campo]: valor } : day)),
    );
  }

  protected guardarHorariosCancha(): void {
    const cancha = this.canchaGestion();
    if (!cancha) return;

    const usarSede = this.horarioModo() === 'comun';
    const payload = {
      usar_horario_sede: usarSede,
      horarios_semana: usarSede ? [] : this.horariosIndividualesSemana(),
      descansos_recurrentes: this.descansosCancha(),
    };

    this.db.updateCancha(cancha.id, payload);
    this.mostrarToast(
      usarSede
        ? `Configurado horario común de la sede para ${cancha.nombre}`
        : `Horario individual guardado para ${cancha.nombre}`,
    );
  }

  protected toggleDiaDescanso(dia: number): void {
    this.nuevoDescansoDias.update((dias) =>
      dias.includes(dia) ? dias.filter((d) => d !== dia) : [...dias, dia].sort(),
    );
  }

  protected agregarDescansoRecurrente(): void {
    const nombre = this.nuevoDescansoNombre().trim();
    if (!nombre) {
      this.errorDescanso.set('Escribe el motivo del descanso recurrente (ej. Mantenimiento matutino)');
      return;
    }
    if (this.nuevoDescansoDias().length === 0) {
      this.errorDescanso.set('Selecciona al menos un día de la semana');
      return;
    }

    const nuevo: DescansoRecurrente = {
      id: `desc-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      nombre,
      dias: [...this.nuevoDescansoDias()],
      hora_inicio: this.nuevoDescansoHoraInicio(),
      hora_fin: this.nuevoDescansoHoraFin(),
      activo: true,
    };

    this.descansosCancha.update((prev) => [...prev, nuevo]);
    this.nuevoDescansoNombre.set('');
    this.errorDescanso.set('');

    const cancha = this.canchaGestion();
    if (cancha) {
      this.db.updateCancha(cancha.id, { descansos_recurrentes: this.descansosCancha() });
    }
    this.mostrarToast('Descanso recurrente añadido');
  }

  protected eliminarDescanso(id: string): void {
    this.descansosCancha.update((list) => list.filter((d) => d.id !== id));
    const cancha = this.canchaGestion();
    if (cancha) {
      this.db.updateCancha(cancha.id, { descansos_recurrentes: this.descansosCancha() });
    }
    this.mostrarToast('Descanso recurrente eliminado');
  }

  protected toggleEstadoDescanso(id: string): void {
    this.descansosCancha.update((list) =>
      list.map((d) => (d.id === id ? { ...d, activo: !d.activo } : d)),
    );
    const cancha = this.canchaGestion();
    if (cancha) {
      this.db.updateCancha(cancha.id, { descansos_recurrentes: this.descansosCancha() });
    }
  }

  protected getDiasNombres(dias: number[]): string {
    const map: Record<number, string> = { 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb', 0: 'Dom' };
    return dias.map((d) => map[d] || String(d)).join(', ');
  }

  /* ================= CIERRES Y BLOQUEOS ================= */
  protected abrirFormularioCierre(): void {
    const hoy = new Date().toISOString().slice(0, 16);
    this.nuevoCierreFechaInicio.set(hoy);
    this.nuevoCierreFechaFin.set('');
    this.nuevoCierreMotivo.set('');
    this.errorCierre.set('');
    this.mostrarFormularioNuevoCierre.set(true);
  }

  protected cancelarFormularioCierre(): void {
    this.mostrarFormularioNuevoCierre.set(false);
    this.errorCierre.set('');
  }

  protected aplicarCierre(): void {
    const motivo = this.nuevoCierreMotivo().trim();
    if (!motivo) {
      this.errorCierre.set('Debes indicar el motivo del cierre (ej. Lluvia torrencial o mantenimiento de luminarias)');
      return;
    }

    const sedeId = this.sedeDelDueno()?.id;
    if (!sedeId) return;

    const cancha = this.canchaGestion();
    const alcance = this.nuevoCierreAlcance();
    const tipo = this.nuevoCierreTipo();

    const fInicio = this.nuevoCierreFechaInicio() || new Date().toISOString();
    const fFin = tipo === 'programado' ? this.nuevoCierreFechaFin() : null;

    if (tipo === 'programado' && (!fFin || fFin <= fInicio)) {
      this.errorCierre.set('En un cierre programado debes definir una fecha y hora fin posterior al inicio');
      return;
    }

    this.db.createBloqueo({
      cancha_id: alcance === 'cancha' && cancha ? cancha.id : null,
      sede_id: Number(sedeId),
      alcance,
      tipo,
      motivo,
      fecha_inicio: fInicio,
      fecha_fin: fFin,
    });

    this.mostrarFormularioNuevoCierre.set(false);
    this.mostrarToast(
      alcance === 'cancha'
        ? `Cierre registrado para la cancha "${cancha?.nombre}". Nuevas reservas bloqueadas.`
        : `Cierre registrado para toda la sede. Nuevas reservas bloqueadas.`,
    );
  }

  protected reabrirCierre(cierreId: number | string): void {
    this.db.reabrirBloqueo(cierreId);
    this.mostrarToast('Cierre levantado: la losa vuelve a estar disponible.');
  }

  /* ================= GESTIÓN DE RESERVAS AFECTADAS ================= */
  protected contactarClienteWhatsApp(reserva: ReservaAfectada): void {
    if (!reserva.telefono) {
      this.mostrarToast('No hay teléfono registrado para este cliente');
      return;
    }
    const cleanPhone = reserva.telefono.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('51') ? cleanPhone : `51${cleanPhone}`;
    const msg = encodeURIComponent(
      `Hola ${reserva.jugadorNombre}, te escribimos de ${this.sedeDelDueno()?.nombre || 'Canchero'} con respecto a tu reserva ${reserva.codigoPase} en ${reserva.canchaNombre} del ${reserva.fecha} (${reserva.horario}). Se ha programado un mantenimiento temporal en la cancha. Queremos coordinar contigo la reprogramación de tu horario sin costo adicional.`,
    );
    window.open(`https://wa.me/${phoneWithCountry}?text=${msg}`, '_blank');
  }

  protected abrirModalReprogramar(reserva: ReservaAfectada): void {
    this.reservaEnReprogramacion.set(reserva);
    this.reprogramarFecha.set(reserva.fecha);
    const [hInicio = '18:00', hFin = '19:00'] = reserva.horario.split(' - ');
    this.reprogramarHoraInicio.set(hInicio.trim());
    this.reprogramarHoraFin.set(hFin.trim());
  }

  protected cerrarModalReprogramar(): void {
    this.reservaEnReprogramacion.set(null);
  }

  protected confirmarReprogramacion(): void {
    const target = this.reservaEnReprogramacion();
    if (!target) return;

    const fecha = this.reprogramarFecha();
    const horario = `${this.reprogramarHoraInicio()} - ${this.reprogramarHoraFin()}`;

    if (!fecha) {
      this.mostrarToast('Selecciona una nueva fecha');
      return;
    }

    this.db.reprogramarReserva(target.reservaId, fecha, horario);
    this.mostrarToast(`Reserva ${target.codigoPase} reprogramada con éxito al ${fecha} (${horario}) sin alterar pagos.`);
    this.reservaEnReprogramacion.set(null);
  }

  protected cancelarReservaManual(reserva: ReservaAfectada): void {
    if (!confirm(`¿Deseas cancelar la reserva ${reserva.codigoPase} de ${reserva.jugadorNombre}? El saldo y estado se gestionarán en caja.`)) {
      return;
    }
    this.db.descartarReserva(reserva.reservaId);
    this.mostrarToast(`Reserva ${reserva.codigoPase} cancelada manualmente.`);
  }

  protected fmtPEN(n: number): string {
    return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}
