import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { authGuard } from './auth.guard';

describe('Admin authentication guard', () => {
  it('waits for server validation without a 500ms bypass', async () => {
    let complete!: () => void;
    let validated = false;
    const validation = new Promise<boolean>(resolve => { complete = () => { validated = true; resolve(true); }; });
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: {
      validateSession: () => validation, isOwner: () => validated, currentUser: () => null,
    } }] });
    const guard = TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    complete();
    expect(await guard).toBe(true);
  });

  it('redirects to login when the server cannot validate the session', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: {
      validateSession: async () => false, isOwner: () => false, currentUser: () => null,
    } }] });
    const result = await TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(TestBed.inject(Router).serializeUrl(result as any)).toBe('/login');
  });

  it('does not allow an authenticated player into the owner panel', async () => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: AuthService, useValue: {
      validateSession: async () => true, isOwner: () => false, currentUser: () => ({ rol: 'cliente' }),
    } }] });
    const result = await TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));
    expect(TestBed.inject(Router).serializeUrl(result as any)).toBe('/');
  });
});
