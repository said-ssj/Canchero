import { ThemeService } from '@core/theme/theme.service';
import { ThemeToggle } from '../theme-toggle/theme-toggle';
import { Component, HostListener, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';

@Component({
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, ThemeToggle],
  selector: 'app-navbar',
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);

  // Modal de Búsqueda General (Lupa)
  protected readonly searchOverlayOpen = signal(false);
  protected searchQuery = '';

  // Modales de Perfil
  protected readonly modalConfigOpen = signal(false);
  protected readonly modalPrivacidadOpen = signal(false);
  protected readonly modalAyudaOpen = signal(false);

  protected readonly themeMode = inject(ThemeService).mode;
  protected readonly user = this.auth.user;
  protected readonly profile = this.auth.playerProfile;
  protected readonly profileName = computed(() => {
    const profile = this.profile();
    return (
      [profile?.nombre, profile?.apellido].filter(Boolean).join(' ') || this.user()?.nombre || ''
    );
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

  constructor() {
    effect((onCleanup) => {
      if (!this.user()?.id) return;
      const request = this.auth.loadPlayerProfile().subscribe({ error: () => undefined });
      onCleanup(() => request.unsubscribe());
    });
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.profileMenuOpen()) {
      this.profileMenuOpen.set(false);
    }
  }

  @HostListener('window:keydown.escape')
  onEscape(): void {
    if (this.searchOverlayOpen()) {
      this.closeSearch();
    }
  }

  protected openSearch(): void {
    this.searchQuery = '';
    this.searchOverlayOpen.set(true);
    setTimeout(() => {
      const input = document.querySelector('.search-pill-input') as HTMLInputElement;
      input?.focus();
    }, 50);
  }

  protected closeSearch(): void {
    this.searchOverlayOpen.set(false);
    this.searchQuery = '';
  }

  protected ejecutarBusqueda(query?: string): void {
    const q = (query !== undefined ? query : this.searchQuery).trim();
    this.closeSearch();
    if (q) {
      void this.router.navigate(['/sedes'], { queryParams: { buscar: q } });
    } else {
      void this.router.navigate(['/sedes']);
    }
  }

  protected buscarRapido(termino: string): void {
    this.ejecutarBusqueda(termino);
  }

  protected irAUsuariosComunidad(): void {
    this.closeSearch();
    void this.router.navigate(['/perfil']);
  }

  protected toggleProfileMenu(): void {
    this.profileMenuOpen.update((open) => !open);
  }

  protected abrirConfiguracion(): void {
    this.profileMenuOpen.set(false);
    this.modalConfigOpen.set(true);
  }

  protected abrirPrivacidad(): void {
    this.profileMenuOpen.set(false);
    this.modalPrivacidadOpen.set(true);
  }

  protected abrirAyuda(): void {
    this.profileMenuOpen.set(false);
    this.modalAyudaOpen.set(true);
  }

  protected cerrarModales(): void {
    this.modalConfigOpen.set(false);
    this.modalPrivacidadOpen.set(false);
    this.modalAyudaOpen.set(false);
  }

  protected irAAdmin(): void {
    this.cerrarModales();
    void this.router.navigate(['/admin']);
  }

  protected logout(): void {
    this.profileMenuOpen.set(false);
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
