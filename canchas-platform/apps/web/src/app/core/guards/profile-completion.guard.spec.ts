import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { profileCompletionGuard } from './profile-completion.guard';
describe('Primer acceso', () => {
  function setup(result: any) {
    const user = signal<any>({ id: 'cuenta' }),
      loadPlayerProfile = vi.fn(() => result);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: {
            ready: Promise.resolve(),
            user,
            playerProfile: () => null,
            loadPlayerProfile,
          },
        },
      ],
    });
    return { user, loadPlayerProfile };
  }
  async function run(url: string) {
    return await TestBed.runInInjectionContext(() =>
      profileCompletionGuard({} as any, { url } as any),
    );
  }
  it('requires completing the same form after either registration method and after a refresh', async () => {
    const { loadPlayerProfile } = setup(of({ completo: false, handle: null }));
    const result = await run('/mensajes');
    expect(TestBed.inject(Router).serializeUrl(result as any)).toContain(
      '/perfil?acceso=inicio&regreso=%2Fmensajes',
    );
    expect(loadPlayerProfile).toHaveBeenCalledWith(true);
  });
  it('never treats an API failure as a complete profile', async () => {
    setup(throwError(() => new Error('offline')));
    const result = await run('/admin/sedes');
    expect(TestBed.inject(Router).serializeUrl(result as any)).toContain('/perfil?');
  });
  it('allows complete accounts, guests and payment returns without a redirect loop', async () => {
    const { user, loadPlayerProfile } = setup(of({ completo: true, handle: 'real' }));
    expect(await run('/itinerario')).toBe(true);
    user.set(null);
    expect(await run('/sedes')).toBe(true);
    expect(await run('/perfil?acceso=google')).toBe(true);
    expect(await run('/pago/resultado')).toBe(true);
    expect(loadPlayerProfile).toHaveBeenCalledTimes(1);
  });
});
