import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from '@core/auth/auth.service';
import { PaymentHistory } from './historial-pagos';
describe('Historial de pagos', () => {
  function setup() {
    const user = signal<any>({ id: 'one' });
    TestBed.configureTestingModule({
      imports: [PaymentHistory],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { user } },
      ],
    });
    const fixture = TestBed.createComponent(PaymentHistory);
    fixture.detectChanges();
    return {
      fixture,
      page: fixture.componentInstance,
      http: TestBed.inject(HttpTestingController),
      user,
    };
  }
  it('diferencia un error de carga de un historial vacío y permite reintentar', async () => {
    const { fixture, page, http } = setup();
    http
      .expectOne((r) => r.url.endsWith('/me/payments') && !r.params.has('userId'))
      .flush({}, { status: 503, statusText: 'Unavailable' });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No pudimos cargar');
    expect(fixture.nativeElement.textContent).not.toContain('Aún no tienes pagos');
    const retry = page.load(true);
    http.expectOne((r) => r.url.endsWith('/me/payments')).flush({ items: [], hasMore: false });
    await retry;
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aún no tienes pagos');
    http.verify();
  });
  it('descarta el historial pendiente de la cuenta anterior', async () => {
    const { fixture, page, http, user } = setup();
    const old = http.expectOne((r) => r.url.endsWith('/me/payments'));
    user.set({ id: 'two' });
    fixture.detectChanges();
    const current = http.expectOne((r) => r.url.endsWith('/me/payments'));
    old.flush({ items: [{ id: 'old-private' }], hasMore: false });
    current.flush({ items: [], hasMore: false });
    await fixture.whenStable();
    expect(page.rows()).toEqual([]);
    http.verify();
  });
});
