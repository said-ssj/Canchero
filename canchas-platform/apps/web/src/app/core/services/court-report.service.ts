import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';

export type ReportIssueType =
  'ILUMINACION' | 'ESTADO_CESPED' | 'REDES_ARCOS' | 'LIMPIEZA' | 'HORARIO_CONFLICTO' | 'OTRO';

export type ReportStatus = 'PENDIENTE' | 'EN_REVISION' | 'RESUELTO' | 'DESCARTADO';
export type ReportPriority = 'BAJA' | 'MEDIA' | 'ALTA' | 'URGENTE';

export interface CourtReportRequest {
  canchaId: number;
  tipoProblema: string;
  descripcion: string;
  prioridad?: string;
}

export interface CourtReportResponse {
  id: number;
  canchaId: number;
  nombreCancha: string;
  sedeId: number;
  nombreSede: string;
  usuarioId: string;
  usuarioNombre: string;
  tipoProblema: string;
  descripcion: string;
  estado: ReportStatus;
  prioridad: ReportPriority;
  resolucion?: string;
  fechaResolucion?: string;
  fechaCreacion?: string;
}

export interface UpdateCourtReportStatusRequest {
  estado: string;
  resolucion?: string;
}

@Injectable({ providedIn: 'root' })
export class CourtReportService {
  private readonly http = inject(HttpClient);

  createReport(data: CourtReportRequest): Observable<CourtReportResponse> {
    return this.http.post<CourtReportResponse>(`${environment.apiUrl}/court-reports`, data);
  }

  getByVenue(sedeId: number): Observable<CourtReportResponse[]> {
    return this.http.get<CourtReportResponse[]>(
      `${environment.apiUrl}/court-reports/venue/${sedeId}`,
    );
  }

  getByCourt(canchaId: number): Observable<CourtReportResponse[]> {
    return this.http.get<CourtReportResponse[]>(
      `${environment.apiUrl}/court-reports/court/${canchaId}`,
    );
  }

  getMyReports(): Observable<CourtReportResponse[]> {
    return this.http.get<CourtReportResponse[]>(`${environment.apiUrl}/court-reports/mine`);
  }

  updateStatus(
    reportId: number,
    data: UpdateCourtReportStatusRequest,
  ): Observable<CourtReportResponse> {
    return this.http.patch<CourtReportResponse>(
      `${environment.apiUrl}/court-reports/${reportId}/status`,
      data,
    );
  }
}
