import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { describe, it, expect } from 'vitest';
import { NotificationPreferences } from './notification-preferences';
describe('Preferencias de correo', () => {
  function setup() {
    TestBed.configureTestingModule({
      imports: [NotificationPreferences],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(NotificationPreferences);
    const http = TestBed.inject(HttpTestingController);
    fixture.detectChanges();
    return { fixture, http };
  }
  it('reemplaza la carga por preferencias reales e informa que el proveedor no está activado', async () => {
    const { fixture, http } = setup();
    http
      .expectOne((r) => r.url.endsWith('/notification-preferences'))
      .flush({ bookingEmails: true, reminders: true, emailAvailable: false });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.replace(/\s+/g, ' ')).toContain(
      'El envío de correos aún no está activado',
    );
    expect(fixture.nativeElement.textContent).not.toContain('Cargando preferencias');
    expect(fixture.nativeElement.querySelectorAll('input[type=checkbox]').length).toBe(2);
    http.verify();
  });
  it('solo envía preferencias propias y no confirma el guardado hasta recibir respuesta', async () => {
    const { fixture, http } = setup();
    http
      .expectOne((r) => r.url.endsWith('/notification-preferences'))
      .flush({ bookingEmails: false, reminders: false, emailAvailable: false });
    await fixture.whenStable();
    const save = fixture.componentInstance.save();
    const req = http.expectOne((r) => r.method === 'PUT');
    expect(req.request.body).toEqual({ bookingEmails: false, reminders: false });
    expect(fixture.componentInstance.saved()).toBe(false);
    req.flush({ message: 'No guardado' }, { status: 503, statusText: 'Unavailable' });
    await save;
    expect(fixture.componentInstance.saved()).toBe(false);
    expect(fixture.componentInstance.error()).toContain('No se pudieron guardar');
    http.verify();
  });
});
