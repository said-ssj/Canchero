import { Component, computed, effect, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { AdminContext } from '../admin-context.service';
import { CommonModule } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
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
  protected readonly db = inject(DatabaseService);
  protected readonly cajaService = inject(CajaService);
  protected readonly posService = inject(PosService);
  protected readonly toastService = inject(ToastService);

  private noticeSubscription?: { unsubscribe: () => void };

  readonly toastVisible = computed(() => this.toastService.visible());
  readonly toastMessage = computed(() => this.toastService.message());

  readonly sidebarCollapsed = signal(false);
  readonly mobileSidebarOpen = signal(false);
  readonly isDarkMode = signal(false);
  readonly adminModalPrivacidadOpen = signal(false);
  readonly adminModalAyudaOpen = signal(false);

  readonly navItems: AdminNavItem[] = [
    { label: 'Mi Sede', route: '/admin/sedes', icon: 'stadium' },
    { label: 'Mis Canchas', route: '/admin/canchas', icon: 'sports_soccer' },
    { label: 'Reservas & Operaciones', route: '/admin/reservas', icon: 'calendar_month' },
    { label: 'Caja Operativa & Turnos', route: '/admin/caja', icon: 'point_of_sale' },
    { label: 'Punto de Venta (POS) & Kardex', route: '/admin/pos', icon: 'shopping_cart' },
    { label: 'Finanzas & Liquidación', route: '/admin/finanzas', icon: 'payments' },
    { label: 'Personalización & QR', route: '/admin/personalizacion', icon: 'qr_code_2' },
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
    effect(() => {
      if (!this.auth.currentUser() && !this.auth.restoring?.()) void this.router.navigate(['/login']);
    });
    effect(() => {
      if (this.context.loading()) return;
      const id = this.context.venue()?.id ?? null;
      if (this.db.sedeOperativaId() !== id) this.db.setSedeOperativaId(id);
    });
  }

  ngOnDestroy(): void {
    this.onDeactivate();
  }

  ngOnInit(): void {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('canchero_theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        this.isDarkMode.set(true);
        document.documentElement.classList.add('dark-theme');
        document.body.classList.add('dark-theme');
      }
    }

    // Set default venue if none active yet
    if (!this.db.sedeOperativaId() && this.sedesDelDueno().length > 0) {
      this.db.setSedeOperativaId(this.sedesDelDueno()[0].id);
    }
  }

  seleccionarSede(sedeId: number | string | null | undefined): void {
    if (sedeId == null || sedeId === '') return;
    this.context.selectVenue(sedeId);
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
    const next = !this.isDarkMode();
    this.isDarkMode.set(next);
    if (typeof window !== 'undefined') {
      if (next) {
        document.documentElement.classList.add('dark-theme');
        document.body.classList.add('dark-theme');
        localStorage.setItem('canchero_theme', 'dark');
      } else {
        document.documentElement.classList.remove('dark-theme');
        document.body.classList.remove('dark-theme');
        localStorage.setItem('canchero_theme', 'light');
      }
    }
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
    return this.auth.currentUser()?.nombre ?? 'Administrador';
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
    if (componentRef && componentRef.notice && typeof componentRef.notice.subscribe === 'function') {
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
