import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { CajaService } from './caja.service';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';

describe('Caja server confirmation', () => {
  let service: CajaService;
  let http: HttpTestingController;
  const user = signal<{id: string} | null>({ id: 'owner' });
  const venue = signal(1);
  const session = { id: 10, sedeId: 1, cajaId: 1, cajaNombre: 'Caja', cajeroNombre: 'Titular', cajeroEmail: '', fechaApertura: '', montoApertura: 100, estado: 'abierta' };
  beforeEach(async () => {
    user.set({ id: 'owner' }); venue.set(1);
    vi.spyOn(CajaService.prototype as any, 'setupRealtimeSubscriptions').mockImplementation(() => {});
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: DatabaseService, useValue: { sedeOperativaId: venue, getSedeOperativaId: () => venue() } },
    ] });
    service = TestBed.inject(CajaService); http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne(r => r.url.endsWith('/cash/venues/1/state')).flush({ cajas: [], sesion: session, movimientos: [], arqueos: [], pagosListos: true,
      balance: { sesionId: 10, pagosEfectivo: 0, pagosDigital: 20, montoSistema: 100 } });
    await vi.waitFor(() => expect(service.loading()).toBe(false));
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  it.each([401, 403, 409, 500])('never closes locally on HTTP %s or retries through another service', async status => {
    const operation = service.cerrarTurnoConArqueo({ 2: 1 });
    const rejected = expect(operation).rejects.toMatchObject({ status });
    const request = http.expectOne(r => r.method === 'PATCH');
    expect(service.sesionActiva()?.id).toBe(10);
    expect(service.historialArqueos()).toHaveLength(0);
    request.flush({ message: 'No guardado' }, { status, statusText: 'Rejected' });
    await rejected;
    expect(service.sesionActiva()?.id).toBe(10);
    expect(service.historialArqueos()).toHaveLength(0);
    http.expectNone(r => r.method === 'POST');
  });

  it('does not create a manual movement until the server confirms its id', async () => {
    const operation = service.registrarMovimiento('ingreso', 20, 'Fondo adicional');
    const rejected = expect(operation).rejects.toMatchObject({ status: 403 });
    expect(service.movimientos()).toHaveLength(0);
    http.expectOne(r => r.method === 'POST').flush({}, { status: 403, statusText: 'Forbidden' });
    await rejected;
    expect(service.movimientos()).toHaveLength(0);
  });

  it('ignores a confirmed closure after switching owner', async () => {
    const operation = service.cerrarTurnoConArqueo({2: 1});
    const rejected = expect(operation).rejects.toThrow('contexto anterior');
    const request = http.expectOne(r => r.method === 'PATCH');
    user.set({ id: 'other-owner' });
    request.flush({ id: 'saved', sesionId: 10, montoSistema: 100, diferencia: 0 });
    await rejected;
    expect(service.historialArqueos()).toHaveLength(0);
    // Flush the new owner's read caused by the context change, never any fallback write.
    TestBed.tick();
    http.match(r => r.method === 'GET').forEach(r => r.flush({ cajas: [], sesion: null, movimientos: [], arqueos: [] }));
  });
});
