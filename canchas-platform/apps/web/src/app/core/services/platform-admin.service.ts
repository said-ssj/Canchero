import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '@env/environment';
import { Observable } from 'rxjs';

export interface PlatformRevenueSummary {
  from: string;
  to: string;
  paymentCount: number;
  grossProcessed: number;
  commissionBeforeRefunds: number;
  registeredRefunds: number;
  estimatedNetCommission: number;
}
export interface PlatformAuditEvent {
  id: number;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  method: string;
  path: string;
  status: number;
  occurredAt: string;
}

@Injectable({ providedIn: 'root' })
export class PlatformAdminService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/superadmin`;
  revenue(from: string, to: string): Observable<PlatformRevenueSummary> {
    const params = new HttpParams().set('from', from).set('to', to);
    return this.http.get<PlatformRevenueSummary>(`${this.url}/finance/revenue`, { params });
  }
  audit(from: string, to: string, query: string): Observable<PlatformAuditEvent[]> {
    const params = new HttpParams()
      .set('from', from)
      .set('to', to)
      .set('query', query)
      .set('limit', '300');
    return this.http.get<PlatformAuditEvent[]>(`${this.url}/audit`, { params });
  }
}
