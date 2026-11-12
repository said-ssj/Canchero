import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface PaymentState {
  id: string;
  reservaId: number;
  estado: string;
  monto: number;
  cancha: string;
  sede: string;
  fecha: string;
  horario: string;
  cupos: number;
  ingresosUtilizados: number;
  passToken: string | null;
  expiresAt: string;
  courtId: string;
  hours: number[];
  paymentStatus: string | null;
  canResume: boolean;
  direccion: string | null;
  codigoReserva: string | null;
  estadoPase: 'activo' | 'agotado' | 'vencido' | 'revocado' | 'no_disponible';
  publicPassUrl: string | null;
  testMode: boolean;
}
@Injectable({ providedIn: 'root' })
export class MercadoPagoApi {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/payments/mercadopago`;
  open(url: string) {
    openMercadoPago(url);
  }
  byBooking(id: string) {
    return firstValueFrom(
      this.http
        .get<PaymentState>(`${this.base}/bookings/${encodeURIComponent(id)}`)
        .pipe(timeout(15000)),
    );
  }
  capabilities() {
    return firstValueFrom(
      this.http
        .get<{ available: boolean; testMode: boolean }>(`${this.base}/capabilities`)
        .pipe(timeout(15000)),
    );
  }
  start(request: {
    courtId: string;
    fecha: string;
    hours: number[];
    cupos: number;
    idempotencyKey: string;
  }) {
    return firstValueFrom(
      this.http
        .post<{ id: string; checkoutUrl: string; expiresAt: string; testMode: boolean }>(
          `${this.base}/checkout`,
          request,
        )
        .pipe(timeout(30000)),
    );
  }
  state(id: string) {
    return firstValueFrom(
      this.http
        .get<PaymentState>(`${this.base}/checkouts/${encodeURIComponent(id)}`)
        .pipe(timeout(15000)),
    );
  }
  refresh(id: string, paymentId: string) {
    return firstValueFrom(
      this.http
        .post<PaymentState>(`${this.base}/checkouts/${encodeURIComponent(id)}/refresh`, {
          paymentId,
        })
        .pipe(timeout(20000)),
    );
  }
}

export function openMercadoPago(url: string): void {
  const target = new URL(url);
  if (
    target.protocol !== 'https:' ||
    !['www.mercadopago.com.pe', 'www.mercadopago.com', 'mercadopago.com.pe'].includes(
      target.hostname,
    ) ||
    target.username ||
    target.password
  )
    throw new Error('El proveedor no devolvió un enlace de pago válido.');
  window.location.assign(target.href);
}
