import { Component, DestroyRef, InjectionToken, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { CurrencyPipe } from '@angular/common';
import { MercadoPagoApi, PaymentState } from '../../../core/payments/mercadopago-api';
import { AuthService } from '../../../core/auth/auth.service';
import * as QRCode from 'qrcode';
import {
  createPassFiles,
  downloadPass,
  passDate,
  passUrl,
  requireActivePass,
} from '../../../core/payments/reservation-pass';

export const RESERVATION_PASS_EXPORT = new InjectionToken('ReservationPassExport', {
  providedIn: 'root',
  factory: () => ({ create: createPassFiles, download: downloadPass }),
});

@Component({
  imports: [RouterLink, CurrencyPipe, MatButtonModule],
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
        @if ((p.bloques?.length ?? 0) > 1) {
          <p>
            Un único pago de {{ p.totalOperacion | currency: 'PEN' : 'S/ ' }} para
            {{ p.bloques!.length }} reservas. Cada bloque tiene su propio pase y cupos.
          </p>
          <div class="pass-actions" aria-label="Reservas incluidas en el pago">
            @for (b of p.bloques; track b.id) {
              <button
                mat-stroked-button
                [disableRipple]="true"
                type="button"
                [disabled]="loading() || exporting()"
                [attr.aria-pressed]="p.id === b.id"
                (click)="selectBlock(b.id)"
              >
                {{ dateLabel(b.fecha) }} · {{ b.horario }}
              </button>
            }
          </div>
        }
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
            <dt>Dirección</dt>
            <dd>{{ p.direccion || 'No registrada' }}</dd>
          </div>
          <div>
            <dt>Fecha y horario</dt>
            <dd>{{ dateLabel(p.fecha) }} · {{ p.horario }} (Perú)</dd>
          </div>
          <div>
            <dt>Importe de esta reserva</dt>
            <dd>{{ p.monto | currency: 'PEN' : 'S/ ' }}</dd>
          </div>
          <div>
            <dt>Participantes del pase</dt>
            <dd>{{ p.cupos }}</dd>
          </div>
        </dl>
        @if (p.estado === 'pendiente') {
          <p>
            {{
              p.canResume
                ? 'Todavía no hay un pago en proceso. Puedes retomar tu reserva mientras siga retenida.'
                : 'Mercado Pago está procesando el pago. La reserva se confirmará automáticamente al aprobarse; el dueño no necesita validarla.'
            }}
          </p>
          @if (p.canResume) {
            <a
              mat-flat-button
              [disableRipple]="true"
              [routerLink]="['/checkout']"
              [queryParams]="{ courtId: p.courtId, resume: p.id }"
              >Volver a convocados</a
            >
          }
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
          <p>
            El mismo QR sirve para todo el grupo. Cada ingreso consume un cupo; compartirlo no
            aumenta el límite.
          </p>
          <div class="pass-actions">
            <button
              mat-flat-button
              [disableRipple]="true"
              [disabled]="exporting() || loading()"
              (click)="exportPass('pdf')"
            >
              <span class="material-symbols-outlined" aria-hidden="true">download</span> Descargar
              pase PDF
            </button>
            <button
              mat-stroked-button
              [disableRipple]="true"
              [disabled]="exporting() || loading()"
              (click)="exportPass('share')"
            >
              <span class="material-symbols-outlined" aria-hidden="true">share</span> Compartir pase
            </button>
            <button
              mat-stroked-button
              [disableRipple]="true"
              [disabled]="exporting() || loading()"
              (click)="exportPass('image')"
            >
              <span class="material-symbols-outlined" aria-hidden="true">image</span> Guardar imagen
            </button>
          </div>
        }
        @if (p.estadoPase === 'agotado') {
          <p role="status">
            Este pase ya utilizó sus {{ p.cupos }} ingresos. Las copias del QR tampoco permiten
            nuevos ingresos.
          </p>
        }
        @if (p.estadoPase === 'vencido') {
          <p role="status">El horario del partido terminó. El pase está vencido.</p>
        }
        @if (p.estadoPase === 'revocado') {
          <p role="status">El pase fue revocado y ya no permite ingresos.</p>
        }
      }
      @if (exportMessage()) {
        <p role="status">{{ exportMessage() }}</p>
      }
      @if (auth.isLoggedIn()) {
        <button
          mat-stroked-button
          [disableRipple]="true"
          type="button"
          [disabled]="loading()"
          (click)="load(true)"
        >
          Actualizar estado
        </button>
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
      .pass-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
      }
      .pass-actions .material-symbols-outlined {
        font-size: 20px;
        vertical-align: middle;
        margin-right: 6px;
      }
      .error {
        color: #b42318;
      }
      button {
        margin-top: 12px;
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
  private readonly passFiles = inject(RESERVATION_PASS_EXPORT);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroy = inject(DestroyRef);
  readonly data = signal<PaymentState | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly qr = signal('');
  readonly exporting = signal(false);
  readonly exportMessage = signal('');
  readonly dateLabel = passDate;
  readonly returnUrl = '/pago/resultado' + window.location.search;
  private timer?: ReturnType<typeof setTimeout>;
  private attempts = 0;
  private selectedBlockId: string | null = null;
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
          aprobado:
            (this.data()?.bloques?.length ?? 0) > 1
              ? 'Pago aprobado y reservas confirmadas'
              : 'Pago aprobado y reserva confirmada',
          pendiente:
            this.data()?.paymentStatus === 'rejected'
              ? 'Pago rechazado'
              : this.data()?.canResume
                ? 'Pago sin completar'
                : 'Pago en proceso',
          expirado: 'Reserva temporal vencida',
          revision: 'Pago en revisión',
          reembolsado: 'Pago reembolsado',
          contracargo: 'Pago observado',
          rechazado: 'Pago rechazado',
        } as Record<string, string>
      )[this.data()?.estado ?? ''] ?? 'Resultado de tu reserva'
    );
  }

  async exportPass(kind: 'pdf' | 'image' | 'share') {
    if (this.exporting() || this.loading() || !this.data() || !this.auth.isLoggedIn()) return;
    this.exporting.set(true);
    this.exportMessage.set('');
    try {
      // Volver a consultar: un pase mostrado antes pudo agotarse o ser revocado.
      const verified = await this.api.state(this.data()!.id);
      if (this.dead) return;
      this.data.set(verified);
      requireActivePass(verified);
      const files = await this.passFiles.create(verified, window.location.origin);
      if (this.dead) return;
      if (kind === 'share' && navigator.share && navigator.canShare?.({ files: [files.pdf] })) {
        try {
          await navigator.share({ title: 'Pase de reserva Canchero', files: [files.pdf] });
          this.exportMessage.set(
            'Pase entregado al menú para compartir. Todas las copias comparten los mismos cupos.',
          );
        } catch (e: any) {
          if (e?.name === 'AbortError') throw e;
          this.passFiles.download(files.pdf);
          this.exportMessage.set(
            'El navegador no pudo compartir el archivo. Descargamos el PDF para que puedas adjuntarlo.',
          );
        }
      } else {
        this.passFiles.download(kind === 'image' ? files.image : files.pdf);
        this.exportMessage.set(
          kind === 'share'
            ? 'Pase PDF descargado. Puedes adjuntarlo en WhatsApp, correo u otra aplicación.'
            : 'Pase descargado. Todas las copias comparten los mismos cupos.',
        );
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError')
        this.exportMessage.set(
          e?.message || 'No se pudo generar el pase. Actualiza el estado e inténtalo nuevamente.',
        );
      if (this.data()?.estadoPase !== 'activo') this.qr.set('');
    } finally {
      this.exporting.set(false);
    }
  }
  async selectBlock(id: string) {
    if (this.loading() || this.exporting() || !this.data()?.bloques?.some((b) => b.id === id))
      return;
    this.loading.set(true);
    this.error.set('');
    this.qr.set('');
    try {
      const state = await this.api.state(id);
      if (this.dead) return;
      this.selectedBlockId = id;
      await this.present(state);
    } catch {
      this.error.set('No se pudo consultar este pase. Reintenta.');
    } finally {
      this.loading.set(false);
    }
  }
  private async present(state: PaymentState) {
    this.data.set(state);
    this.qr.set('');
    if (state.estado === 'aprobado' && state.estadoPase === 'activo' && state.passToken) {
      const qr = await QRCode.toDataURL(passUrl(state, window.location.origin), {
        width: 240,
        margin: 4,
        errorCorrectionLevel: 'M',
      });
      if (!this.dead && this.data()?.id === state.id) this.qr.set(qr);
    }
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
    const requesterId = this.auth.currentUser()?.id;
    try {
      const paymentId = [
        this.route.snapshot.queryParamMap.get('payment_id'),
        this.route.snapshot.queryParamMap.get('collection_id'),
      ].find((value) => value && /^\d{1,30}$/.test(value));
      const result =
        !id && bookingId
          ? await this.api.byBooking(bookingId)
          : reconcile && paymentId && /^\d{1,30}$/.test(paymentId)
            ? await this.api.refresh(id!, paymentId)
            : await this.api.state(id!);
      if (this.dead) return;
      if (!requesterId || this.auth.currentUser()?.id !== requesterId) {
        this.error.set(
          'La sesión cambió mientras verificábamos el pago. Inicia sesión con la cuenta titular de la reserva.',
        );
        return;
      }
      // La URL nunca acredita ni cancela un pago. Solo reanudar una retención propia
      // autorizada por la API; un pago pendiente/aprobado permanece en el resultado.
      if (id && !paymentId && result.canResume && result.paymentStatus === null) {
        await this.router.navigate(['/checkout'], {
          queryParams: { courtId: result.courtId, resume: result.id },
          replaceUrl: true,
        });
        return;
      }
      const selected =
        this.selectedBlockId && result.bloques?.some((b) => b.id === this.selectedBlockId)
          ? await this.api.state(this.selectedBlockId)
          : result;
      if (this.dead) return;
      await this.present(selected);
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
