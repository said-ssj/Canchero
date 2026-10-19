import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { Subject, of, throwError } from 'rxjs';
import { DatabaseService } from './database.service';

const loader = DatabaseService.prototype as unknown as { cargarDatosIniciales(): Promise<void> };

describe('DatabaseService catalog lifecycle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('recovers through the API using the confirmed identity and preserves failure as an error', async () => {
    vi.spyOn(loader, 'cargarDatosIniciales').mockResolvedValue(undefined);
    const post = vi.fn().mockReturnValue(of({ id: '701', venueId: 54, nombre: 'Grass', disponible: true, precioHora: 50, precioHoraNoche: 60 }));
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: { post } }] });
    const service = TestBed.inject(DatabaseService);
    const draft = { id: 601, sede_id: 54, nombre: 'Grass', activa: true, precio_hora: 50, precio_hora_noche: 60 };
    const remap = vi.spyOn(service as any, 'updateLocalCanchaId').mockImplementation(() => {});
    await service.recuperarCancha(draft);
    expect(post.mock.calls[0][0]).toMatch(/\/courts\/recover$/);
    expect(post.mock.calls[0][1]).toMatchObject({ venueId: '54', precioHora: 50, precioHoraNoche: 60 });
    expect(remap).toHaveBeenCalledWith(601, 701);
    expect(service.canchas()[0].id).toBe(701);
    post.mockReturnValue(throwError(() => new Error('failed')));
    await expect(service.recuperarCancha(draft)).rejects.toThrow('failed');
    expect(service.canchas()).toHaveLength(1);
  });

  it('updates operation only after server confirmation and never writes a local success', async () => {
    vi.spyOn(loader, 'cargarDatosIniciales').mockResolvedValue(undefined);
    const response = new Subject<{ id: number; disponible: boolean }>();
    const put = vi.fn().mockReturnValue(response);
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: { put } }] });
    const service = TestBed.inject(DatabaseService);
    service.canchas.set([{ id: 11, sede_id: 54, nombre: 'Cancha', activa: true }]);
    const pending = service.toggleCanchaActiva(11);
    expect(service.canchas()[0].activa).toBe(true);
    expect(put.mock.calls[0][0]).toMatch(/\/courts\/11\/operation$/);
    expect(put.mock.calls[0][1]).toEqual({ disponible: false });
    response.next({ id: 11, disponible: false });
    response.complete();
    await pending;
    expect(service.canchas()[0].activa).toBe(false);
    put.mockReturnValue(throwError(() => new Error('offline')));
    await expect(service.toggleCanchaActiva(11)).rejects.toThrow('offline');
    expect(service.canchas()[0].activa).toBe(false);
    put.mockReturnValue(of({ id: 99, disponible: true }));
    await expect(service.toggleCanchaActiva(11)).rejects.toThrow('confirmo');
    expect(service.canchas()[0].activa).toBe(false);
  });

  it('keeps unsaved local drafts separate from the operational catalog', () => {
    vi.spyOn(loader, 'cargarDatosIniciales').mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: {} }] });
    const service = TestBed.inject(DatabaseService);
    const drafts = [{ id: 77, sede_id: 54, activa: true }];
    vi.spyOn(service as any, 'getLocalCanchas').mockReturnValue(drafts);
    expect(service.getCanchasPorSede(54)).toEqual([]);
    expect(service.getBorradoresCanchasPorSede(54)).toEqual(drafts);
    expect(service.getBorradoresCanchasPorSede(55)).toEqual([]);
  });

  it('finishes an empty load and coalesces overlapping refresh requests', async () => {
    let finish!: () => void;
    const pending = new Promise<void>(resolve => { finish = resolve; });
    // Mock the network boundary, not the loading implementation being tested.
    const load = vi.spyOn(loader, 'cargarDatosIniciales').mockReturnValue(pending);
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: {} }] });
    const service = TestBed.inject(DatabaseService);
    const request = service.refreshCatalogo();
    expect(service.refreshCatalogo()).toBe(request);
    expect(service.catalogLoading()).toBe(true);
    expect(load).toHaveBeenCalledOnce();
    finish();
    await request;
    expect(service.catalogLoading()).toBe(false);
    expect(service.sedes()).toEqual([]);
    service.loadErrors.set(['sede']);
    await service.refreshCatalogo();
    expect(service.loadErrors()).toEqual([]);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('matches legacy owner aliases without substituting owner 1', async () => {
    vi.spyOn(loader, 'cargarDatosIniciales').mockResolvedValue(undefined);
    TestBed.configureTestingModule({ providers: [{ provide: HttpClient, useValue: {} }] });
    const service = TestBed.inject(DatabaseService);
    await service.refreshCatalogo();
    const uuid = 'f2340000-0000-0000-0000-000000000001';
    const legacy = service['uuidToNumber'](uuid);
    service.sedes.set([{ id: 10, dueno_id: legacy }, { id: 20, dueno_id: 1 }]);
    expect(service.getSedesPorDueno(uuid).map(sede => sede.id)).toEqual([10]);
    expect(service.getSedesPorDueno('')).toEqual([]);
  });
});
