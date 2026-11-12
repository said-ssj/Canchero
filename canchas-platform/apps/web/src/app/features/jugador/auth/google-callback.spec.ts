import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { googleOAuthClient } from '@core/supabase/client';
import { environment } from '@env/environment';
import { GoogleCallback } from './google-callback';

describe('GoogleCallback con el botón de Google Identity Services', () => {
  const enabled = environment.googleAuthEnabled;
  beforeEach(() => ((environment as { googleAuthEnabled: boolean }).googleAuthEnabled = true));
  afterEach(() => ((environment as { googleAuthEnabled: boolean }).googleAuthEnabled = enabled));

  it('usa la sesión guardada por el login cuando no llega código en la URL', async () => {
    vi.spyOn(googleOAuthClient().auth, 'signOut').mockResolvedValue({ error: null });
    vi.spyOn(googleOAuthClient().auth, 'getSession').mockResolvedValue({
      data: {
        session: {
          access_token: 'token-supabase',
          user: { id: 'u1', user_metadata: { picture: 'https://foto/1.jpg' } },
        },
      },
    } as any);
    const exchangeGoogle = vi.fn(() => of({ id: 'u1' }));
    sessionStorage.setItem(
      'canchero-google-pending',
      JSON.stringify({ remember: false, returnUrl: '/sedes' }),
    );
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { exchangeGoogle, isOwner: () => false } },
      ],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);

    const fixture = TestBed.createComponent(GoogleCallback);
    fixture.detectChanges();
    await vi.waitFor(() => expect(exchangeGoogle).toHaveBeenCalled());

    expect(exchangeGoogle).toHaveBeenCalledWith('token-supabase', false, undefined);
    expect(navigate).toHaveBeenCalledWith(['/perfil'], {
      queryParams: { acceso: 'google', regreso: '/sedes' },
      replaceUrl: true,
    });
    expect(localStorage.getItem('canchero_user_avatar_u1')).toBe('https://foto/1.jpg');
  });
});
