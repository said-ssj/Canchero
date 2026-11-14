import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';

@Component({
  standalone: true,
  selector: 'app-superadmin-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="console-shell">
      <aside class="console-sidebar">
        <a class="brand" routerLink="/superadmin/dashboard">
          <span class="brand-mark">C</span>
          <span
            >Canchero<span class="brand-suffix">.MVP</span
            ><small>CONSOLA DE PLATAFORMA</small></span
          >
        </a>
        <p class="nav-caption">SUPERVISIÓN</p>
        <nav aria-label="Navegación de superadministración">
          @for (item of navItems; track item.route) {
            @if (item.enabled) {
              <a
                [routerLink]="item.route"
                routerLinkActive="active"
                [routerLinkActiveOptions]="{ exact: true }"
              >
                <span class="nav-icon">{{ item.icon }}</span
                ><span>{{ item.label }}</span>
              </a>
            } @else {
              <span class="nav-disabled" aria-disabled="true">
                <span class="nav-icon">{{ item.icon }}</span
                ><span>{{ item.label }}</span
                ><small>Próximamente</small>
              </span>
            }
          }
        </nav>
        <div class="sidebar-bottom">
          <span class="admin-badge">SA</span
          ><span
            ><strong>{{ name() }}</strong
            ><small>Superadministrador</small></span
          >
          <button type="button" (click)="logout()" aria-label="Cerrar sesión">Salir</button>
        </div>
      </aside>
      <main class="console-main"><router-outlet /></main>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100dvh;
        color: var(--color-ink-900, #172033);
        background: var(--color-slate-50, #f5f7fa);
        font-family: var(--font-sans, 'Plus Jakarta Sans', sans-serif);
      }
      .console-shell {
        min-height: 100dvh;
      }
      .console-sidebar {
        position: fixed;
        inset: 0 auto 0 0;
        width: 260px;
        display: flex;
        flex-direction: column;
        padding: 20px 14px;
        background: #171717;
        color: #e2e8f0;
        box-sizing: border-box;
        z-index: 5;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 2px 8px 24px;
        color: white;
        text-decoration: none;
        font-size: 20px;
        font-weight: 800;
      }
      .brand-mark {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        background: #27802d;
        font-size: 25px;
      }
      .brand-suffix {
        color: #f97316;
      }
      .brand small,
      .sidebar-bottom small {
        display: block;
        margin-top: 4px;
        color: #f97316;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.08em;
      }
      .nav-caption {
        margin: 10px 12px;
        color: #9298a1;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.1em;
      }
      nav {
        display: grid;
        gap: 5px;
      }
      nav a,
      .nav-disabled {
        min-height: 44px;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 12px;
        border-radius: 5px;
        color: #cbd5e1;
        text-decoration: none;
        font-weight: 650;
      }
      nav a:hover {
        background: #252525;
      }
      nav a.active {
        background: #27802d;
        color: white;
      }
      .nav-icon {
        width: 23px;
        text-align: center;
        font-size: 18px;
      }
      .nav-disabled {
        opacity: 0.55;
        cursor: default;
      }
      .nav-disabled small {
        margin-left: auto;
        font-size: 10px;
        color: #aab1bd;
      }
      .sidebar-bottom {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-top: auto;
        padding: 14px 4px 0;
        border-top: 1px solid #333;
        font-size: 13px;
      }
      .admin-badge {
        display: grid;
        place-items: center;
        flex: 0 0 34px;
        height: 34px;
        border-radius: 50%;
        background: #27802d;
        color: white;
      }
      .sidebar-bottom small {
        color: #aab1bd;
        font-size: 11px;
        font-weight: 500;
        letter-spacing: 0;
      }
      .sidebar-bottom button {
        margin-left: auto;
        border: 0;
        background: transparent;
        color: #cbd5e1;
        cursor: pointer;
      }
      .console-main {
        min-height: 100dvh;
        margin-left: 260px;
        padding: 28px;
        box-sizing: border-box;
      }
      @media (max-width: 760px) {
        .console-sidebar {
          position: static;
          width: auto;
          min-height: auto;
          padding: 12px;
        }
        .brand {
          padding-bottom: 12px;
        }
        .nav-caption,
        .sidebar-bottom {
          display: none;
        }
        nav {
          display: flex;
          overflow: auto;
        }
        nav a,
        .nav-disabled {
          flex: 0 0 auto;
          min-height: 40px;
          padding: 0 10px;
          font-size: 12px;
        }
        .nav-disabled small {
          display: none;
        }
        .console-main {
          margin: 0;
          padding: 18px;
        }
      }
    `,
  ],
})
export class SuperadminLayout {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  protected readonly name = computed(() => this.auth.currentUser()?.nombre || 'Superadmin');
  protected readonly navItems = [
    { route: '/superadmin/dashboard', label: 'Dashboard', icon: '▦', enabled: true },
    { route: '/superadmin/sedes', label: 'Sedes y canchas', icon: '⚽', enabled: true },
    { route: '/superadmin/moderacion', label: 'Reportes y moderación', icon: '⚑', enabled: true },
    { route: '/superadmin/usuarios', label: 'Usuarios y permisos', icon: '♙', enabled: true },
    { route: '/superadmin/pagos', label: 'Pagos e ingresos', icon: '$', enabled: true },
    { route: '/superadmin/auditoria', label: 'Auditoría y actividad', icon: '◷', enabled: true },
  ];
  protected logout(): void {
    this.auth.logout();
    void this.router.navigateByUrl('/');
  }
}
