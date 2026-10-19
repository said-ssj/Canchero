import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi, describe, beforeEach, it, expect } from 'vitest';
import { AdminPersonalizacion } from './admin-personalizacion';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import type { Venue } from '@shared/models/venue.model';

describe('AdminPersonalizacion Component - Etapa 7 (Personalización y Marca de Sede)', () => {
  let fixture: ComponentFixture<AdminPersonalizacion>;
  let component: AdminPersonalizacion;

  const mockCurrentUser = signal<{ id: string; email: string; nombre: string; rol: string } | null>({
    id: 'owner-uuid',
    email: 'dueno@canchero.pe',
    nombre: 'Dueño Oficial',
    rol: 'dueno',
  });

  const mockSede: Venue = {
    id: '1',
    nombre: 'Complejo Deportivo Magdalena',
    ciudad: 'Lima',
    distrito: 'Magdalena',
    direccion: 'Av. del Ejército 1230',
    rating: 4.8,
    precioBase: 80,
    fotos: ['https://images.unsplash.com/photo-1529900245534-47fbf822155a?w=800'],
    amenidades: ['Fútbol 7', 'Césped FIFA', 'Estacionamiento'],
    canchas: [],
    descripcion: 'El mejor césped sintético con iluminación LED profesional.',
    telefono: '987 654 321',
  };

  const mockDbService = {
    usuarios: signal<any[]>([{ id: 1, email: 'dueno@canchero.pe', rol: 'dueno' }]),
    sedes: signal<Venue[]>([mockSede]),
    getSedesPorDueno: vi.fn(() => [mockSede]),
    saveOrUpdateSede: vi.fn(),
    refreshCatalogo: vi.fn(),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AdminPersonalizacion],
      providers: [
        provideRouter([]),
        { provide: DatabaseService, useValue: mockDbService },
        { provide: AuthService, useValue: { currentUser: mockCurrentUser } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminPersonalizacion);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debe crearse e inicializar datos de marca desde la sede activa', () => {
    expect(component).toBeTruthy();
    expect(component['colorAcento']()).toBe('#3CB043');
    expect(component['colorAcentoNombre']()).toBe('Verde Césped Oficial');
  });

  it('deshabilita guardados y billeteras pendientes, conservando preview y descargas', () => {
    mockDbService.saveOrUpdateSede.mockClear();
    const root = fixture.nativeElement as HTMLElement;
    for (const selector of ['#btn-save-texts', '#btn-save-all', '.segmented button']) {
      for (const button of root.querySelectorAll<HTMLButtonElement>(selector)) {
        expect(button.disabled).toBe(true);
        button.click();
      }
    }
    expect(mockDbService.saveOrUpdateSede).not.toHaveBeenCalled();
    expect(root.querySelectorAll('.segmented .active')).toHaveLength(0);
    expect(root.querySelector<HTMLButtonElement>('#btn-download-svg')?.disabled).toBe(false);
    expect(root.querySelector<HTMLButtonElement>('#btn-download-pdf')?.disabled).toBe(false);
    const swatch = root.querySelector<HTMLButtonElement>('[data-brand-color="#F5821F"]');
    swatch?.click();
    fixture.detectChanges();
    expect(component['colorAcento']()).toBe('#F5821F');
    expect(root.querySelector('.qr-render-box svg')?.getAttribute('width')).toBe('120');
  });

  it('permite seleccionar un color de la paleta, actualiza acento y emite colorChange', () => {
    const colorSpy = vi.fn();
    const noticeSpy = vi.fn();
    component.colorChange.subscribe(colorSpy);
    component.notice.subscribe(noticeSpy);

    component['seleccionarColorSwatch']('#F5821F', 'Naranja Canchero');

    expect(component['colorAcento']()).toBe('#F5821F');
    expect(component['colorAcentoNombre']()).toBe('Naranja Canchero');
    expect(colorSpy).toHaveBeenCalledWith('#F5821F');
    expect(noticeSpy).toHaveBeenCalledWith(expect.stringContaining('Naranja Canchero'));
    expect(component['swatchActive']('#F5821F')).toBe(true);
    expect(component['swatchActive']('#3CB043')).toBe(false);
  });

  it('actualiza textos de marca y calcula contador de caracteres en vivo', () => {
    component['actualizarPreviewTagline']('El templo de fútbol');
    expect(component['previewTagline']()).toBe('El templo de fútbol');

    component['actualizarHistoria']('Nueva descripción de la sede');
    expect(component['liveVenueStory']()).toBe('Nueva descripción de la sede');
    expect(component['historiaContador']()).toBe('Nueva descripción de la sede'.length);
  });

  it('guarda textos de marca en DatabaseService', () => {
    const noticeSpy = vi.fn();
    component.notice.subscribe(noticeSpy);

    component['actualizarHistoria']('Historia guardada');
    component['guardarTextosMarca']();

    expect(mockDbService.saveOrUpdateSede).toHaveBeenCalledWith(
      'owner-uuid',
      expect.objectContaining({
        descripcion: 'Historia guardada',
      })
    );
    expect(noticeSpy).toHaveBeenCalledWith('Textos de marca guardados correctamente');
  });

  it('permite alternar métodos QR (Yape / Plin) y emite notificación', () => {
    const noticeSpy = vi.fn();
    component.notice.subscribe(noticeSpy);

    component['seleccionarMetodoQr']('plin');
    expect(component['qrMetodo']()).toBe('plin');
    expect(noticeSpy).toHaveBeenCalledWith('Billetera Plin Transfer seleccionada');

    component['seleccionarMetodoQr']('yape');
    expect(component['qrMetodo']()).toBe('yape');
    expect(noticeSpy).toHaveBeenCalledWith('Billetera Yape Móvil seleccionada');
  });

  it('genera matriz y SVG de código QR auténtico estándar ISO/IEC 18004', () => {
    const matrix = component['qrMatrix']();
    expect(matrix.length).toBeGreaterThanOrEqual(21);

    const svg = component['qrSvgContent']();
    expect(svg).toContain('<svg');
    expect(svg).toContain(component['colorAcento']());
    expect(svg).toContain('</svg>');
  });

  it('descarga SVG vectorial del QR mediante Blob nativo', () => {
    const clickSpy = vi.fn();
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:svg-qr');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      click: clickSpy,
      set href(_v: string) {},
      set download(_v: string) {},
    } as any);

    component['descargarSvgQr']();

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:svg-qr');

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    createElementSpy.mockRestore();
  });

  it('descarga kit de impresión en formato técnico para imprenta', () => {
    const clickSpy = vi.fn();
    const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:kit-qr');
    const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue({
      click: clickSpy,
      set href(_v: string) {},
      set download(_v: string) {},
    } as any);

    component['descargarPdfQr']();

    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:kit-qr');

    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
    createElementSpy.mockRestore();
  });

  it('publica todos los cambios de marca, guardando en base de datos y emitiendo venueUpdated', () => {
    const venueUpdatedSpy = vi.fn();
    const noticeSpy = vi.fn();
    component.venueUpdated.subscribe(venueUpdatedSpy);
    component.notice.subscribe(noticeSpy);

    component['actualizarHistoria']('Descripción final');
    component['totemPhone'].set('999 888 777');
    component['publicarCambiosSede']();

    expect(mockDbService.saveOrUpdateSede).toHaveBeenCalledWith(
      'owner-uuid',
      expect.objectContaining({
        descripcion: 'Descripción final',
        telefono: '999 888 777',
      })
    );
    expect(venueUpdatedSpy).toHaveBeenCalled();
    expect(noticeSpy).toHaveBeenCalledWith('Cambios de marca y personalización publicados correctamente');
  });

  it('muestra estado de carga (skeleton) cuando loading es true', () => {
    fixture.componentRef.setInput('loading', true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const skeleton = compiled.querySelector('.personalizacion-skeleton');
    expect(skeleton).toBeTruthy();
    expect(skeleton?.getAttribute('aria-busy')).toBe('true');
  });

  it('muestra estado de error cuando error es proporcionado', () => {
    fixture.componentRef.setInput('error', 'Error al sincronizar con el servidor');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const errorBanner = compiled.querySelector('.personalizacion-error-banner');
    expect(errorBanner).toBeTruthy();
    expect(errorBanner?.textContent).toContain('Error al sincronizar con el servidor');
  });
});
