import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { routes } from '../../app.routes';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { CajaService } from '@core/services/caja.service';
import { PosService } from '@core/services/pos.service';
describe('Admin child route integration', () => {
  const selected = signal<number | null>(null);
  const loading = signal(false);
  const venues = [
    { id: 1, nombre: 'Sede Uno', direccion: 'Direccion Uno', fotos: [], descripcion: 'Historia Uno', canchas: [] },
    { id: 2, nombre: 'Sede Dos', direccion: 'Direccion Dos', fotos: [], descripcion: 'Historia Dos', canchas: [] },
  ];
  const ownedVenues = signal(venues);
  const currentUser = signal({ id: 'owner-a', nombre: 'Dueno', email: 'owner@example.test' });
  const db = {
    catalogLoading: loading, loadErrors: signal<string[]>([]), sedeOperativaId: selected,
    setSedeOperativaId: (id: number | null) => selected.set(id),
    getSedesPorDueno: () => ownedVenues(), getCanchasPorSede: () => [], getCanchasPorDueno: () => [],
    getReservasPorDueno: () => [], getPagosPorDueno: () => [],
    sedes: signal(venues), canchas: signal([]), reservas: signal([]), pagos: signal([]), usuarios: signal([]),
  };

  beforeEach(async () => {
    ownedVenues.set(venues);
    currentUser.set({ id: 'owner-a', nombre: 'Dueno', email: 'owner@example.test' });
    selected.set(null);
    loading.set(false);
    const admin = routes.find(route => route.path === 'admin')!;
    await TestBed.configureTestingModule({ providers: [
      provideRouter([{ ...admin, canActivate: [], canActivateChild: [] }]),
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { currentUser } },
      { provide: DatabaseService, useValue: db },
      { provide: CajaService, useValue: {
        loading: signal(false), loadError: signal('Caja sin conexion'), sesionActiva: signal(null),
        tieneSesionActiva: () => false,
      } },
      { provide: PosService, useValue: {
        loading: signal(false), loadError: signal('Inventario sin conexion'), productosStockCritico: () => [],
      } },
    ] }).compileComponents();
  });

  it('opens each of the eight child routes directly without missing required inputs', async () => {
    const harness = await RouterTestingHarness.create();
    for (const page of ['sedes', 'canchas', 'reservas', 'caja', 'pos', 'finanzas', 'personalizacion', 'configuracion']) {
      await harness.navigateByUrl('/admin/' + page);
      harness.detectChanges();
      expect(harness.routeNativeElement?.querySelector('app-admin-' + page)).not.toBeNull();
    }
    expect(selected()).toBe(1);
  }, 15000);

  it('shares the selected venue across routed finance, personalization and settings', async () => {
    const harness = await RouterTestingHarness.create('/admin/finanzas');
    selected.set(2);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-admin-finanzas')?.textContent).toContain('Sede Dos');
    await harness.navigateByUrl('/admin/personalizacion');
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-admin-personalizacion')?.textContent).toContain('Sede Dos');
    await harness.navigateByUrl('/admin/configuracion');
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-admin-configuracion')?.textContent).toContain('Sede Dos');
  });

  it('shows an actionable state for an authenticated owner without venues', async () => {
    ownedVenues.set([]);
    TestBed.inject(CajaService).loadError.set('');
    const harness = await RouterTestingHarness.create();
    for (const page of ['caja', 'finanzas', 'personalizacion']) {
      await harness.navigateByUrl('/admin/' + page);
      harness.detectChanges();
      const state = harness.routeNativeElement?.querySelector('app-admin-venue-required');
      expect(state?.querySelector('h1')).not.toBeNull();
      expect(state?.textContent).toContain('No hay una sede disponible');
      expect(state?.querySelector('a')?.getAttribute('href')).toBe('/admin/sedes');
    }
  });

  it('replaces the finance empty state when the owned catalog arrives later', async () => {
    ownedVenues.set([]);
    const harness = await RouterTestingHarness.create('/admin/finanzas');
    expect(harness.routeNativeElement?.querySelector('app-admin-venue-required')).not.toBeNull();
    ownedVenues.set(venues);
    harness.detectChanges();
    expect(harness.routeNativeElement?.querySelector('app-admin-venue-required')).toBeNull();
    expect(harness.routeNativeElement?.querySelector('app-admin-finanzas')?.textContent).toContain('Sede Uno');
  });
});
