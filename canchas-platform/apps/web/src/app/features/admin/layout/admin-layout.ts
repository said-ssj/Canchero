import { ThemeService } from '@core/theme/theme.service';
import { Component, computed, effect, inject, signal, untracked, OnInit, OnDestroy, HostListener } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { AdminContext } from '../admin-context.service';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { CajaService } from '@core/services/caja.service';
import { PosService } from '@core/services/pos.service';
import { ToastService } from '@core/services/toast.service';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';

export interface AdminNavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  standalone: true,
  selector: 'app-admin-layout',
  imports: [
    CommonModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatBadgeModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    MatRippleModule,
  ],
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout implements OnInit, OnDestroy {
  readonly context = inject(AdminContext);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  readonly profile = this.auth.playerProfile;
  protected readonly db = inject(DatabaseService);
  protected readonly cajaService = inject(CajaService);
  protected readonly posService = inject(PosService);
  protected readonly toastService = inject(ToastService);

  private noticeSubscription?: { unsubscribe: () => void };

  readonly toastVisible = computed(() => this.toastService.visible());
  readonly toastMessage = computed(() => this.toastService.message());

  readonly sidebarCollapsed = signal(false);
  readonly mobileSidebarOpen = signal(false);
  readonly isSedesRoute = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => (e.urlAfterRedirects || e.url).includes('/admin/sedes')),
    ),
    { initialValue: this.router.url.includes('/admin/sedes') },
  );
  private readonly theme = inject(ThemeService);
  readonly isDarkMode = this.theme.isDark;
  readonly adminModalPrivacidadOpen = signal(false);
  readonly adminModalAyudaOpen = signal(false);
  readonly isSuperAdmin = computed(() => this.auth.isSuperAdmin());
  readonly canBrowseAllVenues = computed(() =>
    this.auth.currentUser()?.rol === 'superadmin',
  );
  readonly allVenuesMode = computed(() => this.db.managementScope?.() === 'all');
  readonly accountRoleLabel = computed(() => {
    const role = this.auth.currentUser()?.rol;
    if (role === 'superadmin') return 'Superadministrador';
    if (role === 'admin') return 'Administrador';
    if (role === 'operador') return 'Operador';
    if (role === 'caja') return 'Cajero';
    return 'Dueño de sedes';
  });
  cambiarAlcance(value: string): void {
    this.db.setManagementScope?.(value);
  }

  readonly navItems: AdminNavItem[] = [
    { label: 'Mi Sede', route: '/admin/sedes', icon: 'stadium' },
    { label: 'Mis Canchas', route: '/admin/canchas', icon: 'sports_soccer' },
    { label: 'Reservas & Operaciones', route: '/admin/reservas', icon: 'calendar_month' },
    { label: 'Caja Operativa & Turnos', route: '/admin/caja', icon: 'point_of_sale' },
    { label: 'Punto de Venta (POS) & Kardex', route: '/admin/pos', icon: 'shopping_cart' },
    { label: 'Finanzas & Liquidación', route: '/admin/finanzas', icon: 'payments' },
    { label: 'Personalización & QR', route: '/admin/personalizacion', icon: 'qr_code_2' },
    { label: 'Reportes & Opiniones', route: '/admin/reportes', icon: 'reviews' },
    { label: 'Configuración', route: '/admin/configuracion', icon: 'settings' },
  ];

  readonly duenoId = computed(() => {
    return this.auth.currentUser()?.id ?? '';
  });

  readonly sedesDelDueno = computed(() => {
    return this.context.venues();
  });

  readonly sedeDelDueno = computed(() => {
    return this.context.venue();
  });

  readonly canchasDelDueno = computed(() => {
    const sedeId = this.sedeDelDueno()?.id;
    return sedeId ? this.db.getCanchasPorSede(sedeId) : [];
  });

  readonly totalLosas = computed(() => this.canchasDelDueno().length);
  readonly activasCount = computed(() => this.canchasDelDueno().filter((c) => c.activa).length);

  readonly pendientesCount = computed(() => {
    const canchas = this.canchasDelDueno();
    const canchaIds = new Set(canchas.map((c) => c.id));
    return this.db
      .getReservasPorDueno(this.duenoId())
      .filter((r) => canchaIds.has(r.cancha_id) && r.estado === 'pendiente').length;
  });

  readonly pendientesBadgeText = computed(() => {
    const c = this.pendientesCount();
    if (c <= 0) return '';
    return c > 99 ? '+99' : c.toString();
  });

  readonly cajaAbierta = computed(() => this.cajaService.tieneSesionActiva());
  readonly stockCriticoCount = computed(() => this.posService.productosStockCritico().length);

  constructor() {
    effect((onCleanup) => {
      if (!this.auth.currentUser()?.id) return;
      const request = this.auth.loadPlayerProfile().subscribe({ error: () => undefined });
      onCleanup(() => request.unsubscribe());
    });
    effect(() => {
      if (this.context.loading()) return;
      const id = this.context.venue()?.id ?? null;
      untracked(() => {
        if (this.db.sedeOperativaId() !== id) this.db.setSedeOperativaId(id);
      });
    });
  }

  ngOnDestroy(): void {
    this.onDeactivate();
  }

  ngOnInit(): void {
    // Set default venue if none active yet
    if (!this.db.sedeOperativaId() && this.sedesDelDueno().length > 0) {
      this.db.setSedeOperativaId(this.sedesDelDueno()[0].id);
    }
  }

  readonly sedeSearchQuery = signal('');
  readonly sedeSearchOpen = signal(false);

  /* ================= NOTIFICACIONES OPERATIVAS ESTILO FACEBOOK ================= */
  readonly notificationsOpen = signal(false);
  readonly notifFilter = signal<'todas' | 'no_leidas'>('todas');

  readonly notificationsList = signal([
    {
      id: 'notif-1',
      modulo: 'Reservas & Operaciones',
      detalle: 'Tienes reservas pendientes por verificar y confirmar abono.',
      ruta: '/admin/reservas',
      icono: 'event_available',
      avatarBg: '#3b82f6',
      badgeIcon: 'schedule',
      badgeColor: '#1d4ed8',
      tiempo: 'Hace 15 min',
      leida: false,
    },
    {
      id: 'notif-2',
      modulo: 'Inventario & Kardex',
      detalle: 'Alerta de existencias: Hay productos con saldo cerca del stock mínimo.',
      ruta: '/admin/inventario',
      icono: 'inventory',
      avatarBg: '#f59e0b',
      badgeIcon: 'warning',
      badgeColor: '#b45309',
      tiempo: 'Hace 30 min',
      leida: false,
    },
    {
      id: 'notif-3',
      modulo: 'Caja Operativa & Turnos',
      detalle: 'Turno activo en sede. Recuerda registrar los movimientos manuales antes del arqueo.',
      ruta: '/admin/caja',
      icono: 'point_of_sale',
      avatarBg: '#10b981',
      badgeIcon: 'payments',
      badgeColor: '#047857',
      tiempo: 'Hace 1 h',
      leida: false,
    },
    {
      id: 'notif-4',
      modulo: 'Créditos & Fiados',
      detalle: 'Cuentas deudoras con saldos pendientes requieren revisión de abonos.',
      ruta: '/admin/creditos',
      icono: 'account_balance_wallet',
      avatarBg: '#ef4444',
      badgeIcon: 'credit_card',
      badgeColor: '#b91c1c',
      tiempo: 'Hace 2 h',
      leida: false,
    },
    {
      id: 'notif-5',
      modulo: 'Reportes & Opiniones',
      detalle: 'Se ha registrado una nueva incidencia o reseña en una cancha de tu sede.',
      ruta: '/admin/reportes',
      icono: 'flag',
      avatarBg: '#ec4899',
      badgeIcon: 'report_problem',
      badgeColor: '#be185d',
      tiempo: 'Hace 3 h',
      leida: true,
    },
    {
      id: 'notif-6',
      modulo: 'Compras & Proveedores',
      detalle: 'Recepción y órdenes de compra con conservación de costo registradas.',
      ruta: '/admin/compras',
      icono: 'local_shipping',
      avatarBg: '#14b8a6',
      badgeIcon: 'check_circle',
      badgeColor: '#0f766e',
      tiempo: 'Ayer',
      leida: true,
    },
    {
      id: 'notif-7',
      modulo: 'Punto de Venta (POS)',
      detalle: 'Mostrador operativo listo para cobros rápidos y emisión de comprobantes.',
      ruta: '/admin/pos',
      icono: 'storefront',
      avatarBg: '#8b5cf6',
      badgeIcon: 'shopping_cart',
      badgeColor: '#6d28d9',
      tiempo: 'Ayer',
      leida: true,
    },
    {
      id: 'notif-8',
      modulo: 'Catálogo & Productos',
      detalle: 'Categorías configuradas con iconos asignados a productos sin foto.',
      ruta: '/admin/catalogo',
      icono: 'category',
      avatarBg: '#06b6d4',
      badgeIcon: 'sell',
      badgeColor: '#0e7490',
      tiempo: 'Hace 2 días',
      leida: true,
    },
    {
      id: 'notif-9',
      modulo: 'Mis Sedes & Canchas',
      detalle: 'Revisa la disponibilidad, descansos y tarifas de tus losas deportivas.',
      ruta: '/admin/canchas',
      icono: 'sports_soccer',
      avatarBg: '#22c55e',
      badgeIcon: 'sports',
      badgeColor: '#15803d',
      tiempo: 'Hace 3 días',
      leida: true,
    },
    {
      id: 'notif-10',
      modulo: 'Finanzas & Liquidación',
      detalle: 'Historial contable y recaudaciones consolidadas listas para conciliación.',
      ruta: '/admin/finanzas',
      icono: 'account_balance',
      avatarBg: '#64748b',
      badgeIcon: 'trending_up',
      badgeColor: '#334155',
      tiempo: 'Hace 5 días',
      leida: true,
    },
    {
      id: 'notif-11',
      modulo: 'Personalización & QR',
      detalle: 'QR vectorial de reserva y fichas de marca disponibles para impresión.',
      ruta: '/admin/personalizacion',
      icono: 'qr_code_2',
      avatarBg: '#0ea5e9',
      badgeIcon: 'download',
      badgeColor: '#0369a1',
      tiempo: 'Hace 1 sem',
      leida: true,
    },
    {
      id: 'notif-12',
      modulo: 'Configuración',
      detalle: 'Ajustes generales, seguridad y datos de cuenta sincronizados.',
      ruta: '/admin/configuracion',
      icono: 'settings',
      avatarBg: '#475569',
      badgeIcon: 'verified_user',
      badgeColor: '#1e293b',
      tiempo: 'Hace 2 sem',
      leida: true,
    },
  ]);

  readonly unreadNotificationsCount = computed(() => {
    return this.notificationsList().filter((n) => !n.leida).length;
  });

  readonly filteredNotifications = computed(() => {
    const list = this.notificationsList();
    if (this.notifFilter() === 'no_leidas') {
      return list.filter((n) => !n.leida);
    }
    return list;
  });

  toggleNotifications(): void {
    this.notificationsOpen.update((v) => !v);
  }

  abrirNotificacion(item: any): void {
    this.notificationsList.update((list) =>
      list.map((n) => (n.id === item.id ? { ...n, leida: true } : n)),
    );
    this.notificationsOpen.set(false);
    void this.router.navigateByUrl(item.ruta);
  }

  marcarTodasLeidas(): void {
    this.notificationsList.update((list) => list.map((n) => ({ ...n, leida: true })));
  }

  readonly sedesFiltradas = computed(() => {
    const q = this.sedeSearchQuery().toLowerCase().trim();
    const list = this.sedesDelDueno();
    if (!q) return list;
    return list.filter(
      (s) =>
        s.nombre?.toLowerCase().includes(q) ||
        s.direccion?.toLowerCase().includes(q),
    );
  });

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.sedeSearchOpen()) {
      this.cerrarSedeSearch();
    }
  }

  onSedeSearchFocus(): void {
    this.sedeSearchOpen.set(true);
  }

  onSedeSearchInput(val: string): void {
    this.sedeSearchQuery.set(val);
    this.sedeSearchOpen.set(true);
  }

  limpiarSedeSearch(event?: Event): void {
    event?.stopPropagation();
    this.sedeSearchQuery.set('');
  }

  cerrarSedeSearch(): void {
    this.sedeSearchOpen.set(false);
    this.sedeSearchQuery.set('');
  }

  seleccionarSede(sedeId: number | string | null | undefined): void {
    if (sedeId == null || sedeId === '') return;
    this.context.selectVenue(sedeId);
    this.sedeSearchOpen.set(false);
    this.sedeSearchQuery.set('');
  }

  abrirPaginaPublica(): void {
    const sedeId = this.sedeDelDueno()?.id;
    if (sedeId) window.open(`/sedes/${sedeId}`, '_blank', 'noopener,noreferrer');
  }

  toggleSidebar(): void {
    if (typeof window !== 'undefined' && window.innerWidth <= 980) {
      this.mobileSidebarOpen.update((v) => !v);
      return;
    }
    this.sidebarCollapsed.update((v) => !v);
  }

  toggleMobileSidebar(): void {
    this.mobileSidebarOpen.update((v) => !v);
  }

  closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }

  toggleDarkMode(): void {
    this.theme.set(this.isDarkMode() ? 'light' : 'dark');
  }

  abrirPrivacidadAdmin(): void {
    this.adminModalPrivacidadOpen.set(true);
  }

  abrirAyudaAdmin(): void {
    this.adminModalAyudaOpen.set(true);
  }

  cerrarModalesAdmin(): void {
    this.adminModalPrivacidadOpen.set(false);
    this.adminModalAyudaOpen.set(false);
  }

  cerrarSesionAdmin(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  nombreAdmin(): string {
    const profile = this.profile();
    return (
      [profile?.nombre, profile?.apellido].filter(Boolean).join(' ') ||
      this.auth.currentUser()?.nombre ||
      'Administrador'
    );
  }

  perfilEmail(): string {
    return this.auth.currentUser()?.email ?? 'admin@canchero.pe';
  }

  initials(nombre: string | null | undefined): string {
    if (!nombre) return 'AD';
    const parts = nombre.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'AD';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  mostrarToast(mensaje: string): void {
    this.toastService.show(mensaje);
  }

  onActivate(componentRef: any): void {
    if (this.noticeSubscription) {
      this.noticeSubscription.unsubscribe();
      this.noticeSubscription = undefined;
    }
    if (
      componentRef &&
      componentRef.notice &&
      typeof componentRef.notice.subscribe === 'function'
    ) {
      this.noticeSubscription = componentRef.notice.subscribe((msg: string) => {
        this.mostrarToast(msg);
      });
    }
  }

  onDeactivate(): void {
    if (this.noticeSubscription) {
      this.noticeSubscription.unsubscribe();
      this.noticeSubscription = undefined;
    }
  }
}
