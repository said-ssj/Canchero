import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { PlayerProfilePage } from './player-profile';
describe('Formulario de primer acceso', () => {
  async function setup(acceso = 'google') {
    const profile = {
      nombre: '',
      apellido: '',
      handle: null,
      completo: false,
      telefono: null,
      direccion: null,
      foto: null,
      idDistrito: null,
    };
    const user = signal({ id: 'me', email: 'persona@example.test' });
    const auth = {
      ready: Promise.resolve(),
      user,
      isLoggedIn: () => true,
      isOwner: () => false,
      loadPlayerProfile: vi.fn(() => of(profile)),
      savePlayerProfile: vi.fn((data: any) => of({ ...data, completo: true })),
    };
    TestBed.configureTestingModule({
      imports: [PlayerProfilePage],
      providers: [
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(acceso ? { acceso } : {}) } },
        },
        { provide: AuthService, useValue: auth },
        { provide: HttpClient, useValue: { get: () => of([]) } },
      ],
    });
    const router = TestBed.inject(Router),
      navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = TestBed.createComponent(PlayerProfilePage);
    fixture.detectChanges();
    await vi.waitFor(() => expect((fixture.componentInstance as any).loading()).toBe(false));
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, page: fixture.componentInstance as any, auth, navigate };
  }
  it('requires names, surnames and a handle while leaving photo phone and location optional', async () => {
    const { fixture, page, auth, navigate } = await setup();
    const submit = () =>
      fixture.nativeElement.querySelector('button[type=submit]') as HTMLButtonElement;
    expect(submit().disabled).toBe(true);
    for (const [name, value] of [
      ['nombre', 'Alvaro Alejandro'],
      ['apellido', 'Apellidos completos'],
      ['handle', 'alvaro_jugador'],
    ]) {
      const field = fixture.nativeElement.querySelector(`input[name=${name}]`) as HTMLInputElement;
      field.value = value;
      field.dispatchEvent(new Event('input'));
    }
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(submit().disabled).toBe(false);
    await page.save();
    expect(auth.savePlayerProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        nombre: 'Alvaro Alejandro',
        apellido: 'Apellidos completos',
        handle: 'alvaro_jugador',
        idDistrito: null,
      }),
    );
    expect(navigate).toHaveBeenCalledWith('/itinerario', { replaceUrl: true });
  });
  it('also opens the form after refresh and preserves all input if the handle is taken', async () => {
    const { fixture, page, auth, navigate } = await setup('');
    expect(page.firstAccess).toBe(true);
    page.profile = { ...page.profile, nombre: 'Nombres', apellido: 'Apellidos', handle: 'ocupado' };
    auth.savePlayerProfile.mockReturnValueOnce(
      throwError(() => ({ error: { message: 'Ese identificador ya está ocupado' } })) as any,
    );
    await page.save();
    fixture.detectChanges();
    expect(page.error()).toContain('ocupado');
    expect(page.profile.nombre).toBe('Nombres');
    expect(navigate).not.toHaveBeenCalled();
  });
});
