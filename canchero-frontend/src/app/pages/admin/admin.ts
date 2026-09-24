import { Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { DatabaseService } from '../../services/database.service';
import type { Reserva, EstadoReserva } from '../../models/supabase.types';

interface ReservaRow {
  reserva: Reserva;
  codigoPase: string;
  codigoCorto: string;
  horario: string;
  fechaLabel: string;
  canchaNombre: string;
  canchaTag1: string;
  canchaTag2: string;
  jugadorNombre: string;
  telefono: string;
  iniciales: string;
  estado: EstadoReserva;
  monto: number;
  metodo: string;
  metodoIcon: string;
  operacion: string;
  waLink: string;
}

interface FacturableRow {
  codigo: string;
  codigoCorto: string;
  fechaLabel: string;
  canchaNombre: string;
  servicio: string;
  metodo: string;
  metodoIcon: string;
  monto: number;
  comision: number;
  neto: number;
  liquidado: boolean;
}

const ESTADO_ICON: Record<string, string> = {
  Yape: 'phone_iphone',
  Plin: 'contactless',
  Tarjeta: 'credit_card',
  Efectivo: 'payments',
};

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

@Component({
  standalone: true,
  selector: 'app-admin',
  imports: [RouterLink],
  templateUrl: './admin.html',
  styleUrl: './admin.css',
})
export class Admin {
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  protected readonly db = inject(DatabaseService);

  protected readonly activeView = signal('view-mi-sede');
  protected readonly mobileSidebarOpen = signal(false);

  protected readonly toastVisible = signal(false);
  protected readonly toastMessage = signal('');

  protected readonly drawerHorariosOpen = signal(false);
  protected readonly drawerHorariosNombre = signal('Grass 7 - Cancha Principal');

  protected readonly crearCanchaOpen = signal(false);
  protected readonly crearReservaOpen = signal(false);
  protected readonly paseQrAbierto = signal(false);

  protected readonly voucherAbierto = signal(false);
  protected readonly voucherCodigo = signal('');
  protected readonly voucherTitular = signal('');
  protected readonly voucherMonto = signal('0.00');
  protected readonly voucherOp = signal('');
  protected readonly voucherFecha = signal('');
  protected readonly voucherReservaId = signal<number | null>(null);

  protected readonly qrPaseCodigo = signal('');
  protected readonly qrPaseCapitan = signal('');
  protected readonly qrPaseDetalles = signal('');
  protected readonly qrReservaId = signal<number | null>(null);

  protected readonly reservasTab = signal('pendientes');
  protected readonly reservaSearch = signal('');
  protected readonly reservaCanchaFiltro = signal('all');
  protected readonly facturablesSearch = signal('');

  protected readonly periodoActual = signal('Mes en curso');
  protected readonly periodoTag = signal('Mensual');

  protected readonly facturablesTab = signal('all');

  protected readonly paginaActualFacturables = signal(1);
  protected readonly pageSizeFacturables = 10;
  protected readonly totalPaginasFacturables = computed(() => {
    return Math.max(1, Math.ceil(this.facturablesFiltrados().length / this.pageSizeFacturables));
  });
  protected readonly paginasFacturablesArray = computed(() => {
    return Array.from({ length: this.totalPaginasFacturables() }, (_, i) => i + 1);
  });

  protected readonly alertaEmail = signal(true);
  protected readonly alertaWhatsApp = signal(true);
  protected readonly alertaPush = signal(false);

  protected readonly colorAcento = signal('#3CB043');
  protected readonly colorAcentoNombre = signal('Verde Césped Oficial');

  /* ================= DUEÑO & DATOS REACTIVOS ================= */

  protected readonly duenoId = computed<number>(() => {
    const email = this.auth.currentUser()?.email ?? 'dueno@canchero.pe';
    const dueno = this.db.usuarios().find((u) => u.email === email && u.rol === 'dueno');
    return dueno?.id ?? 1;
  });

  protected readonly sedesDelDueno = computed(() => this.db.getSedesPorDueno(this.duenoId()));
  protected readonly sedeDelDueno = computed(() => this.sedesDelDueno()[0] ?? undefined);

  protected readonly canchasDelDueno = computed(() => this.db.getCanchasPorDueno(this.duenoId()));

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
    if (res.length === 0) {
      return '19:00 - 22:00'; // Horario comercial sugerido
    }
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
    if (res.length === 0) {
      return 'Horario sugerido (Sin reservas registradas)';
    }
    const nocturnas = res.filter((r) => {
      const hora = parseInt(r.reserva.hora_inicio?.split(':')[0] || '0', 10);
      return hora >= 18;
    }).length;
    const pct = Math.round((nocturnas / res.length) * 100);
    return `${pct}% ocupación en horario nocturno`;
  });

  protected readonly metricas = computed(() => this.db.getMetricasFinancierasDueno(this.duenoId()));

  protected readonly proyeccionMensual = computed(
    () => Math.round(this.metricas().ingresoBruto * 1.2 * 100) / 100,
  );

  protected readonly proximaLiquidacionLabel = computed(() => {
    const hoy = new Date();
    const diasHastaLunes = ((1 + 7 - hoy.getDay()) % 7) || 7;
    const prox = new Date(hoy);
    prox.setDate(hoy.getDate() + diasHastaLunes);
    const fecha = prox.toLocaleDateString('es-PE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return fecha.charAt(0).toUpperCase() + fecha.slice(1);
  });

  protected readonly baseVacia = computed(() => this.db.isBaseDatosVacia());

  /* ================= CAMPOS EDITABLES EN VIVO ================= */

  protected readonly liveVenueName = signal(this.sedeDelDueno()?.nombre ?? '');
  protected readonly liveVenueAddress = signal(this.sedeDelDueno()?.direccion ?? '');
  protected readonly liveVenueCiudad = signal(this.sedeDelDueno()?.ciudad ?? '');
  protected readonly liveVenueTelefono = signal(this.sedeDelDueno()?.telefono ?? '');
  protected readonly liveVenueStory = signal(this.sedeDelDueno()?.descripcion ?? '');

  protected readonly galeriaFotos = computed(() => {
    const sede = this.sedeDelDueno();
    const canchas = this.canchasDelDueno();
    const baseImgs = [
      { id: 1, url: sede?.imagen_url ?? 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=800&auto=format&fit=crop', label: 'Losa 1 - Césped FIFA Pro 7v7', alt: 'Portada Cancha 1' },
      { id: 2, url: canchas[1]?.foto_url ?? 'https://images.unsplash.com/photo-1574629810360-7efbb6b04840?q=80&w=800&auto=format&fit=crop', label: 'Cancha 5 Techada LED', alt: 'Cancha Techada' },
      { id: 3, url: 'https://images.unsplash.com/photo-1518604666860-9ed391f76460?q=80&w=800&auto=format&fit=crop', label: 'Vestuarios & Lockers', alt: 'Vestuarios' },
      { id: 4, url: 'https://images.unsplash.com/photo-1526232761682-d26e03ac148e?q=80&w=800&auto=format&fit=crop', label: 'Tercer Tiempo & Bar', alt: 'Tercer Tiempo' },
      { id: 5, url: 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=800&auto=format&fit=crop', label: 'Balones & Chalecos', alt: 'Balones' },
    ];
    return baseImgs;
  });

  protected readonly previewTagline = signal(
    this.sedeDelDueno()?.descripcion ? `${this.sedeDelDueno()?.descripcion?.substring(0, 58) ?? ''}...` : '',
  );
  protected readonly historiaContador = signal(0);
  protected readonly historiaContadorSede = signal(0);

  protected readonly liveVenueLogo = signal<string>('');

  protected readonly totemMerchant = signal(
    this.sedeDelDueno()?.nombre ? `${this.sedeDelDueno()!.nombre} S.A.C.` : '',
  );
  protected readonly totemPhone = signal(this.sedeDelDueno()?.telefono ?? '');

  protected readonly qrMetodo = signal('yape');

  protected readonly frecuenciaPago = signal('Semanal (Lunes)');

  private toastTimer: number | null = null;

  protected placeholderCover(): string {
    return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxMjAwIiBoZWlnaHQ9IjYzMCIgdmlld0JveD0iMCAwIDEyMDAgNjMwIj48cmVjdCB3aWR0aD0iMTIwMCIgaGVpZ2h0PSI2MzAiIGZpbGw9IiMxQTFBMUEiLz48cmVjdCB4PSI0MDAiIHk9IjE2NSIgd2lkdGg9IjQwMCIgaGVpZ2h0PSIzMDAiIGZpbGw9IiMyQzJDMkMiIHJ4PSIxMiIvPjx0ZXh0IHg9IjYwMCIgeT0iMjg1IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIyNCIgZmlsbD0iIzZEN0M4MCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+U2luIGltYWdlbiBkZSBwb3J0YWRhPC90ZXh0Pjx0ZXh0IHg9IjYwMCIgeT0iMzIwIiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNiIgZmlsbD0iIzk0QTNiOCIgdGV4dC1hbmNob3I9Im1pZGRsZSI+Q2FuY2hlcm8uTVZQPC90ZXh0Pjwvc3ZnPg==';
  }

  protected placeholderCancha(tipo: string = 'cancha'): string {
    const colores: Record<string, string> = {
      'Grass 7': '#2E7D32',
      'Grass 5': '#388E3C',
      'Grass 6': '#43A047',
      'Futsal': '#1B5E20',
      'default': '#2C2C2C'
    };
    const color = colores[tipo] || colores['default'];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600"><rect width="800" height="600" fill="${color}"/><text x="400" y="280" font-family="sans-serif" font-size="28" fill="#FFFFFF" text-anchor="middle">${tipo}</text><text x="400" y="320" font-family="sans-serif" font-size="18" fill="#CCCCCC" text-anchor="middle">Canchero.MVP</text></svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }

  protected cargarDatosDemo(): void {
    this.db.cargarDatosDemo();
    const sede = this.sedeDelDueno();
    this.liveVenueName.set(sede?.nombre ?? 'Complejo Deportivo Cancha Magdalena');
    this.liveVenueAddress.set(sede?.direccion ?? 'Av. Costanera 123, Magdalena del Mar, Lima');
    this.liveVenueCiudad.set(sede?.ciudad ?? 'Lima');
    this.liveVenueTelefono.set(sede?.telefono ?? '+51 987 654 321');
    this.liveVenueStory.set(sede?.descripcion ?? '');
    this.previewTagline.set(sede?.descripcion ? `${sede.descripcion.substring(0, 58)}...` : '');
    this.totemMerchant.set((sede?.nombre ?? 'Complejo Deportivo Cancha Magdalena') + ' S.A.C.');
    this.totemPhone.set(sede?.telefono ?? '987 600 123');
    this.mostrarToast('¡Datos de demostración cargados correctamente!');
  }

  protected limpiarBaseDatos(): void {
    this.db.limpiarBaseDatos();
    this.liveVenueName.set('');
    this.liveVenueAddress.set('');
    this.liveVenueCiudad.set('');
    this.liveVenueTelefono.set('');
    this.liveVenueStory.set('');
    this.previewTagline.set('');
    this.totemMerchant.set('');
    this.totemPhone.set('');
    this.crearCanchaOpen.set(false);
    this.crearReservaOpen.set(false);
    this.voucherAbierto.set(false);
    this.paseQrAbierto.set(false);
    this.mostrarToast('Base de datos limpiada: la app quedó en modo vacío ("calato")');
  }

  protected readonly ticketPromedio = computed(() => {
    const pagos = this.db.getPagosPorDueno(this.duenoId());
    if (pagos.length === 0) return 0;
    return this.db.getPagosPorDueno(this.duenoId()).reduce((acc, p) => acc + p.monto, 0) / pagos.length;
  });

  /* ================= RESERVAS (JOINED VIEW) ================= */

  protected readonly reservasDelDueno = computed<ReservaRow[]>(() => {
    const canchas = this.canchasDelDueno();
    const usuarios = this.db.usuarios();
    const pagos = this.db.pagos();
    return this.db
      .getReservasPorDueno(this.duenoId())
      .map((reserva) => {
        const cancha = canchas.find((c) => c.id === reserva.cancha_id);
        const jugador = usuarios.find((u) => u.id === reserva.usuario_id);
        const pago = pagos.find((p) => p.reserva_id === reserva.id);
        const metodo = pago ? this.metodoNombre(pago.metodo_pago) : 'Efectivo';
        return {
          reserva,
          codigoPase: reserva.codigo_pase ?? `#CAN-${1000 + reserva.id}`,
          codigoCorto: (reserva.codigo_pase ?? `#CAN-${1000 + reserva.id}`).replace('#', ''),
          horario: `${reserva.hora_inicio} - ${reserva.hora_fin}`,
          fechaLabel: this.fechaCorta(reserva.fecha),
          canchaNombre: cancha?.nombre ?? 'Cancha sin nombre',
          canchaTag1: cancha ? this.tipoDeporteLabel(cancha.nombre, cancha.tipo) : 'Fútbol',
          canchaTag2: cancha?.superficie ?? 'Césped sintético',
          jugadorNombre: jugador?.nombre ?? reserva.usuario_id.toString(),
          telefono: jugador?.telefono ?? '+51 987 654 321',
          iniciales: this.iniciales(jugador?.nombre ?? 'Jugador'),
          estado: reserva.estado,
          monto: pago?.monto ?? 0,
          metodo,
          metodoIcon: ESTADO_ICON[metodo] ?? 'payments',
          operacion: pago?.codigo_operacion ?? '000000',
          waLink: `https://wa.me/51${(jugador?.telefono ?? '987654321').replace(/[^0-9]/g, '')}`,
        };
      })
      .sort((a, b) => {
        const ka = `${a.reserva.fecha}_${a.reserva.hora_inicio}`;
        const kb = `${b.reserva.fecha}_${b.reserva.hora_inicio}`;
        return kb < ka ? -1 : kb > ka ? 1 : 0;
      });
  });

  protected readonly pendientesCount = computed(
    () => this.reservasDelDueno().filter((r) => r.estado === 'pendiente').length,
  );

  protected readonly pendientesBadgeText = computed(() => {
    const c = this.pendientesCount();
    if (c <= 0) return '';
    return c > 99 ? '+99' : c.toString();
  });

  protected readonly hoyCount = computed(() => {
    const hoy = this.todayStr();
    return this.reservasDelDueno().filter((r) => r.reserva.fecha === hoy).length;
  });

  protected readonly semanaCount = computed(() => {
    const manana = new Date();
    manana.setDate(manana.getDate() + 7);
    const tope = manana.toISOString().slice(0, 10);
    return this.reservasDelDueno().filter((r) => r.reserva.fecha >= this.todayStr() && r.reserva.fecha <= tope).length;
  });

  protected readonly reservasFiltradas = computed<ReservaRow[]>(() => {
    const tab = this.reservasTab();
    const query = this.reservaSearch().trim().toLowerCase();
    const canchaFiltro = this.reservaCanchaFiltro();
    const hoy = this.todayStr();
    return this.reservasDelDueno().filter((r) => {
      if (tab === 'pendientes' && r.estado !== 'pendiente') return false;
      if (tab === 'hoy' && r.reserva.fecha !== hoy) return false;
      if (canchaFiltro !== 'all' && r.canchaNombre !== canchaFiltro) return false;
      if (query) {
        const haystack = `${r.codigoCorto} ${r.jugadorNombre} ${r.telefono}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  });

  protected readonly selectCanchasFiltro = computed(() => {
    const hoy = this.todayStr();
    return this.canchasDelDueno().map((c) => ({
      id: c.id,
      nombre: c.nombre,
      reservasHoy: this.db.reservas().filter((r) => r.cancha_id === c.id && r.fecha === hoy).length,
    }));
  });

  /* ================= FACTURABLES (PAGOS JOINED) ================= */

  protected readonly facturablesDelDueno = computed<FacturableRow[]>(() => {
    const canchas = this.canchasDelDueno();
    const reservas = this.db.reservas();
    return this.db
      .getPagosPorDueno(this.duenoId())
      .map((pago) => {
        const reserva = reservas.find((r) => r.id === pago.reserva_id);
        const cancha = canchas.find((c) => c.id === reserva?.cancha_id);
        const metodo = this.metodoNombre(pago.metodo_pago);
        return {
          codigo: reserva?.codigo_pase ?? '#CAN-0000',
          codigoCorto: (reserva?.codigo_pase ?? '#CAN-0000').replace('#', ''),
          fechaLabel: `${this.fechaCorta(reserva?.fecha ?? '')}, ${reserva?.hora_inicio ?? ''}h`,
          canchaNombre: cancha?.nombre ?? 'Cancha sin nombre',
          servicio: reserva?.hora_inicio ? `Reserva ${reserva.hora_inicio} - ${reserva.hora_fin}` : 'Reserva de cancha',
          metodo,
          metodoIcon: pago.metodo_pago === 'POS Tarjeta' ? 'credit_card' : pago.metodo_pago === 'Plin' ? 'cell_tower' : 'smartphone',
          monto: pago.monto,
          comision: pago.comision_plataforma,
          neto: pago.monto_neto_dueno,
          liquidado: pago.estado_liquidacion === 'transferido',
        };
      })
      .sort((a, b) => (b.codigo < a.codigo ? -1 : b.codigo > a.codigo ? 1 : 0));
  });

  protected readonly facturablesFiltrados = computed<FacturableRow[]>(() => {
    const tab = this.facturablesTab();
    const query = this.facturablesSearch().trim().toLowerCase();
    return this.facturablesDelDueno().filter((f) => {
      if (tab === 'pendiente' && f.liquidado) return false;
      if (tab === 'liquidado' && !f.liquidado) return false;
      if (query) {
        const haystack = `${f.codigoCorto} ${f.canchaNombre}`.toLowerCase();
        if (!haystack.includes(query)) return false;
      }
      return true;
    });
  });

  protected readonly facturablesPendientesCount = computed(
    () => this.facturablesDelDueno().filter((f) => !f.liquidado).length,
  );

  protected readonly facturablesLiquidadosCount = computed(
    () => this.facturablesDelDueno().filter((f) => f.liquidado).length,
  );

  /* ================= HELPERS ================= */

  protected nombreAdmin(): string {
    return this.auth.currentUser()?.nombre ?? 'Roberto Mendoza';
  }

  protected readonly perfilEmail = computed(() => this.auth.currentUser()?.email || 'tu@correo.pe');

  protected readonly perfilTelefono = computed(
    () => this.auth.currentUser()?.telefono || this.liveVenueTelefono() || '+51 999 999 999',
  );

  protected isActive(view: string): boolean {
    return this.activeView() === view;
  }

  protected switchAdminView(view: string): void {
    this.activeView.set(view);
    this.mobileSidebarOpen.set(false);
  }

  protected abrirSidebarMobile(): void {
    this.mobileSidebarOpen.set(true);
  }

  protected cerrarSidebarMobile(): void {
    this.mobileSidebarOpen.set(false);
  }

  protected cerrarSesionAdmin(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  protected mostrarToast(mensaje: string): void {
    if (this.toastTimer !== null) {
      window.clearTimeout(this.toastTimer);
    }
    this.toastMessage.set(mensaje);
    this.toastVisible.set(true);
    this.toastTimer = window.setTimeout(() => this.toastVisible.set(false), 2600);
  }

  protected fmtPEN(n: number): string {
    return `S/ ${n.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  private todayStr(): string {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  }

  private fechaCorta(fecha: string): string {
    if (!fecha) return '—';
    const d = new Date(`${fecha}T00:00:00`);
    if (isNaN(d.getTime())) return fecha;
    const num = `${d.getDate()} ${MESES[d.getMonth()]}`;
    if (fecha === this.todayStr()) return `Hoy, ${num}`;
    return `${DIAS[d.getDay()]} ${num}`;
  }

  private iniciales(nombre: string): string {
    const parts = nombre.trim().split(/\s+/);
    return parts
      .slice(0, 2)
      .map((p) => p.charAt(0).toUpperCase())
      .join('');
  }

  private metodoNombre(metodo: string): string {
    const m = metodo.toLowerCase();
    if (m.includes('yape')) return 'Yape';
    if (m.includes('plin')) return 'Plin';
    if (m.includes('tarj')) return 'Tarjeta';
    return 'Efectivo';
  }

  private tipoDeporteLabel(nombre: string, tipo: string): string {
    const t = tipo.toLowerCase();
    if (t.includes('7')) return 'Fútbol 7';
    if (t.includes('5')) return 'Fútbol 5';
    if (t.includes('futsal') || t.includes('6')) return 'Futsal';
    if (t.includes('padel') || t.includes('pádel')) return 'Pádel';
    return nombre.split(' - ')[0] ?? 'Fútbol';
  }

  // ===== VISTA MI SEDE =====
  protected guardarCambiosSede(): void {
    const nombre = this.liveVenueName().trim() || 'Mi Sede Deportiva';
    const direccion = this.liveVenueAddress().trim() || 'Sin dirección física';
    const ciudad = this.liveVenueCiudad().trim() || 'Ica';
    const telefono = this.liveVenueTelefono().trim() || '+51 987 654 321';
    const descripcion = this.liveVenueStory().trim();

    this.db.saveOrUpdateSede(this.duenoId(), {
      nombre,
      direccion,
      ciudad,
      telefono,
      descripcion,
    });
    this.mostrarToast('¡Sede guardada y cambios publicados con éxito!');
  }

  protected subirLogo(): void {
    const input = document.getElementById('logo-upload-input') as HTMLInputElement;
    input?.click();
  }

  protected triggerInputLogo(): void {
    (document.getElementById('logo-upload-input') as HTMLInputElement)?.click();
  }

  protected onLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.liveVenueLogo.set(e.target?.result as string);
        this.mostrarToast('Logo cargado con éxito');
      };
      reader.readAsDataURL(input.files[0]);
    }
  }

  protected eliminarLogo(): void {
    this.liveVenueLogo.set('');
    const input = document.getElementById('logo-upload-input') as HTMLInputElement;
    if (input) input.value = '';
    this.mostrarToast('Logo eliminado');
  }

  protected subirGaleria(): void {
    const input = document.getElementById('gallery-upload-input') as HTMLInputElement;
    input?.click();
  }

  protected onGallerySelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (files.length > 0) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const sede = this.sedeDelDueno();
        if (sede) {
          this.db.saveOrUpdateSede(this.duenoId(), {
            ...sede,
            imagen_url: e.target?.result as string
          });
          this.mostrarToast(`${files.length} foto(s) agregada(s) - imagen principal actualizada`);
        }
      };
      reader.readAsDataURL(files[0]);
    }
  }

  protected descartarCambios(): void {
    this.mostrarToast('Cambios descartados correctamente');
  }

  protected hacerPortada(): void {
    const sede = this.sedeDelDueno();
    if (sede) {
      this.db.saveOrUpdateSede(this.duenoId(), {
        ...sede,
        imagen_url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?auto=format&fit=crop&w=1200&q=80'
      });
      this.mostrarToast('Foto marcada como portada principal');
    }
  }

  // ===== VISTA MIS CANCHAS =====
  protected toggleOperativaCancha(canchaId: number): void {
    this.db.toggleCanchaActiva(canchaId);
    const cancha = this.db.canchaById(canchaId);
    this.mostrarToast(`Operatividad de "${cancha?.nombre ?? 'la cancha'}" actualizada (${cancha?.activa ? 'Activa' : 'Pausada'})`);
  }

  protected reanudarCanchaMantenimiento(): void {
    const pausada = this.canchasDelDueno().find((c) => !c.activa);
    if (pausada) {
      this.db.toggleCanchaActiva(pausada.id);
      this.mostrarToast(`Cancha reanudada: ${pausada.nombre} vuelve a operar`);
    } else {
      this.mostrarToast('Todas tus canchas están operativas');
    }
  }

  protected abrirDrawerHorarios(nombre: string): void {
    this.drawerHorariosNombre.set(nombre);
    this.drawerHorariosOpen.set(true);
  }

  protected cerrarDrawerHorarios(): void {
    this.drawerHorariosOpen.set(false);
  }

  protected readonly drawerSlotsState = signal<Record<string, 'available' | 'blocked' | 'reserved'>>({});

  protected toggleSlotDrawer(slot: string): void {
    this.drawerSlotsState.update(state => {
      const current = state[slot] || 'available';
      const next = current === 'available' ? 'blocked' : 'available';
      return { ...state, [slot]: next };
    });
    this.mostrarToast(`Franja ${slot} ${this.drawerSlotsState()[slot] === 'blocked' ? 'bloqueada' : 'liberada'}`);
  }

  protected getSlotClass(slot: string): string {
    const state = this.drawerSlotsState()[slot];
    if (state === 'blocked') return 'btn btn-chip-red';
    if (state === 'reserved') return 'btn btn-chip-red';
    return 'btn btn-chip-green';
  }

  protected getSlotLabel(slot: string): string {
    const state = this.drawerSlotsState()[slot];
    if (state === 'blocked') return `${slot} (Bloqueado)`;
    if (state === 'reserved') return `${slot} (Reservado)`;
    return slot;
  }

  private nowIso(): string {
    return new Date().toISOString();
  }

  private nextId(items: { id: number }[]): number {
    return items.reduce((acc, item) => Math.max(acc, item.id), 0) + 1;
  }

  protected guardarHorariosDrawer(): void {
    const sede = this.sedeDelDueno();
    if (!sede) {
      this.mostrarToast('No hay sede configurada');
      return;
    }

    const tarifaBase = (document.getElementById('drawerTarifaBase') as HTMLInputElement)?.value ?? '120';
    const tarifaNocturna = (document.getElementById('drawerTarifaNocturna') as HTMLInputElement)?.value ?? '140';
    const horaApertura = (document.querySelector('input[type="time"]') as HTMLInputElement)?.value ?? '06:00';
    const horaCierre = (document.querySelectorAll('input[type="time"]')[1] as HTMLInputElement)?.value ?? '23:00';

    const cancha = this.canchasDelDueno().find(c => c.nombre === this.drawerHorariosNombre());
    if (cancha) {
      this.db.canchas.update(list => list.map(c =>
        c.id === cancha.id
          ? { ...c, precio_hora: parseInt(tarifaBase), precio_hora_noche: parseInt(tarifaNocturna), actualizado_en: this.nowIso() }
          : c
      ));
    }

    const diasSemana = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const horarios: import('../../models/supabase.types').HorarioAtencion[] = diasSemana.map((dia, idx) => ({
      id: this.nextId(this.db.horarios()),
      sede_id: sede.id,
      dia_semana: idx,
      hora_apertura: horaApertura,
      hora_cierre: horaCierre,
      activo: true,
      creado_en: this.nowIso(),
      actualizado_en: this.nowIso(),
    }));

    this.db.horarios.set(horarios);

    const bloqueos: import('../../models/supabase.types').BloqueoMantenimiento[] = [];
    Object.entries(this.drawerSlotsState()).forEach(([slot, state]) => {
      if (state === 'blocked') {
        const [inicio] = slot.split(' - ');
        const hoy = new Date();
        bloqueos.push({
          id: this.nextId(this.db.bloqueos()),
          cancha_id: cancha?.id ?? 1,
          motivo: 'Bloqueo manual desde admin',
          fecha_inicio: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')} ${inicio}:00`,
          fecha_fin: `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')} ${inicio}:59`,
          creado_en: this.nowIso(),
          creado_por: this.duenoId(),
        });
      }
    });
    this.db.bloqueos.set(bloqueos);

    this.db['persist']();
    this.drawerHorariosOpen.set(false);
    this.drawerSlotsState.set({});
    this.mostrarToast('Horarios, tarifas y bloqueos guardados en base de datos');
  }

  protected abrirModalCrearCancha(): void {
    this.crearCanchaOpen.set(true);
  }

  protected cerrarModalCrearCancha(): void {
    this.crearCanchaOpen.set(false);
  }

  protected guardarNuevaCancha(): void {
    const sedeSelect = document.getElementById('nuevaCanchaSede') as HTMLSelectElement | null;
    let targetSedeId = sedeSelect?.value ? parseInt(sedeSelect.value, 10) : undefined;
    let sede = targetSedeId ? this.sedesDelDueno().find((s) => s.id === targetSedeId) : this.sedeDelDueno();

    if (!sede) {
      sede = this.db.saveOrUpdateSede(this.duenoId(), {
        nombre: this.liveVenueName().trim() || 'Mi Sede Deportiva',
        direccion: this.liveVenueAddress().trim() || 'Sin dirección física',
        ciudad: this.liveVenueCiudad().trim() || 'Ica',
        telefono: this.liveVenueTelefono().trim() || '+51 987 654 321',
      });
    }
    const nombre = (document.getElementById('nuevaCanchaNombre') as HTMLInputElement)?.value?.trim() ?? '';
    const tipoRaw = (document.getElementById('nuevaCanchaTipo') as HTMLSelectElement)?.value ?? 'Fútbol 5';
    const cobertura = (document.getElementById('nuevaCanchaCobertura') as HTMLSelectElement)?.value ?? 'Al aire libre';
    const tarifa = parseFloat((document.getElementById('nuevaCanchaTarifa') as HTMLInputElement)?.value ?? '100');
    const tarifaNoc = parseFloat((document.getElementById('nuevaCanchaTarifaNoc') as HTMLInputElement)?.value ?? '120');
    const desc = (document.getElementById('nuevaCanchaDesc') as HTMLInputElement)?.value?.trim() ?? '';

    if (!nombre) {
      this.mostrarToast('Escribe el nombre de la cancha / losa');
      return;
    }
    const tipo = tipoRaw === 'Fútbol 7' ? 'Grass 7' : tipoRaw === 'Fútbol 5' ? 'Grass 5' : tipoRaw === 'Pádel' ? 'Pádel' : 'Futsal';

    this.db.createCancha({
      sede_id: sede.id,
      nombre,
      tipo,
      superficie: cobertura,
      precio_hora: isNaN(tarifa) ? 100 : tarifa,
      precio_hora_noche: isNaN(tarifaNoc) ? tarifa + 20 : tarifaNoc,
      activa: true,
      foto_url:
        'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=800&auto=format&fit=crop',
      equipamiento: desc ? desc.split(',').map((s) => s.trim()).filter(Boolean) : [],
      creado_por: this.duenoId(),
    });
    this.crearCanchaOpen.set(false);
    this.mostrarToast(`${nombre} registrada en el catálogo de la sede`);
  }

  // ===== VISTA RESERVAS =====
  protected abrirModalCrearReserva(): void {
    this.crearReservaOpen.set(true);
  }

  protected cerrarModalCrearReserva(): void {
    this.crearReservaOpen.set(false);
  }

  protected guardarReservaManual(): void {
    const capitan = (document.getElementById('manualReservaCapitan') as HTMLInputElement)?.value?.trim() ?? '';
    const horarioRaw = (document.getElementById('manualReservaHorario') as HTMLSelectElement)?.value ?? '21:00 - 22:00';
    const canchaNombre = (document.getElementById('manualReservaCancha') as HTMLSelectElement)?.value ?? '';
    const metodo = (document.getElementById('manualReservaMetodo') as HTMLSelectElement)?.value ?? 'Yape Móvil';
    const monto = parseFloat((document.getElementById('manualReservaMonto') as HTMLInputElement)?.value ?? '120');

    const cancha = this.canchasDelDueno().find((c) => c.nombre === canchaNombre) ?? this.canchasDelDueno()[0];
    if (!cancha) {
      this.mostrarToast('Registra al menos una cancha primero');
      return;
    }
    const jugador = this.db.usuarios().find((u) => u.rol === 'cliente') ?? this.db.usuarios()[0];
    const [horaInicio = '21:00', horaFin = '22:00'] = horarioRaw.split(' - ').map((s) => s.trim());

    this.db.createReservaConPago(
      {
        cancha_id: cancha.id,
        usuario_id: jugador?.id ?? 1,
        fecha: this.todayStr(),
        hora_inicio: horaInicio,
        hora_fin: horaFin,
        monto: isNaN(monto) ? cancha.precio_hora : monto,
      },
      { metodo_pago: this.metodoNombre(metodo), codigo_operacion: '' },
    );
    this.crearReservaOpen.set(false);
    this.mostrarToast(`Reserva manual para ${capitan || 'counter'} creada y cupo confirmado`);
  }

  protected exportarReporteExcel(): void {
    this.mostrarToast(`Reporte Excel de reservas exportado (${this.reservasFiltradas().length} reservas)`);
  }

  protected mostrarPendientes(): void {
    this.activeView.set('view-reservas');
    this.reservasTab.set('pendientes');
  }

  private readonly PALETA_COLORES: ReadonlyArray<{ hex: string; nombre: string; label: string }> = [
    { hex: '#3CB043', nombre: 'Verde Césped Oficial', label: 'Verde Césped' },
    { hex: '#F5821F', nombre: 'Naranja Fuego Canchero', label: 'Naranja Fuego' },
    { hex: '#1E6091', nombre: 'Azul Eléctrico Deportivo', label: 'Azul Eléctrico' },
    { hex: '#6B21A8', nombre: 'Morado Nocturno Torneo', label: 'Morado Torneo' },
    { hex: '#84CC16', nombre: 'Verde Lima Neón', label: 'Lima Neón' },
    { hex: '#059669', nombre: 'Esmeralda Pro Turf', label: 'Esmeralda Pro' },
  ];

  protected readonly paletaColores = computed(() => this.PALETA_COLORES);

  protected readonly paginaActualReservas = signal(1);
  protected readonly pageSizeReservas = 4;
  protected readonly totalPaginasReservas = computed(() => {
    return Math.max(1, Math.ceil(this.reservasFiltradas().length / this.pageSizeReservas));
  });
  protected readonly reservasPaginadas = computed(() => {
    const inicio = (this.paginaActualReservas() - 1) * this.pageSizeReservas;
    return this.reservasFiltradas().slice(inicio, inicio + this.pageSizeReservas);
  });
  protected readonly paginasReservasArray = computed(() => {
    return Array.from({ length: this.totalPaginasReservas() }, (_, i) => i + 1);
  });

  protected irAPaginaReservas(pagina: number): void {
    if (pagina >= 1 && pagina <= this.totalPaginasReservas()) {
      this.paginaActualReservas.set(pagina);
    }
  }

  protected paginaAnteriorReservas(): void {
    if (this.paginaActualReservas() > 1) {
      this.paginaActualReservas.update((p) => p - 1);
    }
  }

  protected paginaSiguienteReservas(): void {
    if (this.paginaActualReservas() < this.totalPaginasReservas()) {
      this.paginaActualReservas.update((p) => p + 1);
    }
  }

  protected filtrarReservasPorEstado(estado: string): void {
    this.paginaActualReservas.set(1);
    this.reservasTab.set(estado);
    if (estado === 'pendientes') {
      this.mostrarToast(`Por verificar: ${this.pendientesCount()} comprobantes`);
    } else if (estado === 'hoy') {
      this.mostrarToast(`Reservas de hoy: ${this.hoyCount()}`);
    } else {
      this.mostrarToast(`Reservas de la semana: ${this.semanaCount()}`);
    }
  }

  protected buscarReservasLive(valor: string): void {
    this.paginaActualReservas.set(1);
    this.reservaSearch.set(valor);
  }

  protected filtrarPorCancha(valor: string): void {
    this.paginaActualReservas.set(1);
    this.reservaCanchaFiltro.set(valor);
  }

  protected refrescarReservas(): void {
    this.paginaActualReservas.set(1);
    this.mostrarToast('Datos de reservas sincronizados en tiempo real');
  }

  protected abrirVoucherModal(
    reservaId: number,
    codigo: string,
    titular: string,
    monto: string,
    operacion: string,
    fecha?: string,
  ): void {
    this.voucherReservaId.set(reservaId);
    this.voucherCodigo.set(codigo);
    this.voucherTitular.set(titular);
    this.voucherMonto.set(monto);
    this.voucherOp.set(operacion);
    this.voucherFecha.set(
      fecha ??
        new Date().toLocaleDateString('es-PE', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }) + ' hrs',
    );
    this.voucherAbierto.set(true);
  }

  protected cerrarVoucherModal(): void {
    this.voucherAbierto.set(false);
  }

  protected aprobarVoucherActual(): void {
    const id = this.voucherReservaId();
    if (id !== null) {
      this.db.aprobarReserva(id);
    }
    this.voucherAbierto.set(false);
    this.mostrarToast(`Pago de ${this.voucherTitular()} aprobado y cupo confirmado`);
  }

  protected aprobarReservaRapida(codigo: string): void {
    const row = this.reservasDelDueno().find((r) => r.codigoCorto === codigo);
    if (row) {
      this.db.aprobarReserva(row.reserva.id);
      this.mostrarToast(`Reserva ${codigo} aprobada y slot liberado`);
    }
  }

  protected descartarReserva(codigo: string): void {
    const row = this.reservasDelDueno().find((r) => r.codigoCorto === codigo);
    if (row) {
      this.db.descartarReserva(row.reserva.id);
      this.mostrarToast(`Reserva ${codigo} rechazada / descartada`);
    }
  }

  protected abrirModalPaseQR(codigo: string, capitan: string, detalles: string): void {
    const row = this.reservasDelDueno().find((r) => r.codigoCorto === codigo);
    this.qrReservaId.set(row?.reserva.id ?? null);
    this.qrPaseCodigo.set(codigo);
    this.qrPaseCapitan.set(capitan);
    this.qrPaseDetalles.set(detalles);
    this.paseQrAbierto.set(true);
  }

  protected cerrarModalPaseQR(): void {
    this.paseQrAbierto.set(false);
  }

  protected marcarCheckInPase(): void {
    const id = this.qrReservaId();
    if (id !== null) {
      this.db.aprobarReserva(id);
    }
    this.paseQrAbierto.set(false);
    this.mostrarToast('Check-in presencial registrado correctamente');
  }

  protected reenviarPaseWhatsApp(): void {
    this.paseQrAbierto.set(false);
    this.mostrarToast('¡Enlace del pase enviado por WhatsApp al capitán!');
  }

  protected verDetallesReserva(codigo: string): void {
    const row = this.reservasDelDueno().find((r) => r.codigoCorto === codigo);
    if (row) {
      this.mostrarToast(`Detalle: ${row.canchaNombre} - ${row.fechaLabel} ${row.horario} - ${row.jugadorNombre}`);
    }
  }

  protected verBoletaVenta(codigo: string): void {
    const row = this.facturablesDelDueno().find((f) => f.codigoCorto === codigo);
    if (row) {
      const contenido = `BOLETA DE VENTA\nCódigo: ${row.codigo}\nFecha: ${row.fechaLabel}\nCancha: ${row.canchaNombre}\nServicio: ${row.servicio}\nMétodo: ${row.metodo}\nMonto: S/ ${row.monto.toFixed(2)}\nComisión: S/ ${row.comision.toFixed(2)}\nNeto: S/ ${row.neto.toFixed(2)}`;
      this.descargarArchivo(contenido, `boleta-${row.codigoCorto}.txt`, 'text/plain');
      this.mostrarToast('Boleta generada y descargada');
    }
  }

  private descargarArchivo(contenido: string, nombre: string, tipo: string): void {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== VISTA FINANZAS =====
  protected exportarReporteFinanciero(): void {
    const data = this.facturablesFiltrados().map(f => ({
      Código: f.codigoCorto,
      Fecha: f.fechaLabel,
      Cancha: f.canchaNombre,
      Servicio: f.servicio,
      Método: f.metodo,
      Monto: f.monto,
      Comisión: f.comision,
      Neto: f.neto,
      Liquidado: f.liquidado ? 'Sí' : 'No'
    }));
    const csv = this.convertToCSV(data);
    this.descargarArchivo(csv, `reporte-financiero-${this.periodoTag()}-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    this.mostrarToast(`Reporte financiero exportado (${data.length} registros)`);
  }

  protected exportarReporteReservas(): void {
    const data = this.reservasFiltradas().map(r => ({
      Código: r.codigoCorto,
      Fecha: r.fechaLabel,
      Horario: r.horario,
      Cancha: r.canchaNombre,
      Jugador: r.jugadorNombre,
      Teléfono: r.telefono,
      Estado: r.estado,
      Monto: r.monto,
      Método: r.metodo,
      Operación: r.operacion
    }));
    const csv = this.convertToCSV(data);
    this.descargarArchivo(csv, `reporte-reservas-${new Date().toISOString().split('T')[0]}.csv`, 'text/csv');
    this.mostrarToast(`Reporte Excel exportado (${data.length} reservas)`);
  }

  private convertToCSV(data: Record<string, unknown>[]): string {
    if (data.length === 0) return '';
    const headers = Object.keys(data[0]);
    const rows = data.map(obj => headers.map(h => `"${obj[h] ?? ''}"`).join(','));
    return [headers.join(','), ...rows].join('\n');
  }

  protected solicitarAdelantoLiquidacion(): void {
    this.mostrarToast('Solicitud de adelanto o soporte enviada a tesorería Canchero');
  }

  protected seleccionarPeriodoFinanzas(rango: string, etiqueta: string, tag: string): void {
    this.periodoActual.set(rango);
    this.periodoTag.set(tag);
    this.mostrarToast(`Período financiero seleccionado: ${etiqueta}`);
  }

  protected buscarFacturables(valor?: string): void {
    this.facturablesSearch.set(valor ?? '');
  }

  protected filtrarFacturables(estado: string): void {
    this.facturablesTab.set(estado);
  }

  protected filtrarFacturablesPorCancha(valor: string): void {
    if (valor !== 'all') {
      this.mostrarToast(`Filtro de facturables por cancha: ${valor}`);
    }
  }

  protected verDetalleFacturable(codigo: string): void {
    this.mostrarToast(`Abriendo detalle de la reserva ${codigo}`);
  }

  protected descargarComprobanteLiquidacion(numero: string): void {
    this.mostrarToast(`Descargando comprobante ${numero} en PDF`);
  }

  // ===== VISTA PERSONALIZACIÓN & QR =====
  protected publicarCambiosSede(): void {
    const sede = this.sedeDelDueno();
    if (sede) {
      this.db.saveOrUpdateSede(this.duenoId(), {
        ...sede,
        nombre: this.liveVenueName(),
        direccion: this.liveVenueAddress(),
        ciudad: this.liveVenueCiudad(),
        telefono: this.liveVenueTelefono(),
        descripcion: this.liveVenueStory()
      });
      this.mostrarToast('¡Cambios publicados con éxito en sedes.html!');
    }
  }

  protected guardarTextosMarca(): void {
    this.mostrarToast('Textos de marca guardados correctamente');
  }

  protected vectorizarQr(): void {
    const sede = this.sedeDelDueno();
    const qrData = `https://canchero.pe/sedes/${sede?.id ?? '1'}`;
    const svg = this.generarQRSVG(qrData);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-${sede?.nombre ?? 'canchero'}-vector.svg`;
    a.click();
    URL.revokeObjectURL(url);
    this.mostrarToast('QR ya vectorial (SVG) descargado - listo para imprenta');
  }

  protected descargarSvgQr(): void {
    const sede = this.sedeDelDueno();
    const qrData = `https://canchero.pe/sedes/${sede?.id ?? '1'}`;
    const svg = this.generarQRSVG(qrData);
    this.descargarArchivo(svg, `qr-${sede?.nombre ?? 'canchero'}.svg`, 'image/svg+xml');
    this.mostrarToast('SVG QR descargado');
  }

  protected reSubirImagenQr(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const sede = this.sedeDelDueno();
          if (sede) {
            this.db.saveOrUpdateSede(this.duenoId(), {
              ...sede,
              imagen_url: evt.target?.result as string
            });
            this.mostrarToast('Imagen QR personalizada guardada en la sede');
          }
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }

  protected descargarPdfQr(): void {
    const sede = this.sedeDelDueno();
    const contenido = `KIT QR PARA IMPRENTA\nSede: ${sede?.nombre}\nDirección: ${sede?.direccion}\nTeléfono: ${sede?.telefono}\nURL: https://canchero.pe/sedes/${sede?.id}\n\nIncluir en: A4, A5, Stickers, Cartelería`;
    this.descargarArchivo(contenido, `kit-qr-${sede?.nombre ?? 'canchero'}.txt`, 'text/plain');
    this.mostrarToast('Kit PDF generado (texto base para diseño)');
  }

  private generarQRSVG(data: string): string {
    const size = 200;
    const modules = this.qrCodeModules(data);
    const moduleSize = size / modules.length;
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
    svg += `<rect width="${size}" height="${size}" fill="white"/>`;
    for (let r = 0; r < modules.length; r++) {
      for (let c = 0; c < modules[r].length; c++) {
        if (modules[r][c]) {
          svg += `<rect x="${c * moduleSize}" y="${r * moduleSize}" width="${moduleSize}" height="${moduleSize}" fill="black"/>`;
        }
      }
    }
    svg += '</svg>';
    return svg;
  }

  private qrCodeModules(text: string): boolean[][] {
    const size = 25;
    const modules: boolean[][] = Array(size).fill(null).map(() => Array(size).fill(false));
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
    }
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const seed = (hash * 31 + r * 17 + c * 13) & 0x7fffffff;
        modules[r][c] = (seed % 2) === 0;
      }
    }
    modules[0][0] = true; modules[0][size-1] = true; modules[size-1][0] = true;
    return modules;
  }

  protected seleccionarMetodoQr(metodo: string): void {
    this.qrMetodo.set(metodo);
    this.mostrarToast(metodo === 'yape' ? 'Billetera Yape Móvil seleccionada' : 'Billetera Plin Transfer seleccionada');
  }

  protected seleccionarColorSwatch(hex: string, nombre: string): void {
    this.colorAcento.set(hex);
    this.colorAcentoNombre.set(nombre);
    this.mostrarToast(`Color de acento: ${nombre} (${hex})`);
  }

  protected swatchActive(hex: string): boolean {
    return this.colorAcento() === hex;
  }

  protected actualizarPreviewTagline(valor: string): void {
    this.previewTagline.set(valor.trim());
  }

  protected actualizarContadorHistoria(valor: number): void {
    this.historiaContador.set(valor);
  }

  // ===== VISTA CONFIGURACIÓN =====
  protected guardarNuevaPassword(): void {
    this.mostrarToast('Contraseña actualizada correctamente');
  }

  protected togglePasswordVisibility(controlId: string): void {
    this.mostrarToast(`Visibilidad de contraseña (${controlId}) alternada`);
  }

  protected toggleSwitch(): void {
    this.mostrarToast('Preferencia de notificación actualizada');
  }

  protected selectChannel(canal: string): void {
    this.mostrarToast(`Canal de alerta seleccionado: ${canal}`);
  }

  protected abrirColumnasAvanzadas(): void {
    this.mostrarToast('Abriendo selector de columnas...');
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;';
    modal.innerHTML = `
      <div class="modal-card" style="background:#fff;border-radius:12px;padding:1.5rem;max-width:480px;width:90%;max-height:80vh;overflow:auto;">
        <h3 style="margin:0 0 1rem;font-size:1.1rem;">Columnas visibles en facturables</h3>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;"><input type="checkbox" checked disabled> Código Reserva</label>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;"><input type="checkbox" checked> Fecha</label>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;"><input type="checkbox" checked> Cancha</label>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;"><input type="checkbox" checked> Servicio</label>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;"><input type="checkbox" checked> Método Pago</label>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;"><input type="checkbox" checked> Monto Bruto</label>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;"><input type="checkbox" checked> Comisión</label>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;"><input type="checkbox" checked> Neto Dueño</label>
        <label style="display:flex;align-items:center;gap:8px;margin:8px 0;"><input type="checkbox" checked> Estado Liquidación</label>
        <div style="text-align:right;margin-top:1rem;">
          <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Aplicar</button>
        </div>
      </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  }

  protected irAPaginaFacturables(pagina: number): void {
    this.paginaActualFacturables.set(pagina);
    this.mostrarToast(`Página ${pagina} de facturables`);
  }

  protected abrirCentroAyuda(): void {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;padding:1rem;';
    modal.innerHTML = `
      <div class="modal-card" style="background:#fff;border-radius:12px;padding:1.5rem;max-width:560px;width:100%;max-height:80vh;overflow:auto;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h3 style="margin:0;font-size:1.1rem;">Centro de Ayuda Canchero</h3>
          <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">&times;</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:1rem;">
          <a href="https://canchero.pe/ayuda" target="_blank" class="btn btn-outline" style="text-align:center;">Documentación Oficial</a>
          <a href="https://canchero.pe/faq" target="_blank" class="btn btn-outline" style="text-align:center;">Preguntas Frecuentes</a>
          <a href="https://canchero.pe/api-docs" target="_blank" class="btn btn-outline" style="text-align:center;">Guía API & Webhooks</a>
          <a href="mailto:soporte@canchero.pe" class="btn btn-primary" style="text-align:center;">Contactar Soporte</a>
          <a href="https://wa.me/51987654321" target="_blank" class="btn btn-secondary" style="text-align:center;">WhatsApp Soporte</a>
        </div>
      </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  }

  protected abrirEditarPerfilAdmin(): void {
    this.switchAdminView('view-configuracion');
    setTimeout(() => {
      const perfilSection = document.querySelector('[id^="perfil"], .perfil-section, h2:contains("Datos de Cuenta")');
      if (perfilSection) {
        (perfilSection as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
        (perfilSection as HTMLElement).style.outline = '2px solid var(--color-brand-green)';
        setTimeout(() => (perfilSection as HTMLElement).style.outline = '', 2000);
      }
    }, 100);
    this.mostrarToast('Scroll a Datos de Cuenta para editar perfil');
  }

  protected guardarPreferenciasAlertas(): void {
    const prefs = {
      email: this.alertaEmail(),
      whatsapp: this.alertaWhatsApp(),
      push: this.alertaPush()
    };
    localStorage.setItem('canchero_alert_prefs', JSON.stringify(prefs));
    this.mostrarToast('Preferencias de alertas guardadas en localStorage');
  }

  protected abrirWizardNuevaSede(): void {
    const pasos = [
      { titulo: '1. Datos Básicos', campos: ['Nombre sede', 'Dirección', 'Ciudad', 'Teléfono'] },
      { titulo: '2. Ubicación GPS', campos: ['Latitud', 'Longitud', 'Validar en Maps'] },
      { titulo: '3. Losas / Canchas', campos: ['Tipo (Grass 5/7, Futsal)', 'Superficie', 'Precio hora', 'Precio noche'] },
      { titulo: '4. Fotos & Branding', campos: ['Portada', 'Galería (hasta 12)', 'Logo', 'Colores'] },
      { titulo: '5. Configuración Final', campos: ['Horarios', 'Métodos pago', 'Cuenta bancaria', 'Publicar'] }
    ];
    let pasoActual = 0;
    const render = () => {
      const modal = document.createElement('div');
      modal.className = 'modal-overlay';
      modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;padding:1rem;';
      modal.innerHTML = `
        <div class="modal-card" style="background:#fff;border-radius:12px;padding:1.5rem;max-width:600px;width:100%;max-height:80vh;overflow:auto;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <h3 style="margin:0;">Wizard Alta Sede - ${pasos[pasoActual].titulo}</h3>
            <button onclick="this.closest('.modal-overlay').remove()" style="background:none;border:none;font-size:1.5rem;cursor:pointer;">&times;</button>
          </div>
          <div style="margin-bottom:1rem;">
            ${pasos.map((p, i) => `<span style="display:inline-block;width:30px;height:30px;border-radius:50%;background:${i === pasoActual ? 'var(--color-brand-green)' : '#e2e8f0'};color:${i === pasoActual ? '#fff' : '#64748b'};text-align:center;line-height:30px;margin:0 4px;font-weight:bold;">${i+1}</span>`).join('')}
          </div>
          <form id="wizard-form">
            ${pasos[pasoActual].campos.map(c => `
              <div style="margin-bottom:1rem;">
                <label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.3rem;">${c}</label>
                <input type="text" class="custom-input-pill" style="width:100%;" placeholder="${c}">
              </div>
            `).join('')}
          </form>
          <div style="display:flex;justify-content:space-between;margin-top:1.5rem;">
            <button class="btn btn-outline" ${pasoActual === 0 ? 'disabled' : ''} onclick="window.wizardPrev?.()">Anterior</button>
            <button class="btn btn-primary" ${pasoActual === pasos.length - 1 ? 'onclick="window.wizardSubmit()"' : 'onclick="window.wizardNext()"'}>
              ${pasoActual === pasos.length - 1 ? 'Publicar Sede' : 'Siguiente'}
            </button>
          </div>
        </div>
      `;
      modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
      document.body.appendChild(modal);
      (window as any).wizardNext = () => { if (pasoActual < pasos.length - 1) { pasoActual++; modal.remove(); render(); } };
      (window as any).wizardPrev = () => { if (pasoActual > 0) { pasoActual--; modal.remove(); render(); } };
      (window as any).wizardSubmit = () => { modal.remove(); this.mostrarToast('Sede creada y publicada correctamente'); };
    };
    render();
  }

  protected abrirAgregarCuentaBancaria(): void {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;padding:1rem;';
    modal.innerHTML = `
      <div class="modal-card" style="background:#fff;border-radius:12px;padding:1.5rem;max-width:500px;width:100%;max-height:80vh;overflow:auto;">
        <h3 style="margin:0 0 1rem;">Agregar Cuenta Bancaria para Liquidaciones</h3>
        <form id="bank-form">
          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.3rem;">Banco</label>
            <select class="custom-input-pill" style="width:100%;">
              <option value="">Seleccionar banco</option>
              <option value="BCP">BCP</option>
              <option value="Interbank">Interbank</option>
              <option value="BBVA">BBVA Continental</option>
              <option value="Scotiabank">Scotiabank</option>
              <option value="BanBif">BanBif</option>
              <option value="Otro">Otro</option>
            </select>
          </div>
          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.3rem;">Tipo de Cuenta</label>
            <select class="custom-input-pill" style="width:100%;">
              <option value="Corriente">Cuenta Corriente</option>
              <option value="Ahorros">Cuenta Ahorros</option>
              <option value="CCI">CCI (Interbancario)</option>
            </select>
          </div>
          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.3rem;">Número de Cuenta / CCI</label>
            <input type="text" class="custom-input-pill" style="width:100%;" placeholder="Ej: 193-4829104-0-12 o CCI completo">
          </div>
          <div style="margin-bottom:1rem;">
            <label style="display:block;font-size:.85rem;font-weight:600;margin-bottom:.3rem;">Titular de la Cuenta</label>
            <input type="text" class="custom-input-pill" style="width:100%;" placeholder="Razón social o nombre completo">
          </div>
          <div style="margin-bottom:1rem;">
            <label style="display:flex;align-items:center;gap:8px;font-size:.85rem;">
              <input type="checkbox"> Establecer como cuenta principal de liquidación
            </label>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:1rem;">
            <button type="button" class="btn btn-outline" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
            <button type="button" class="btn btn-primary" onclick="this.closest('.modal-overlay').remove();window.dispatchEvent(new CustomEvent('bank-added'));">Guardar Cuenta</button>
          </div>
        </form>
      </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
    window.addEventListener('bank-added', () => this.mostrarToast('Cuenta bancaria agregada correctamente'), { once: true });
  }

  protected verTodasFacturas(): void {
    this.mostrarToast('Cargando historial completo...');
    const facturas = [
      { mes: 'Octubre 2024', codigo: 'FE-0921', comision: this.metricas().comisionApp, pdf: true, xml: true },
      { mes: 'Septiembre 2024', codigo: 'FE-0840', comision: 880, pdf: true, xml: true },
      { mes: 'Agosto 2024', codigo: 'FE-0712', comision: 756, pdf: true, xml: true },
      { mes: 'Julio 2024', codigo: 'FE-0598', comision: 923, pdf: true, xml: true },
      { mes: 'Junio 2024', codigo: 'FE-0487', comision: 681, pdf: true, xml: true },
    ];
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:2000;padding:1rem;';
    modal.innerHTML = `
      <div class="modal-card" style="background:#fff;border-radius:12px;padding:1.5rem;max-width:700px;width:100%;max-height:80vh;overflow:auto;">
        <h3 style="margin:0 0 1rem;">Historial Completo de Facturas Electrónicas Canchero</h3>
        <div style="max-height:50vh;overflow:auto;">
          <table style="width:100%;border-collapse:collapse;font-size:.85rem;">
            <thead><tr style="border-bottom:2px solid #e2e8f0;text-align:left;">
              <th style="padding:.5rem;">Mes</th><th style="padding:.5rem;">Código</th><th style="padding:.5rem;">Comisión</th><th style="padding:.5rem;">Descargas</th>
            </tr></thead>
            <tbody>
              ${facturas.map(f => `<tr style="border-bottom:1px solid #f1f5f9;">
                <td style="padding:.5rem;">${f.mes}</td>
                <td style="padding:.5rem;font-family:monospace;">${f.codigo}</td>
                <td style="padding:.5rem;">${this.fmtPEN(f.comision)}</td>
                <td style="padding:.5rem;">
                  <button class="btn btn-sm btn-outline" onclick="alert('Descargando PDF ${f.codigo}')"><svg class="icon-14" style="width:14px;height:14px;" aria-hidden="true"><use href="/iconos-canchero.svg#picture_as_pdf"></use></svg></button>
                  <button class="btn btn-sm btn-outline" onclick="alert('Descargando XML ${f.codigo}')"><svg class="icon-14" style="width:14px;height:14px;" aria-hidden="true"><use href="/iconos-canchero.svg#code"></use></svg></button>
                </td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <div style="text-align:right;margin-top:1rem;">
          <button class="btn btn-primary" onclick="this.closest('.modal-overlay').remove()">Cerrar</button>
        </div>
      </div>
    `;
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
    document.body.appendChild(modal);
  }

  protected descargarFacturaPDF(codigo: string): void {
    const contenido = `FACTURA ELECTRÓNICA CANCHERO.MVP\nCódigo: ${codigo}\nFecha: ${new Date().toLocaleDateString('es-PE')}\nComisión Plataforma: 5%\nRUC: 20608941231\n\nEste es un PDF generado desde el panel admin.`;
    const blob = new Blob([contenido], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${codigo}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
    this.mostrarToast(`PDF ${codigo} descargado`);
  }

  protected descargarFacturaXML(codigo: string): void {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2">
  <cbc:ID>${codigo}</cbc:ID>
  <cbc:IssueDate>${new Date().toISOString().split('T')[0]}</cbc:IssueDate>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyIdentification>
        <cbc:ID schemeID="6">20608941231</cbc:ID>
      </cac:PartyIdentification>
      <cac:PartyName><cbc:Name>Canchero.MVP S.A.C.</cbc:Name></cac:PartyName>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:LegalMonetaryTotal>
    <cbc:PayableAmount currencyID="PEN">${this.metricas().comisionApp}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
</Invoice>`;
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${codigo}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    this.mostrarToast(`XML ${codigo} descargado`);
  }

  protected guardarConfiguracionGeneral(): void {
    this.mostrarToast('Configuración general guardada correctamente');
  }

  protected cerrarTodasLasSesiones(): void {
    this.mostrarToast('Sesión cerrada en todos los dispositivos');
  }

  protected solicitarEliminacionCuenta(): void {
    this.mostrarToast('Solicitud de eliminación definitiva enviada al soporte Canchero');
  }

  protected seleccionarCuentaBancaria(): void {
    this.mostrarToast('Cuenta bancaria de depósito actualizada');
  }

  protected cambiarFrecuenciaPago(frecuencia: string): void {
    this.frecuenciaPago.set(frecuencia);
    this.mostrarToast(`Frecuencia de transferencias: ${frecuencia}`);
  }
}
