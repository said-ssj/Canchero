import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { PosCatalogEditor } from './pos-catalog-editor';

describe('Alta de catálogo POS', () => {
  let component: PosCatalogEditor;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [PosCatalogEditor],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(PosCatalogEditor);
    fixture.componentRef.setInput('sedeId', 54);
    component = fixture.componentInstance;
    component.dialog = { nativeElement: { showModal: vi.fn() } } as any;
    http = TestBed.inject(HttpTestingController);
    component.ngAfterViewInit();
    const categories = http.expectOne((r) => r.url.endsWith('/catalog/categories'));
    expect(categories.request.params.get('sedeId')).toBe('54');
    categories.flush([{ id: 1, nombre: 'Bebidas' }]);
  });
  afterEach(() => http.verify());
  it('guarda una categoría en la sede y la selecciona sin borrar el producto en preparación', async () => {
    await Promise.resolve();
    component.product.nombre = 'Agua';
    component.categoryName = '  Nuevas  ';
    component.categoryMode.set(true);
    const save = component.saveCategory();
    const request = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/categories'));
    expect(request.request.body).toMatchObject({ sedeId: 54, nombre: 'Nuevas' });
    request.flush({ id: 7, nombre: 'Nuevas' });
    await save;
    expect(component.product.categoriaId).toBe(7);
    expect(component.product.nombre).toBe('Agua');
    expect(component.categoryMode()).toBe(false);
  });
  it('envía medidas, stock y foto; impide doble envío y conserva el formulario si falla la API', async () => {
    await Promise.resolve();
    Object.assign(component.product, {
      nombre: 'Agua',
      contenido: 600,
      unidadMedida: 'ml',
      stockInicial: 5,
      fotoUrl: 'https://example.com/a.webp',
    });
    const closed = vi.spyOn(component.closed, 'emit');
    const save = component.saveProduct();
    await component.saveProduct();
    const request = http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/products'));
    expect(request.request.body).toMatchObject({
      sedeId: 54,
      contenido: 600,
      unidadMedida: 'ml',
      stockInicial: 5,
      fotoUrl: 'https://example.com/a.webp',
    });
    request.flush({ message: 'Código duplicado' }, { status: 409, statusText: 'Conflict' });
    await save;
    expect(component.error()).toBe('Código duplicado');
    expect(component.product.nombre).toBe('Agua');
    expect(component.busy()).toBe(false);
    expect(closed).not.toHaveBeenCalled();
  });
  it('solo cierra y notifica guardado después de confirmar el servidor', async () => {
    await Promise.resolve();
    const saved = vi.spyOn(component.saved, 'emit');
    const closed = vi.spyOn(component.closed, 'emit');
    const save = component.saveProduct();
    expect(closed).not.toHaveBeenCalled();
    http.expectOne((r) => r.method === 'POST' && r.url.endsWith('/products')).flush({ id: 100 });
    await save;
    expect(saved).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce();
  });
});
