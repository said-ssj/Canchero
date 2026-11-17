import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeToggle } from '@shared/components/theme-toggle/theme-toggle';
import { AuthService } from '@core/auth/auth.service';
import { PlatformAdminService } from '@core/services/platform-admin.service';

type SuperadminNavSection = 'general' | 'operaciones' | 'gestion' | 'finanzas' | 'seguridad';

@Component({
  standalone: true,
  selector: 'app-superadmin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, ThemeToggle],
  templateUrl: './superadmin-layout.html',
  styleUrl: './superadmin-layout.css',
})
export class SuperadminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly document = inject(DOCUMENT);
  private readonly platformAdmin = inject(PlatformAdminService);

  protected readonly name = computed(() => {
    const user = this.auth.currentUser();
    return [user?.nombre, user?.apellido].filter(Boolean).join(' ') || 'Superadmin';
  });
  protected readonly email = computed(() => this.auth.currentUser()?.email ?? '');
  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'SA';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0].charAt(0)}${parts[1].charAt(0)}`.toUpperCase();
  });

  protected readonly navSections: {
    id: SuperadminNavSection;
    label: string;
    items: { route: string; label: string; icon: string }[];
  }[] = [
    {
      id: 'general',
      label: 'General',
      items: [{ route: '/superadmin/dashboard', label: 'Dashboard', icon: 'space_dashboard' }],
    },
    {
      id: 'operaciones',
      label: 'Operaciones',
      items: [
        {
          route: '/superadmin/moderacion',
          label: 'Reportes y moderación',
          icon: 'flag',
        },
      ],
    },
    {
      id: 'gestion',
      label: 'Administración',
      items: [{ route: '/superadmin/usuarios', label: 'Usuarios y permisos', icon: 'group' }],
    },
    {
      id: 'finanzas',
      label: 'Finanzas',
      items: [{ route: '/superadmin/pagos', label: 'Pagos e ingresos', icon: 'payments' }],
    },
    {
      id: 'seguridad',
      label: 'Seguridad',
      items: [{ route: '/superadmin/auditoria', label: 'Auditoría y actividad', icon: 'history' }],
    },
  ];

  protected readonly expandedNavSections = signal<Record<SuperadminNavSection, boolean>>({
    general: true,
    operaciones: true,
    gestion: true,
    finanzas: true,
    seguridad: true,
  });
  protected readonly mobileSidebarOpen = signal(false);
  protected readonly notificationsOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);
  protected readonly notificationLoading = signal(false);
  protected readonly notificationError = signal('');
  protected readonly pendingReports = signal<number | null>(null);
  private readonly readReportsCount = signal<number | null>(null);
  protected readonly fullscreenError = signal('');
  protected readonly isFullscreen = signal(false);
  protected readonly unreadNotificationCount = computed(() => {
    const count = this.pendingReports() ?? 0;
    return this.readReportsCount() === count ? 0 : count;
  });

  protected toggleNavSection(section: SuperadminNavSection): void {
    this.expandedNavSections.update((sections) => ({
      ...sections,
      [section]: !sections[section],
    }));
  }

  protected toggleNotifications(): void {
    const opening = !this.notificationsOpen();
    this.notificationsOpen.set(opening);
    this.profileMenuOpen.set(false);
    if (opening && this.pendingReports() === null) this.loadNotifications();
  }

  protected loadNotifications(): void {
    if (this.notificationLoading()) return;
    this.notificationLoading.set(true);
    this.notificationError.set('');
    this.platformAdmin.dashboard(this.dateOffset(-6), this.dateOffset(0)).subscribe({
      next: (overview) => {
        this.pendingReports.set(overview.pendingReports);
        this.notificationLoading.set(false);
      },
      error: (error: { status?: number }) => {
        this.notificationError.set(this.platformAdmin.describeError(error, 'dashboard'));
        this.notificationLoading.set(false);
      },
    });
  }

  protected markReportsAsRead(): void {
    this.readReportsCount.set(this.pendingReports());
  }

  protected openReports(): void {
    this.markReportsAsRead();
    this.notificationsOpen.set(false);
    void this.router.navigateByUrl('/superadmin/moderacion');
  }

  protected toggleProfileMenu(): void {
    this.profileMenuOpen.update((open) => !open);
    this.notificationsOpen.set(false);
  }

  protected closeProfileMenu(): void {
    this.profileMenuOpen.set(false);
  }

  protected closeMobileSidebar(): void {
    this.mobileSidebarOpen.set(false);
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/');
  }

  protected toggleFullscreen(): void {
    this.fullscreenError.set('');
    if (this.document.fullscreenElement) {
      void this.document.exitFullscreen().catch(() => {
        this.fullscreenError.set('No se pudo salir de pantalla completa.');
      });
      return;
    }

    const requestFullscreen = this.document.documentElement.requestFullscreen;
    if (!requestFullscreen) {
      this.fullscreenError.set('Este navegador no permite usar pantalla completa.');
      return;
    }
    void requestFullscreen.call(this.document.documentElement).catch(() => {
      this.fullscreenError.set('No se pudo activar pantalla completa.');
    });
  }

  @HostListener('document:fullscreenchange')
  protected onFullscreenChange(): void {
    this.isFullscreen.set(!!this.document.fullscreenElement);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (
      target?.closest('.notification-control, .profile-control, .menu-toggle, .console-sidebar')
    ) {
      return;
    }
    this.notificationsOpen.set(false);
    this.profileMenuOpen.set(false);
    this.mobileSidebarOpen.set(false);
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.notificationsOpen.set(false);
    this.profileMenuOpen.set(false);
    this.mobileSidebarOpen.set(false);
  }

  private dateOffset(offset: number): string {
    const date = new Date();
    date.setDate(date.getDate() + offset);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }
}
