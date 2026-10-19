import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '@core/auth/auth.service';
import { MapsService } from '@core/services/maps.service';
import { DatabaseService } from '@core/supabase/database.service';
import { AdminSedes } from './admin-sedes';

vi.mock('leaflet', () => ({
  map: vi.fn(() => ({ remove: vi.fn(), on: vi.fn(), invalidateSize: vi.fn() })),
  tileLayer: vi.fn(() => ({ addTo: vi.fn() })),
  divIcon: vi.fn(),
  marker: vi.fn(() => ({ addTo: vi.fn().mockReturnThis(), on: vi.fn() })),
}));

describe('AdminSedes integration boundaries', () => {
  let fixture: ComponentFixture<AdminSedes>;
  let component: AdminSedes;
  const currentUser = signal<{ id: string } | null>(null);
  const catalogLoading = signal(false);
  const getSedesPorDueno = vi.fn(() => []);
  const saveOrUpdateSede = vi.fn();
  const uploadPublicImage = vi.fn();

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    uploadPublicImage.mockReset();
    currentUser.set(null);
    catalogLoading.set(false);
    await TestBed.configureTestingModule({
      imports: [AdminSedes],
      providers: [
        { provide: AuthService, useValue: { currentUser } },
        { provide: MapsService, useValue: {} },
        { provide: DatabaseService, useValue: {
          catalogLoading, getSedesPorDueno, saveOrUpdateSede, uploadPublicImage,
          loadErrors: signal([]),
        } },
      ],
    }).overrideComponent(AdminSedes, {
      set: {
        imports: [],
        template: '@if (formularioSedeAbierto()) { <div #venueMap></div> }',
      },
    }).compileComponents();
    fixture = TestBed.createComponent(AdminSedes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture.destroy();
    vi.useRealTimers();
  });

  it('does not read or save venues without an authenticated identity', () => {
    expect(component['sedesDelDueno']()).toEqual([]);
    component['guardarCambiosSede']();
    expect(getSedesPorDueno).not.toHaveBeenCalled();
    expect(saveOrUpdateSede).not.toHaveBeenCalled();
  });

  it('uses the authenticated ID verbatim and clears the list after logout', () => {
    currentUser.set({ id: 'owner-uuid' });
    component['sedesDelDueno']();
    expect(getSedesPorDueno).toHaveBeenCalledWith('owner-uuid');
    currentUser.set(null);
    expect(component['sedesDelDueno']()).toEqual([]);
    expect(getSedesPorDueno).toHaveBeenCalledTimes(1);
  });

  it('finishes loading even when the catalog is empty', () => {
    catalogLoading.set(true);
    expect(component['isLoading']()).toBe(true);
    catalogLoading.set(false);
    expect(component['isLoading']()).toBe(false);
  });

  it('removes the old map and targets the new local container on reopen', async () => {
    const leaflet = await import('leaflet');
    component.abrirFormularioNuevaSede();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(150);
    const firstContainer = fixture.nativeElement.querySelector('div');
    expect(leaflet.map).toHaveBeenLastCalledWith(firstContainer, expect.any(Object));
    const firstMap = vi.mocked(leaflet.map).mock.results[0].value;

    component.cerrarFormularioSede();
    expect(firstMap.remove).toHaveBeenCalledTimes(1);
    fixture.detectChanges();
    component.abrirFormularioNuevaSede();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(150);
    const secondContainer = fixture.nativeElement.querySelector('div');
    expect(secondContainer).not.toBe(firstContainer);
    expect(leaflet.map).toHaveBeenCalledTimes(2);
    expect(leaflet.map).toHaveBeenLastCalledWith(secondContainer, expect.any(Object));
  });

  it('does not initialize a map after closing during initialization', async () => {
    const leaflet = await import('leaflet');
    component.abrirFormularioNuevaSede();
    fixture.detectChanges();
    component.cerrarFormularioSede();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(500);
    expect(leaflet.map).not.toHaveBeenCalled();
  });

  function photoEvent(files: File[]): Event {
    return { target: { files, value: '' } } as unknown as Event;
  }

  it('uses the uploaded logo URL and preserves the previous logo on failure', async () => {
    const file = new File(['image'], 'logo.png', { type: 'image/png' });
    uploadPublicImage.mockResolvedValueOnce('https://example.test/logo.png');
    await component['onLogoSelected'](photoEvent([file]));
    expect(uploadPublicImage).toHaveBeenCalledWith(file, 'sedes/logos');
    expect(component['liveVenueLogo']()).toBe('https://example.test/logo.png');
    uploadPublicImage.mockRejectedValueOnce(new Error('offline'));
    await component['onLogoSelected'](photoEvent([file]));
    expect(component['liveVenueLogo']()).toBe('https://example.test/logo.png');
    expect(component['uploadingPhotos']()).toBe(false);
  });

  it('blocks saving during upload and ignores uploads completed after closing', async () => {
    currentUser.set({ id: 'owner-uuid' });
    let finish!: (url: string) => void;
    uploadPublicImage.mockReturnValueOnce(new Promise<string>(resolve => { finish = resolve; }));
    const previousLogo = component['liveVenueLogo']();
    const pending = component['onLogoSelected'](photoEvent([
      new File(['image'], 'logo.png', { type: 'image/png' }),
    ]));
    component.guardarCambiosSede();
    expect(saveOrUpdateSede).not.toHaveBeenCalled();
    component.cerrarFormularioSede();
    finish('https://example.test/stale.png');
    await pending;
    expect(component['liveVenueLogo']()).toBe(previousLogo);
    expect(component['uploadingPhotos']()).toBe(false);
  });

  it('rejects oversized galleries and retains successful uploads on partial failure', async () => {
    const file = new File(['image'], 'court.png', { type: 'image/png' });
    await component['onGallerySelected'](photoEvent(Array(13).fill(file)));
    expect(uploadPublicImage).not.toHaveBeenCalled();
    uploadPublicImage.mockResolvedValueOnce('https://example.test/court.png')
      .mockRejectedValueOnce(new Error('offline'));
    await component['onGallerySelected'](photoEvent([file, file]));
    expect(component['galeriaFotos']().map(photo => photo.url)).toEqual(['https://example.test/court.png']);
    expect(component['uploadingPhotos']()).toBe(false);
  });
});
