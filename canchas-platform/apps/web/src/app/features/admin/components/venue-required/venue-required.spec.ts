import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AdminContext } from '../../admin-context.service';
import { DatabaseService } from '@core/supabase/database.service';
import { AdminVenueRequired } from './venue-required';

describe('AdminVenueRequired', () => {
  function setup(signedOut: boolean) {
    const loading = signal(false);
    const refresh = vi.fn();
    TestBed.configureTestingModule({
      imports: [AdminVenueRequired],
      providers: [
        provideRouter([]),
        { provide: AdminContext, useValue: {
          ownerId: signal(signedOut ? '' : 'owner-a'), loading,
        } },
        { provide: DatabaseService, useValue: { refreshCatalogo: refresh } },
      ],
    });
    const fixture = TestBed.createComponent(AdminVenueRequired);
    fixture.componentRef.setInput('title', 'Personalización & QR');
    fixture.componentRef.setInput('description', 'Datos de la sede');
    fixture.detectChanges();
    return { fixture, loading, refresh, element: fixture.nativeElement as HTMLElement };
  }

  it('keeps a page heading and offers login when signed out', () => {
    const { element } = setup(true);
    expect(element.querySelector('h1')?.textContent).toBe('Personalización & QR');
    expect(element.textContent).toContain('Inicia sesión');
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/login');
  });

  it('offers owned venues and a real catalog retry for a real account', () => {
    const { element, refresh } = setup(false);
    expect(element.querySelector('a')?.getAttribute('href')).toBe('/admin/sedes');
    element.querySelector('button')?.click();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('disables retry while the catalog is loading', () => {
    const { fixture, element, loading, refresh } = setup(true);
    loading.set(true);
    fixture.detectChanges();
    const button = element.querySelector('button')!;
    expect(button.disabled).toBe(true);
    button.click();
    expect(refresh).not.toHaveBeenCalled();
  });
});
