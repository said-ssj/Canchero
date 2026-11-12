import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { CajaService } from './caja.service';
import { PosService } from './pos.service';

vi.mock('@core/supabase/client', () => ({
  supabase: {
    getChannels: () => [],
    channel: () => {
      const channel = { on: () => channel, subscribe: () => channel };
      return channel;
    },
  },
}));

describe('Errores de conexión del POS', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { currentUser: signal({ id: 'owner' }) } },
        {
          provide: DatabaseService,
          useValue: { sedeOperativaId: signal(54), getSedeOperativaId: () => 54 },
        },
        { provide: CajaService, useValue: {} },
      ],
    });
    const pos = TestBed.inject(PosService);
    TestBed.tick();
    return { pos, http: TestBed.inject(HttpTestingController) };
  }
  it('muestra un error cuando falla el historial aunque el catálogo responda', async () => {
    const { pos, http } = setup();
    for (const request of http.match(() => true)) {
      if (request.request.url.includes('/sales?'))
        request.flush({}, { status: 503, statusText: 'Unavailable' });
      else if (request.request.url.includes('/payment-capabilities?'))
        request.flush({ ready: true });
      else request.flush([]);
    }
    await vi.waitFor(() => expect(pos.loading()).toBe(false));
    expect(pos.loadError()).toContain('No se pudo cargar');
    expect(pos.paymentsReady()).toBe(false);
    http.verify();
  });
  it('no habilita el cobro si falla la consulta de capacidades', async () => {
    const { pos, http } = setup();
    for (const request of http.match(() => true)) {
      if (request.request.url.includes('/payment-capabilities?'))
        request.flush({}, { status: 503, statusText: 'Unavailable' });
      else request.flush([]);
    }
    await vi.waitFor(() => expect(pos.loading()).toBe(false));
    expect(pos.paymentsReady()).toBe(false);
    http.verify();
  });
});
