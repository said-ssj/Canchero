import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AdminLayout } from './admin-layout';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { CajaService } from '@core/services/caja.service';
import { PosService } from '@core/services/pos.service';

describe('AdminLayout', () => {
  let fixture: ComponentFixture<AdminLayout>;
  let component: AdminLayout;

  const mockUser = signal<any>({
    id: 1,
    nombre: 'Roberto Mendoza',
    email: 'admin@canchero.pe',
    rol: 'dueno',
  });

  const mockSedes = signal<any[]>([
    { id: 1, nombre: 'Sede Central Miraflores', activo: true },
    { id: 2, nombre: 'Sede Surco Grass', activo: true },
  ]);

  const mockCanchas = signal<any[]>([
    { id: 10, sede_id: 1, nombre: 'Cancha 1', activa: true },
    { id: 11, sede_id: 1, nombre: 'Cancha 2', activa: false },
  ]);

  const mockReservas = signal<any[]>([
    { id: 101, cancha_id: 10, estado: 'pendiente' },
    { id: 102, cancha_id: 10, estado: 'confirmada' },
  ]);

  const mockSedeOperativaId = signal<number | null>(1);
  const setSedeOperativaIdSpy = vi.fn((id: number | null) => mockSedeOperativaId.set(id));
  const logoutSpy = vi.fn();
  const tieneSesionActivaSpy = vi.fn(() => true);
  const productosStockCriticoSpy = vi.fn(() => [{ id: 1, nombre: 'Agua San Mateo' }]);

  beforeEach(async () => {
    vi.resetAllMocks();
    mockSedeOperativaId.set(1);

    await TestBed.configureTestingModule({
      imports: [AdminLayout],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            currentUser: mockUser,
            logout: logoutSpy,
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            usuarios: signal([]),
            sedes: mockSedes,
            getSedesPorDueno: () => mockSedes(),
            getCanchasPorSede: (id: number) => mockCanchas().filter((c) => c.sede_id === id),
            getReservasPorDueno: () => mockReservas(),
            sedeOperativaId: mockSedeOperativaId,
            setSedeOperativaId: setSedeOperativaIdSpy,
          },
        },
        {
          provide: CajaService,
          useValue: {
            tieneSesionActiva: tieneSesionActivaSpy,
          },
        },
        {
          provide: PosService,
          useValue: {
            productosStockCritico: productosStockCriticoSpy,
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminLayout);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.restoreAllMocks();
  });

  it('debe crearse correctamente e inicializar los 8 módulos de navegación', () => {
    expect(component).toBeTruthy();
    expect(component.navItems.length).toBe(8);

    const routes = component.navItems.map((item) => item.route);
    expect(routes).toContain('/admin/sedes');
    expect(routes).toContain('/admin/canchas');
    expect(routes).toContain('/admin/reservas');
    expect(routes).toContain('/admin/caja');
    expect(routes).toContain('/admin/pos');
    expect(routes).toContain('/admin/finanzas');
    expect(routes).toContain('/admin/personalizacion');
    expect(routes).toContain('/admin/configuracion');
  });

  it('debe alternar la barra lateral desktop y mobile', () => {
    expect(component.sidebarCollapsed()).toBe(false);
    component.toggleSidebar();
    expect(component.sidebarCollapsed()).toBe(true);
    component.toggleSidebar();
    expect(component.sidebarCollapsed()).toBe(false);

    expect(component.mobileSidebarOpen()).toBe(false);
    component.toggleMobileSidebar();
    expect(component.mobileSidebarOpen()).toBe(true);
    component.closeMobileSidebar();
    expect(component.mobileSidebarOpen()).toBe(false);
  });

  it('debe cambiar la sede operativa reactivamente al seleccionar una nueva sede', () => {
    component.seleccionarSede(2);
    expect(setSedeOperativaIdSpy).toHaveBeenCalledWith(2);

    // Valores nulos o vacíos se ignoran
    component.seleccionarSede(null);
    expect(setSedeOperativaIdSpy).toHaveBeenCalledTimes(1);
  });

  it('debe computar correctamente los datos de la sede y el estado de losas', () => {
    expect(component.sedeDelDueno()?.nombre).toBe('Sede Central Miraflores');
    expect(component.totalLosas()).toBe(2);
    expect(component.activasCount()).toBe(1);
  });

  it('debe calcular los contadores de notificaciones y turnos de caja', () => {
    expect(component.pendientesCount()).toBe(1);
    expect(component.pendientesBadgeText()).toBe('1');
    expect(component.cajaAbierta()).toBe(true);
    expect(component.stockCriticoCount()).toBe(1);
  });

  it('debe calcular correctamente las iniciales del usuario administrador', () => {
    expect(component.initials('Roberto Mendoza')).toBe('RM');
    expect(component.initials('Carlos')).toBe('CA');
    expect(component.initials(null)).toBe('AD');
    expect(component.initials('')).toBe('AD');
  });

  it('debe abrir y cerrar los modales de privacidad y ayuda', () => {
    expect(component.adminModalPrivacidadOpen()).toBe(false);
    expect(component.adminModalAyudaOpen()).toBe(false);

    component.abrirPrivacidadAdmin();
    expect(component.adminModalPrivacidadOpen()).toBe(true);

    component.cerrarModalesAdmin();
    expect(component.adminModalPrivacidadOpen()).toBe(false);

    component.abrirAyudaAdmin();
    expect(component.adminModalAyudaOpen()).toBe(true);

    component.cerrarModalesAdmin();
    expect(component.adminModalAyudaOpen()).toBe(false);
  });

  it('debe alternar el modo oscuro reactivamente', () => {
    const initial = component.isDarkMode();
    component.toggleDarkMode();
    expect(component.isDarkMode()).toBe(!initial);
    component.toggleDarkMode();
    expect(component.isDarkMode()).toBe(initial);
  });

  it('debe cerrar sesión a través del servicio de autenticación', () => {
    component.cerrarSesionAdmin();
    expect(logoutSpy).toHaveBeenCalledTimes(1);
  });

  it('debe abrir la página pública en una nueva pestaña', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    component.abrirPaginaPublica();
    expect(openSpy).toHaveBeenCalledWith('/sedes/1', '_blank', 'noopener,noreferrer');
  });

  it('debe mostrar el toast global y escuchar eventos notice de componentes hijos', () => {
    component.mostrarToast('Prueba de notificación');
    expect(component.toastVisible()).toBe(true);
    expect(component.toastMessage()).toBe('Prueba de notificación');

    const mockChildComponent = {
      notice: {
        subscribe: (cb: (msg: string) => void) => {
          cb('Notificación desde módulo hijo');
          return { unsubscribe: vi.fn() };
        },
      },
    };

    component.onActivate(mockChildComponent);
    expect(component.toastVisible()).toBe(true);
    expect(component.toastMessage()).toBe('Notificación desde módulo hijo');

    component.onDeactivate();
  });
});
