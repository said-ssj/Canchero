import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { PlayerProfilePage } from './player-profile';
describe('Formulario de primer acceso', () => {
  async function setup(acceso = 'google', initialName = '', initialHandle: string | null = null) {
    const profile = {
      nombre: initialName,
      apellido: '',
      handle: initialHandle,
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
  it('suggests the Google name without accents and selects it for replacement', async () => {
    const { fixture, page } = await setup('google', 'Álvaro Alejandro');
    const field = fixture.nativeElement.querySelector('input[name=handle]') as HTMLInputElement;
    expect(page.profile.handle).toBe('alvaroalejandro');
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
  });
  it('updates the suggestion while entering the name but never replaces a manual handle or a deliberate blank', async () => {
    const { fixture, page, auth } = await setup('registro');
    page.updateName('María José');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const field = fixture.nativeElement.querySelector('input[name=handle]') as HTMLInputElement;
    field.focus();
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(field.value.length);
    expect(page.profile.handle).toBe('mariajose');
    page.updateHandle('mi_usuario');
    page.updateName('María Josefina');
    expect(page.profile.handle).toBe('mi_usuario');
    page.updateHandle('');
    page.updateName('María');
    page.profile.apellido = 'Pérez';
    await page.save();
    expect(auth.savePlayerProfile).not.toHaveBeenCalled();
    expect(page.error()).toContain('identificador @');
  });
  it('preserves an already registered handle instead of suggesting another', async () => {
    const { page } = await setup('inicio', 'Nombre', 'identificador_existente');
    page.updateName('Otro nombre');
    expect(page.profile.handle).toBe('identificador_existente');
    expect(page.handleLocked()).toBe(true);
  });
});
