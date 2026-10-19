import { Component, HostListener, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';

@Component({
  imports: [RouterLink],
  selector: 'app-navbar',
  styleUrl: './navbar.css',
  templateUrl: './navbar.html',
})
export class Navbar {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);
  protected readonly profileMenuOpen = signal(false);
  protected readonly isDarkMode = signal(false);

  // Modales de Perfil
  protected readonly modalConfigOpen = signal(false);
  protected readonly modalPrivacidadOpen = signal(false);
  protected readonly modalAyudaOpen = signal(false);

  protected readonly user = this.auth.user;
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
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('canchero_theme');
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (savedTheme === 'dark' || (!savedTheme && prefersDark)) {
        this.isDarkMode.set(true);
        document.documentElement.classList.add('dark-theme');
        document.body.classList.add('dark-theme');
      }
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.profileMenuOpen()) {
      this.profileMenuOpen.set(false);
    }
  }

  protected toggleProfileMenu(): void {
    this.profileMenuOpen.update((open) => !open);
  }

  protected toggleDarkMode(): void {
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