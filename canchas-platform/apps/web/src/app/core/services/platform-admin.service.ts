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

  describeError(error: { status?: number }, section: 'finance' | 'audit'): string {
    switch (error.status) {
      case 0:
        return 'No hay conexión con la API. Verifica que el backend esté disponible.';
      case 401:
      case 403:
        return 'La API rechazó el acceso. Confirma que la sesión siga activa y que la cuenta tenga rol superadmin.';
      case 404:
        return 'El backend desplegado aún no incluye este endpoint. Despliega la versión de API que contiene la consola superadmin.';
      case 500:
      case 503:
        return section === 'audit'
          ? 'La API no pudo leer la bitácora. Confirma que se aplicó 20261114000000_superadmin_auditoria.sql y revisa los logs del backend.'
          : 'La API no pudo consultar los pagos. Confirma que el esquema de pagos y devoluciones esté actualizado y revisa los logs del backend.';
      default:
        return `La API respondió con el estado ${error.status ?? 'desconocido'}. Revisa los logs del backend.`;
    }
  }
}
