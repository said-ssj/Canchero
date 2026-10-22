import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { AdminContext } from './admin-context.service';

describe('AdminContext shared route state', () => {
  const user = signal<{ id: string } | null>(null);
  const selected = signal<number | null>(null);
  const venues = signal<any[]>([]);
  const loading = signal(false);
  const errors = signal<string[]>([]);
  let context: AdminContext;
  beforeEach(() => {
    user.set({ id: 'owner-a' }); selected.set(null); loading.set(false); errors.set([]);
    venues.set([{ id: 1, id_dueno: 'owner-a' }, { id: 2, id_dueno: 'owner-a' }, { id: 3, id_dueno: 'owner-b' }]);
    TestBed.configureTestingModule({ providers: [
      { provide: AuthService, useValue: { currentUser: user } },
      { provide: DatabaseService, useValue: {
        sedeOperativaId: selected, setSedeOperativaId: (id: number) => selected.set(id),
        getSedesPorDueno: (id: string) => venues().filter(venue => venue.id_dueno === id),
        getCanchasPorSede: (id: number) => [{ id: id * 10, sede_id: id }],
        catalogLoading: loading, loadErrors: errors,
      } },
    ] });
    context = TestBed.inject(AdminContext);
  });
  it('selects the same owned venue for every page after an asynchronous catalog load', () => {
    venues.set([]); expect(context.venue()).toBeUndefined();
    venues.set([{ id: 2, id_dueno: 'owner-a' }]);
    expect(context.venue()?.id).toBe(2);
    expect(context.courts()[0].sede_id).toBe(2);
  });
  it('propagates selection and ignores another owners venue', () => {
    context.selectVenue(2);
    expect(context.venue()?.id).toBe(2);
    context.selectVenue(3);
    expect(selected()).toBe(2);
    user.set({ id: 'owner-b' });
    expect(context.venue()?.id).toBe(3);
    user.set(null);
    expect(context.venues()).toEqual([]);
    expect(context.venue()).toBeUndefined();
  });
  it('exposes actual loading and failure state to route components', () => {
    loading.set(true); errors.set(['Sin conexion']);
    expect(context.loading()).toBe(true);
    expect(context.error()).toBe('Sin conexion');
  });
});
