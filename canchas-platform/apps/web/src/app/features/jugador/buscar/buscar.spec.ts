import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { BehaviorSubject, Subject, of } from 'rxjs';
import { describe, it, expect, vi } from 'vitest';
import { Buscar } from './buscar';
import { SearchService } from '@core/services/search.service';
import { DatabaseService } from '@core/supabase/database.service';
import { SearchResults } from '@core/models/search.model';
const result = (query: string): SearchResults => ({
  query,
  sedes: [{ id: '10', nombre: 'Sede real', ciudad: 'Ica', distrito: 'Ica', canchasCount: 2 }],
  canchas: [],
  personas: [],
  totalSedes: 1,
  totalCanchas: 0,
  totalPersonas: 0,
  totalCount: 1,
});
describe('Página independiente de resultados', () => {
  async function setup(q = 'real', service = { search: vi.fn(() => of(result(q))) }) {
    const params = new BehaviorSubject(convertToParamMap({ q }));
    TestBed.configureTestingModule({
      imports: [Buscar],
      providers: [
        provideRouter([]),
        { provide: SearchService, useValue: service },
        {
          provide: ActivatedRoute,
          useValue: { queryParamMap: params, snapshot: { queryParamMap: params.value } },
        },
        {
          provide: DatabaseService,
          useValue: {
            catalogLoading: signal(false),
            catalogError: signal(''),
            getVenuesPublicos: () => [],
          },
        },
      ],
    });
    const f = TestBed.createComponent(Buscar);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    return { f, c: f.componentInstance, params, service };
  }
  it('muestra conteos reales y no inventa personas ni valoraciones ni disponibilidad', async () => {
    const { f, service } = await setup();
    expect(service.search).toHaveBeenCalledWith('real', false, true);
    expect(f.nativeElement.textContent).toContain('Sede real');
    expect(f.nativeElement.textContent).toContain('1 resultado');
    expect(f.nativeElement.textContent).toContain('0');
    expect(f.nativeElement.querySelectorAll('.person-result')).toHaveLength(0);
    expect(f.nativeElement.textContent).not.toContain('libres');
  });
  it('mantiene estado inicial sin consultar cuando faltan dos caracteres', async () => {
    const { f, service } = await setup('a');
    expect(service.search).not.toHaveBeenCalled();
    expect(f.nativeElement.textContent).toContain('al menos dos caracteres');
  });
  it('ignora respuestas antiguas si cambia la búsqueda mientras espera', async () => {
    const old = new Subject<SearchResults>();
    const latest = new Subject<SearchResults>();
    const service = { search: vi.fn().mockReturnValueOnce(old).mockReturnValueOnce(latest) };
    // Component stabilization must not wait on an unresolved HTTP-like Subject.
    const { f, c, params } = await setup('anterior', service as any);
    params.next(convertToParamMap({ q: 'nueva' }));
    f.detectChanges();
    latest.next(result('nueva'));
    latest.complete();
    await f.whenStable();
    f.detectChanges();
    old.next(result('anterior'));
    old.complete();
    await f.whenStable();
    expect(c['result']()?.query).toBe('nueva');
  });
});
