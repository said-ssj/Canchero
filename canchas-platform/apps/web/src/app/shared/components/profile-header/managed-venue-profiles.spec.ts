import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { ManagedVenueProfiles } from './managed-venue-profiles';

describe('Perfiles de sede de la cuenta', () => {
  it('excluye sedes ajenas y borradores y limpia el selector al cerrar sesión', () => {
    const user = signal<{ id: string } | null>({ id: 'owner-a' });
    TestBed.configureTestingModule({
      imports: [ManagedVenueProfiles],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user, isOwner: () => !!user() } },
        {
          provide: DatabaseService,
          useValue: {
            catalogLoading: signal(false),
            catalogError: signal(false),
            sedeOperativaId: signal(2),
            sedes: signal([
              { id: 1, nombre: 'Sede de A', activo: true },
              { id: 2, nombre: 'Sede ajena', activo: true },
            ]),
            getSedesPorDueno: (id: string) =>
              id === 'owner-a' ? [{ id: 1 }, { id: 99, nombre: 'Borrador local' }] : [],
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ManagedVenueProfiles);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(
      [...element.querySelectorAll('option')].map((option) => option.textContent?.trim()),
    ).toEqual(['Sede de A']);
    expect(element.querySelector('a.btn')?.getAttribute('href')).toBe('/sedes/1');
    user.set(null);
    fixture.detectChanges();
    expect(element.querySelector('select')).toBeNull();
    expect(element.querySelector('a.btn')).toBeNull();
  });
});
