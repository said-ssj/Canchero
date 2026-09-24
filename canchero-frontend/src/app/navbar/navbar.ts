import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../services/auth.service';

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
  protected readonly topbarVisible = signal(true);
  protected readonly user = this.auth.user;

  protected readonly topbarMessage = signal('¡Nuevos horarios nocturnos con luces LED disponibles!');

  protected hideTopBar(): void {
    this.topbarVisible.set(false);
  }

  protected logout(): void {
    this.auth.logout();
    void this.router.navigate(['/']);
  }

  protected initials(nombre: string): string {
    return nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }
}