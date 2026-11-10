import { ThemeService } from '@core/theme/theme.service';
import {
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  OnInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AdminContext } from '../admin-context.service';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet, NavigationEnd } from '@angular/router';
import { Observable, combineLatest, filter, map, startWith } from 'rxjs';
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
import { MatInputModule } from '@angular/material/input';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatBadgeModule } from '@angular/material/badge';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatRippleModule } from '@angular/material/core';
import { ThemeToggle } from '@shared/components/theme-toggle/theme-toggle';

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
    ReactiveFormsModule,
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MatSidenavModule,
    MatToolbarModule,
    MatButtonModule,
    MatIconModule,
    MatSelectModule,
    MatFormFieldModule,
    MatInputModule,
    MatAutocompleteModule,
    MatBadgeModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    MatRippleModule,
    ThemeToggle,
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
  readonly canBrowseAllVenues = computed(() => this.auth.currentUser()?.rol === 'superadmin');
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

  readonly sedeControl = new FormControl<any>('');
  readonly filteredSedes: Observable<any[]>;

  readonly displaySedeFn = (sede: any): string => {
    if (!sede) return '';
    return typeof sede === 'object' ? String(sede.nombre || '') : String(sede);
  };

  onSedeSelected(sede: any): void {
    if (!sede) return;
    const id = typeof sede === 'object' ? sede.id : sede;
    this.seleccionarSede(id);
  }

  constructor() {
    const sedes$ = toObservable(this.sedesDelDueno);
    const query$ = this.sedeControl.valueChanges.pipe(startWith(this.sedeControl.value));
    this.filteredSedes = combineLatest([sedes$, query$]).pipe(
      map(([sedes, val]) => {
        if (!val || typeof val === 'object') {
          return sedes;
        }
        const q = String(val).toLowerCase().trim();
        if (!q) return sedes;
        return sedes.filter(
          (s) => s.nombre?.toLowerCase().includes(q) || s.direccion?.toLowerCase().includes(q),
        );
      }),
    );

    effect((onCleanup) => {
      if (!this.auth.currentUser()?.id) return;
      const request = this.auth.loadPlayerProfile().subscribe({ error: () => undefined });
      onCleanup(() => request.unsubscribe());
    });
    effect(() => {
      if (this.context.loading()) return;
      const venue = this.context.venue();
      const id = venue?.id ?? null;
      untracked(() => {
        if (this.db.sedeOperativaId() !== id) this.db.setSedeOperativaId(id);
        if (venue && this.sedeControl.value?.id !== venue.id) {
          this.sedeControl.setValue(venue, { emitEvent: true });
        }
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

  /* ================= NOTIFICACIONES OPERATIVAS DINÁMICAS ================= */
  readonly notificationsOpen = signal(false);
  readonly notifFilter = signal<'todas' | 'no_leidas'>('todas');
  private readonly readNotifIds = signal<Set<string>>(new Set());

  readonly notificationsList = computed(() => {
    const sedeId = this.sedeDelDueno()?.id ?? 'global';
    const readIds = this.readNotifIds();
    const items: Array<{
      id: string;
      modulo: string;
      detalle: string;
      ruta: string;
      icono: string;
      avatarBg: string;
      badgeIcon: string;
      badgeColor: string;
      tiempo: string;
      leida: boolean;
    }> = [];

    const pendientes = this.pendientesCount();
    if (pendientes > 0) {
      const id = `reservas-pendientes-${sedeId}-${pendientes}`;
      items.push({
        id,
        modulo: 'Reservas & Operaciones',
        detalle: `Tienes ${pendientes} reserva(s) pendiente(s) por verificar y confirmar abono.`,
        ruta: '/admin/reservas',
        icono: 'event_available',
        avatarBg: '#3b82f6',
        badgeIcon: 'schedule',
        badgeColor: '#1d4ed8',
        tiempo: 'Ahora',
        leida: readIds.has(id),
      });
    }

    const criticos = this.stockCriticoCount();
    if (criticos > 0) {
      const id = `stock-critico-${sedeId}-${criticos}`;
      items.push({
        id,
        modulo: 'Inventario & Kardex',
        detalle: `Alerta de existencias: Hay ${criticos} producto(s) con saldo igual o por debajo del stock mínimo.`,
        ruta: '/admin/inventario',
        icono: 'inventory',
        avatarBg: '#f59e0b',
        badgeIcon: 'warning',
        badgeColor: '#b45309',
        tiempo: 'Ahora',
        leida: readIds.has(id),
      });
    }

    return items;
  });

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
    this.readNotifIds.update((set) => {
      const next = new Set(set);
      next.add(item.id);
      return next;
    });
    this.notificationsOpen.set(false);
    void this.router.navigateByUrl(item.ruta);
  }

  marcarTodasLeidas(): void {
    this.readNotifIds.update((set) => {
      const next = new Set(set);
      for (const n of this.notificationsList()) {
        next.add(n.id);
      }
      return next;
    });
  }

  readonly sedesFiltradas = computed(() => {
    const q = this.sedeSearchQuery().toLowerCase().trim();
    const list = this.sedesDelDueno();
    if (!q) return list;
    return list.filter(
      (s) => s.nombre?.toLowerCase().includes(q) || s.direccion?.toLowerCase().includes(q),
    );
  });

  @HostListener('document:click', ['$event'])
  onDocumentClick(event?: Event): void {
    if (this.sedeSearchOpen()) {
      this.cerrarSedeSearch();
    }
    // Click exterior: cierra la ventana de notificaciones si el clic ocurre fuera de la campana/popover.
    if (this.notificationsOpen()) {
      const target = event?.target as HTMLElement | null;
      if (!target?.closest?.('.bell-notifications-wrapper')) {
        this.notificationsOpen.set(false);
      }
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.notificationsOpen()) this.notificationsOpen.set(false);
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
    const found = this.sedesDelDueno().find((s) => String(s.id) === String(sedeId));
    if (found) {
      this.sedeControl.setValue(found, { emitEvent: true });
    }
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
