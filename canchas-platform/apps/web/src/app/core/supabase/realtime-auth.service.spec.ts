import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { RealtimeAuthService } from './realtime-auth.service';

describe('Realtime JWT exchange', () => {
  let session: string | null;
  let user: ReturnType<typeof signal<{ id: string } | null>>;
  let service: RealtimeAuthService;
  let http: HttpTestingController;
  beforeEach(() => {
    session = 'canchero.v1.signed-session';
    user = signal<{ id: string } | null>({ id: 'player-one' });
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: AuthService,
          useValue: { ready: Promise.resolve(), user, authToken: () => session },
        },
      ],
    });
    service = TestBed.inject(RealtimeAuthService);
    http = TestBed.inject(HttpTestingController);
    TestBed.tick();
  });
  afterEach(() => http.verify());
  const response = () => ({
    accessToken: 'real.signed.jwt',
    expiresAt: Math.floor(Date.now() / 1000) + 300,
    userId: 'player-one',
  });

  it('exchanges the application session and deduplicates concurrent requests', async () => {
    const first = service.accessToken();
    const second = service.accessToken();
    await Promise.resolve();
    const request = http.expectOne((r) => r.url.endsWith('/auth/realtime-token'));
    expect(request.request.headers.get('Authorization')).toBe(`Bearer ${session}`);
    expect(request.request.body).toEqual({});
    request.flush(response());
    expect(await first).toBe('real.signed.jwt');
    expect(await second).toBe('real.signed.jwt');
    expect(await service.accessToken()).toBe('real.signed.jwt');
    http.expectNone((r) => r.url.endsWith('/auth/realtime-token'));
  });
  it('does not reuse a response after logout or account change', async () => {
    const request = service.accessToken();
    const rejected = expect(request).rejects.toThrow('La sesión cambió');
    await Promise.resolve();
    session = null;
    user.set(null);
    http.expectOne((r) => r.url.endsWith('/auth/realtime-token')).flush(response());
    await rejected;
    await expect(service.accessToken()).rejects.toThrow('Inicia sesión');
  });
  it('refuses a credential for a different user', async () => {
    const request = service.accessToken();
    const rejected = expect(request).rejects.toThrow('La sesión cambió');
    await Promise.resolve();
    http
      .expectOne((r) => r.url.endsWith('/auth/realtime-token'))
      .flush({ ...response(), userId: 'another-player' });
    await rejected;
  });
  it('initializes the JWT before returning a private channel', async () => {
    const setAuth = vi
      .spyOn((service as any).client.realtime, 'setAuth')
      .mockResolvedValue(undefined);
    const pending = service.privateChannel('chat-user:player-one');
    await Promise.resolve();
    http.expectOne((r) => r.url.endsWith('/auth/realtime-token')).flush(response());
    const channel = await pending;
    expect(setAuth).toHaveBeenCalledWith('real.signed.jwt');
    expect(channel.private).toBe(true);
  });
});
