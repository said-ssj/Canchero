import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { Recuperar } from './recuperar';

describe('Recuperar', () => {
  function setup(token: string | null) {
    const auth = {
      requestPasswordReset: vi.fn(() =>
        of({ message: 'Si el correo tiene una cuenta, te enviamos un enlace.' }),
      ),
      resetPassword: vi.fn(() => of({ message: 'Contraseña actualizada.' })),
    };
    TestBed.configureTestingModule({
      imports: [Recuperar],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(token ? { token } : {}) } },
        },
      ],
    });
    const fixture = TestBed.createComponent(Recuperar);
    fixture.detectChanges();
    return { fixture, auth, c: fixture.componentInstance as any };
  }

  it('sin token pide el enlace por correo y muestra la respuesta genérica', async () => {
    const { fixture, auth, c } = setup(null);
    c.email.set('jugador@test.pe');
    await c.pedirEnlace();
    fixture.detectChanges();
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('jugador@test.pe');
    expect(fixture.nativeElement.textContent).toContain('te enviamos un enlace');
  });

  it('con token no envía si las contraseñas no coinciden', async () => {
    const { auth, c } = setup('abc');
    c.password.set('clave-segura-1');
    c.confirm.set('clave-segura-2');
    await c.cambiarClave();
    expect(auth.resetPassword).not.toHaveBeenCalled();
    expect(c.error()).toContain('no coinciden');
    c.confirm.set('clave-segura-1');
    await c.cambiarClave();
    expect(auth.resetPassword).toHaveBeenCalledWith('abc', 'clave-segura-1');
  });
});
