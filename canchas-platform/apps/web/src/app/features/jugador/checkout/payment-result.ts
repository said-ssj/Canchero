import { Component, DestroyRef, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CurrencyPipe } from '@angular/common';
import { MercadoPagoApi, PaymentState } from '../../../core/payments/mercadopago-api';
import { AuthService } from '../../../core/auth/auth.service';
import * as QRCode from 'qrcode';

@Component({
  imports: [RouterLink, CurrencyPipe],
  template: ` <main class="payment-result" aria-labelledby="payment-title">
    <a routerLink="/itinerario">Volver a mi itinerario</a>
    <section class="result-card">
      <p class="mode">Prueba de Mercado Pago · sin cobros reales</p>
      <h1 id="payment-title">{{ title() }}</h1>
      @if (!auth.isLoggedIn()) {
        <p>Inicia sesión con la cuenta que realizó la reserva para consultar el resultado.</p>
        <a [routerLink]="['/login']" [queryParams]="{ returnUrl: returnUrl }">Iniciar sesión</a>
      }
      @if (loading()) {
        <p role="status">Consultando el estado verificado del pago…</p>
      }
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
      @if (data(); as p) {
        <dl>
          <div>
            <dt>Sede</dt>
            <dd>{{ p.sede }}</dd>
          </div>
          <div>
            <dt>Cancha</dt>
            <dd>{{ p.cancha }}</dd>
          </div>
          <div>
            <dt>Fecha y horario</dt>
            <dd>{{ p.fecha }} · {{ p.horario }}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{{ p.monto | currency: 'PEN' : 'S/ ' }}</dd>
          </div>
          <div>
            <dt>Participantes del pase</dt>
            <dd>{{ p.cupos }}</dd>
          </div>
        </dl>
        @if (p.estado === 'pendiente') {
          <p>
            La reserva está retenida temporalmente. El regreso desde Mercado Pago no acredita el
            pago: esperamos su verificación.
          </p>
        }
        @if (p.estado === 'revision') {
          <p>
            El pago requiere revisión. No hay un pase habilitado. Contacta a la sede antes de volver
            a pagar.
          </p>
        }
        @if (p.estado === 'expirado') {
          <p>La retención venció. Consulta la disponibilidad antes de iniciar otra reserva.</p>
        }
        @if (qr() && p.passToken) {
          <h2>Pase de acceso</h2>
          <img class="qr" [src]="qr()" alt="QR de acceso a la reserva" width="240" height="240" />
          <p>
            {{ p.ingresosUtilizados }} de {{ p.cupos }} ingresos utilizados. Presenta este QR al
            personal de la sede.
          </p>
        }
      }
      @if (auth.isLoggedIn()) {
        <button type="button" [disabled]="loading()" (click)="load(true)">Actualizar estado</button>
      }
    </section>
  </main>`,
  styles: [
    `
      :host {
        display: block;
        min-height: 65vh;
      }
      .payment-result {
        max-width: 760px;
        margin: 32px auto;
        padding: 0 20px;
      }
      .result-card {
        margin-top: 20px;
        border: 1px solid var(--line, #dce2e8);
        border-radius: 6px;
        padding: 24px;
        background: var(--card, #fff);
      }
      h1 {
        font-size: 26px;
      }
      h2 {
        font-size: 18px;
      }
      .mode {
        color: var(--muted, #657080);
        font-size: 13px;
      }
      dl > div {
        display: flex;
        gap: 16px;
        justify-content: space-between;
        border-bottom: 1px solid var(--line, #ddd);
        padding: 12px 0;
      }
      dd {
        margin: 0;
        text-align: right;
        overflow-wrap: anywhere;
      }
      .qr {
        display: block;
        max-width: 100%;
        background: white;
      }
      .error {
        color: #b42318;
      }
      button {
        padding: 10px 16px;
        border: 0;
        border-radius: 6px;
        background: #25832a;
        color: white;
      }
      button:disabled {
        background: #e5e7eb;
        color: #6b7280;
      }
      @media (max-width: 480px) {
        dl > div {
          display: block;
        }
        dd {
          text-align: left;
          margin-top: 6px;
        }
        .result-card {
          padding: 18px;
        }
      }
    `,
  ],
})
export class PaymentResult {
  protected readonly auth = inject(AuthService);
  private readonly api = inject(MercadoPagoApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<PaymentState | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly qr = signal('');
  readonly returnUrl = '/pago/resultado' + window.location.search;
  private timer?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private dead = false;
  constructor() {
    this.destroy.onDestroy(() => {
      this.dead = true;
      clearTimeout(this.timer);
    });
    void this.auth.ready.then(() => this.load(true));
  }
  title() {
    return (
      (
        {
          aprobado: 'Pago aprobado y reserva confirmada',
          pendiente: 'Esperando confirmación del pago',
          expirado: 'Reserva temporal vencida',
          revision: 'Pago en revisión',
          reembolsado: 'Pago reembolsado',
          contracargo: 'Pago observado',
          rechazado: 'Pago rechazado',
        } as Record<string, string>
      )[this.data()?.estado ?? ''] ?? 'Resultado de tu reserva'
    );
  }
  async load(reconcile = false) {
    if (!this.auth.isLoggedIn() || this.loading() || this.dead) return;
    const id = this.route.snapshot.queryParamMap.get('checkout');
    const bookingId = this.route.snapshot.queryParamMap.get('reserva');
    if ((!id || !/^[0-9a-f-]{36}$/i.test(id)) && (!bookingId || !/^\d+$/.test(bookingId))) {
      this.error.set('No se encontró una operación válida.');
      return;
    }
    this.loading.set(true);
    this.error.set('');
    try {
      const paymentId = this.route.snapshot.queryParamMap.get('payment_id');
      const result =
        !id && bookingId
          ? await this.api.byBooking(bookingId)
          : reconcile && paymentId && /^\d{1,30}$/.test(paymentId)
            ? await this.api.refresh(id!, paymentId)
            : await this.api.state(id!);
      if (this.dead) return;
      this.data.set(result);
      this.qr.set('');
      if (result.estado === 'aprobado' && result.passToken) {
        const url = new URL('/accesos', window.location.origin);
        url.hash = result.passToken;
        this.qr.set(
          await QRCode.toDataURL(url.href, { width: 240, margin: 3, errorCorrectionLevel: 'M' }),
        );
      }
      if (result.estado === 'pendiente' && this.attempts++ < 6)
        this.timer = setTimeout(() => void this.load(), 4000);
    } catch (e: any) {
      this.error.set(
        e?.error?.message ||
          'No se pudo verificar el pago. Actualiza el estado antes de intentar pagar otra vez.',
      );
    } finally {
      this.loading.set(false);
    }
  }
}
