import { Component, effect, inject, signal, untracked } from '@angular/core';
import { CurrencyPipe, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom, timeout } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { environment } from '@env/environment';
export interface PlayerPayment {
  id: string;
  bookingId: string;
  venueId: string;
  venueName: string;
  courtName: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  amount: number;
  method: string | null;
  paidAt: string | null;
  reference: string | null;
  advance: boolean;
}
@Component({
  imports: [
    CurrencyPipe,
    DatePipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './historial-pagos.html',
  styleUrl: './historial-pagos.css',
})
export class PaymentHistory {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  readonly rows = signal<PlayerPayment[]>([]);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly hasMore = signal(false);
  private page = 0;
  private request = 0;
  constructor() {
    effect(() => {
      const user = this.auth.user()?.id;
      untracked(() => {
        this.request++;
        this.rows.set([]);
        this.error.set('');
        this.hasMore.set(false);
        this.loading.set(false);
        this.page = 0;
        if (user) void this.load(true);
      });
    });
  }
  async load(reset = false) {
    if (this.loading()) return;
    const user = this.auth.user()?.id;
    if (!user) return;
    const req = ++this.request,
      page = reset ? 0 : this.page;
    this.loading.set(true);
    this.error.set('');
    try {
      const result = await firstValueFrom(
        this.http
          .get<{ items: PlayerPayment[]; hasMore: boolean }>(environment.apiUrl + '/me/payments', {
            params: { page },
          })
          .pipe(timeout(15000)),
      );
      if (req !== this.request || user !== this.auth.user()?.id) return;
      this.rows.set(reset ? result.items : [...this.rows(), ...result.items]);
      this.hasMore.set(result.hasMore);
      this.page = page + 1;
    } catch {
      if (req === this.request)
        this.error.set('No pudimos cargar tus pagos. Inténtalo nuevamente.');
    } finally {
      if (req === this.request) this.loading.set(false);
    }
  }
}
