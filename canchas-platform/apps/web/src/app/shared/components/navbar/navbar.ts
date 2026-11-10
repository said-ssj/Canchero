import { ThemeService } from '@core/theme/theme.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@core/auth/auth.service';
import { SearchOverlayComponent } from '../search-overlay/search-overlay';

export interface UserMenuItem {
  label: string;
  icon: string;
  route?: string;
  action?: 'logout';
  isDivider?: boolean;
}

@Component({
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    RouterLinkActive,
    ThemeToggle,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatMenuModule,
    MatDividerModule,
    MatTooltipModule,
    SearchOverlayComponent,
  ],
  selector: 'app-navbar',
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);

  // Modal de Búsqueda General (Lupa)
  protected readonly searchOverlayOpen = signal(false);
  protected searchQuery = '';

  protected readonly themeMode = inject(ThemeService).mode;
  protected readonly user = this.auth.user;
  protected readonly profile = this.auth.playerProfile;
  protected readonly profileName = computed(() => {
    const profile = this.profile();
    return (
      [profile?.nombre, profile?.apellido].filter(Boolean).join(' ') || this.user()?.nombre || ''
    );
  });

  protected readonly roleLabel = computed(() => {
    const u = this.user();
    if (!u) return 'Usuario';
    const r = (u.rol || '').toLowerCase();
    if (r === 'superadmin') return 'Superadministrador';
    if (r === 'admin') return 'Administrador';
    if (r === 'dueno' || r === 'owner') return 'Dueño de sede';
    if (r === 'cajero' || r === 'caja') return 'Cajero';
    if (r === 'operador') return 'Operador';
    return 'Jugador';
  });

  protected readonly isOwner = computed(() => {
    const u = this.user();
    if (!u) return false;
    return (
      this.auth.isOwner() ||
      u.rol === 'admin' ||
      u.rol === 'dueno' ||
      (u.correo || u.email || '').includes('dueno') ||
      (u.correo || u.email || '').includes('admin') ||
      u.nombre?.toLowerCase().includes('dueño')
    );
  });

  protected readonly menuItems = computed<UserMenuItem[]>(() => {
    const items: UserMenuItem[] = [
      { label: 'Mis reservas', icon: 'event_available', route: '/itinerario' },
      { label: 'Mi perfil', icon: 'person', route: '/perfil' },
      { label: 'Configuración', icon: 'settings', route: '/cuenta' },
    ];
    if (this.isOwner()) {
      items.push({
        label: 'Panel de administración',
        icon: 'admin_panel_settings',
        route: '/admin',
      });
    }
    items.push(
      { label: '', icon: '', isDivider: true },
      { label: 'Ayuda', icon: 'help', route: '/ayuda' },
      { label: 'Cerrar sesión', icon: 'logout', action: 'logout' },
    );
    return items;
  });

  constructor() {
    effect((onCleanup) => {
      if (!this.user()?.id) return;
      const request = this.auth.loadPlayerProfile().subscribe({ error: () => undefined });
      onCleanup(() => request.unsubscribe());
    });
  }

  @HostListener('window:keydown', ['$event'])
  handleGlobalShortcuts(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      this.openSearch();
      return;
    }
    if (event.key === '/' && !this.searchOverlayOpen()) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag !== 'input' && tag !== 'textarea' && tag !== 'select' && !target?.isContentEditable) {
        event.preventDefault();
        this.openSearch();
      }
    }
  }

  protected openSearch(): void {
    this.searchOverlayOpen.set(true);
  }

  protected closeSearch(): void {
    this.searchOverlayOpen.set(false);
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  /**
   * Extrae exactamente 2 iniciales (primer nombre y primer apellido / 2da palabra):
   * Dueño Canchero = DC, Diego Medina = DM, Alvaro Alejandro Astocaza = AA
   */
  protected initials(nombre: string | null | undefined): string {
    if (!nombre) return 'DC';
    const words = nombre.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 'DC';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
  }
}
