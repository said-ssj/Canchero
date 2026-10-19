import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('AuthService requires server authentication', () => {
  const owner = { id: 'real-owner-uuid', nombre: 'Dueno', email: 'dueno@canchero.pe', rol: 'dueno' };
  let http: HttpTestingController;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => { http.verify(); vi.useRealTimers(); localStorage.clear(); });

  it('discards demo sessions without deleting venue drafts', async () => {
    localStorage.setItem('canchero_demo_user', JSON.stringify({ id: 'owner-1', rol: 'dueno' }));
    localStorage.setItem('canchero_canchas_locales', 'preserve');
    const auth = TestBed.inject(AuthService);
    await auth.ready;
    expect(auth.currentUser()).toBeNull();
    expect(localStorage.getItem('canchero_demo_user')).toBeNull();
    expect(localStorage.getItem('canchero_canchas_locales')).toBe('preserve');
  });

  it('does not trust the cached owner before server validation', async () => {
    localStorage.setItem('canchero_auth_session', JSON.stringify({ token: 'test-token', user: owner }));
    const auth = TestBed.inject(AuthService);
    expect(auth.isOwner()).toBe(false);
    http.expectOne(r => r.url.endsWith('/auth/me')).flush(owner);
    await auth.ready;
    expect(auth.currentUser()?.id).toBe(owner.id);
    expect(auth.isOwner()).toBe(true);
  });

  for (const status of [401, 503, 0]) {
    it(`denies access when validation fails (${status}) without deleting recoverable credentials`, async () => {
      localStorage.setItem('canchero_auth_session', JSON.stringify({ token: 'test-token', user: owner }));
      const auth = TestBed.inject(AuthService);
      http.expectOne(r => r.url.endsWith('/auth/me')).flush(null, { status, statusText: 'Unavailable' });
      await auth.ready;
      expect(auth.currentUser()).toBeNull();
      expect(auth.authToken()).toBe(status === 401 ? null : 'test-token');
    });
  }

  for (const email of ['dueno@canchero.pe', 'admin@canchero.pe', 'admin', 'otro-admin@example.test']) {
    it(`requires credentials for ${email} without a demo fallback`, () => {
      const auth = TestBed.inject(AuthService);
      let result: unknown = 'pending';
      auth.login(email, 'incorrect-test-password').subscribe(user => result = user);
      const request = http.expectOne(r => r.url.endsWith('/auth/login'));
      expect(request.request.body.email).toBe(email);
      request.flush(null, { status: 401, statusText: 'Unauthorized' });
      expect(result).toBeNull();
      expect(auth.isOwner()).toBe(false);
      expect(auth.authToken()).toBeNull();
    });
  }

  it('keeps the authenticated database UUID, not owner-1', () => {
    const auth = TestBed.inject(AuthService);
    auth.login(' DUENO@CANCHERO.PE ', 'test-password').subscribe();
    const request = http.expectOne(r => r.url.endsWith('/auth/login'));
    expect(request.request.body.email).toBe(owner.email);
    request.flush({ token: 'test-token', user: owner });
    expect(auth.currentUser()?.id).toBe(owner.id);
  });

  it('does not infer owner privileges from an email', () => {
    const auth = TestBed.inject(AuthService);
    auth.login(owner.email, 'test-password').subscribe();
    http.expectOne(r => r.url.endsWith('/auth/login')).flush({ token: 'test-token', user: { ...owner, rol: 'cliente' } });
    expect(auth.isLoggedIn()).toBe(true);
    expect(auth.isOwner()).toBe(false);
  });

  it('does not resurrect a session after it was closed during validation', async () => {
    localStorage.setItem('canchero_auth_session', JSON.stringify({ token: 'test-token', user: owner }));
    const auth = TestBed.inject(AuthService);
    const request = http.expectOne(r => r.url.endsWith('/auth/me'));
    auth.clearSession();
    request.flush(owner);
    await auth.ready;
    expect(auth.currentUser()).toBeNull();
  });

  it('restores with the real interceptor without circular injection', async () => {
    localStorage.setItem('canchero_auth_session', JSON.stringify({token: 'test-token', user: owner, rememberMe: true}));
    const auth = TestBed.inject(AuthService);
    http.expectOne(r => r.url.endsWith('/auth/me')).flush(owner);
    await auth.ready;
    expect(auth.isOwner()).toBe(true);
    expect(auth.restoring()).toBe(false);
  });

  it('keeps remembered sessions after fifteen minutes but requires server validation', async () => {
    localStorage.setItem('canchero_auth_session', JSON.stringify({token:'test-token',user:owner,rememberMe:true,lastActivityAt:Date.now()-3_600_000}));
    const auth=TestBed.inject(AuthService);
    expect(auth.currentUser()).toBeNull();
    http.expectOne(r=>r.url.endsWith('/auth/me')).flush(owner);
    await auth.ready;
    expect(auth.isLoggedIn()).toBe(true);
  });

  it('expires an unchecked session after fifteen minutes without requests', async () => {
    vi.useFakeTimers();
    const auth=TestBed.inject(AuthService);
    auth.login(owner.email,'test-password',false).subscribe();
    const req=http.expectOne(r=>r.url.endsWith('/auth/login'));
    expect(req.request.body.rememberMe).toBe(false);
    req.flush({token:'test-token',user:owner});
    await vi.advanceTimersByTimeAsync(15*60*1000);
    expect(auth.currentUser()).toBeNull();
    expect(auth.authToken()).toBeNull();
  });

  it('rejects an already idle-expired session on reload before calling the API', async () => {
    localStorage.setItem('canchero_auth_session',JSON.stringify({token:'test-token',user:owner,rememberMe:false,lastActivityAt:Date.now()-15*60*1000}));
    const auth=TestBed.inject(AuthService);
    await auth.ready;
    http.expectNone(r=>r.url.endsWith('/auth/me'));
    expect(auth.authToken()).toBeNull();
  });

  it('counts a validated return to the page as activity and renews the short token', async () => {
    vi.useFakeTimers();
    localStorage.setItem('canchero_auth_session',JSON.stringify({token:'test-token',user:owner,rememberMe:false,lastActivityAt:Date.now()-10*60*1000}));
    const auth=TestBed.inject(AuthService);
    http.expectOne(r=>r.url.endsWith('/auth/me')).flush(owner);
    await auth.ready;
    http.expectOne(r=>r.url.endsWith('/auth/refresh')).flush({token:'renewed-token',user:owner});
    await Promise.resolve();
    expect(auth.authToken()).toBe('renewed-token');
    await vi.advanceTimersByTimeAsync(14*60*1000);
    expect(auth.isLoggedIn()).toBe(true);
    await vi.advanceTimersByTimeAsync(60*1000);
    expect(auth.isLoggedIn()).toBe(false);
  });

  it('renews only an active unchecked session and does not use polling as activity', async () => {
    vi.useFakeTimers();
    const auth=TestBed.inject(AuthService);
    auth.login(owner.email,'test-password',false).subscribe();
    http.expectOne(r=>r.url.endsWith('/auth/login')).flush({token:'test-token',user:owner});
    await vi.advanceTimersByTimeAsync(61_000);
    window.dispatchEvent(new KeyboardEvent('keydown'));
    http.expectOne(r=>r.url.endsWith('/auth/refresh')).flush({token:'renewed-token',user:owner});
    await Promise.resolve();
    expect(auth.authToken()).toBe('renewed-token');
    await vi.advanceTimersByTimeAsync(15*60*1000);
    expect(auth.authToken()).toBeNull();
  });
});
