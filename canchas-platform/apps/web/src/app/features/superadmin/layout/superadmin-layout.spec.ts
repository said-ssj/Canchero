import { computed, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { of } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { PlatformAdminService } from '@core/services/platform-admin.service';
import { ThemeService } from '@core/theme/theme.service';
import { SuperadminLayout } from './superadmin-layout';

describe('SuperadminLayout', () => {
  let fixture: ComponentFixture<SuperadminLayout>;
  const logout = vi.fn();
  const dashboard = vi.fn(() =>
    of({
      pendingReports: 2,
      from: '',
      to: '',
      activeVenues: 0,
      activeCourts: 0,
      bookings: 0,
      bookingsToday: 0,
      reservedGross: 0,
      paidGross: 0,
      daily: [],
      venues: [],
    }),
  );
  const themeMode = signal<'light' | 'dark' | 'system'>('light');

  beforeEach(async () => {
    vi.clearAllMocks();
    themeMode.set('light');
    await TestBed.configureTestingModule({
      imports: [SuperadminLayout],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: () => ({
              id: 'admin-1',
              nombre: 'Diana Canchero',
              email: 'diana@canchero.pe',
              rol: 'superadmin',
            }),
            logout,
          },
        },
        {
          provide: PlatformAdminService,
          useValue: {
            dashboard,
            describeError: () => 'No se pudieron cargar las notificaciones.',
          },
        },
        {
          provide: ThemeService,
          useValue: {
            mode: themeMode.asReadonly(),
            isDark: computed(() => themeMode() === 'dark'),
            set: (mode: 'light' | 'dark' | 'system') => themeMode.set(mode),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(SuperadminLayout);
    fixture.detectChanges();
  });

  it('muestra la navegación agrupada sin sedes ni canchas', () => {
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Dashboard');
    expect(text).toContain('Reportes y moderación');
    expect(text).toContain('Usuarios y permisos');
    expect(text).toContain('Pagos e ingresos');
    expect(text).toContain('Auditoría y actividad');
    expect(text).not.toContain('Sedes y canchas');
  });

  it('carga los reportes abiertos al abrir notificaciones y permite marcarlos leídos', () => {
    const bell = fixture.nativeElement.querySelector('.notification-button') as HTMLButtonElement;
    bell.click();
    fixture.detectChanges();

    expect(dashboard).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.notification-badge')?.textContent.trim()).toBe(
      '2',
    );
    expect(fixture.nativeElement.textContent).toContain('2 reportes abiertos requieren revisión.');

    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    const refresh = Array.from(buttons).find(
      (button) => button.textContent?.trim() === 'Actualizar',
    ) as HTMLButtonElement;
    refresh.click();
    fixture.detectChanges();
    expect(dashboard).toHaveBeenCalledTimes(2);

    const updatedButtons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    const markRead = Array.from(updatedButtons).find(
      (button) => button.textContent?.trim() === 'Marcar leído',
    ) as HTMLButtonElement;
    markRead.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.notification-badge')).toBeNull();
  });

  it('cierra la sesión desde el panel lateral', () => {
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    const logoutButton = Array.from(buttons).find((button) =>
      button.textContent?.includes('Cerrar sesión'),
    ) as HTMLButtonElement;
    logoutButton.click();
    expect(logout).toHaveBeenCalledOnce();
  });
});
