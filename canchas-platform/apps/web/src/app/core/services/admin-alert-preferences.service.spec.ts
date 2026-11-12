import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AuthService } from '@core/auth/auth.service';
import { AdminAlertPreferences } from './admin-alert-preferences.service';

describe('Preferencias de campana', () => {
  it('filtra solo la cuenta y sede elegidas y no hereda preferencias globales', () => {
    localStorage.clear();
    localStorage.setItem('canchero_pref_alertas', '{"pagos":false}');
    const user = signal<any>({ id: 'owner-one' });
    TestBed.configureTestingModule({
      providers: [{ provide: AuthService, useValue: { currentUser: user } }],
    });
    const prefs = TestBed.inject(AdminAlertPreferences);
    expect(prefs.get(54)['pagos']).toBe(true);
    expect(prefs.set(54, 'pagos', false)).toBe(true);
    expect(prefs.get(54)['pagos']).toBe(false);
    expect(prefs.get(55)['pagos']).toBe(true);
    user.set({ id: 'owner-two' });
    expect(prefs.get(54)['pagos']).toBe(true);
    expect(prefs.set(54, 'contacto', true)).toBe(false);
    user.set(null);
    expect(prefs.set(54, 'stock', false)).toBe(false);
    localStorage.clear();
  });
});
