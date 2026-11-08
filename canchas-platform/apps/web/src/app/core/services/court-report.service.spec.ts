import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '@env/environment';
import { CourtReportService, CourtReportRequest } from './court-report.service';

describe('CourtReportService', () => {
  let service: CourtReportService;
  let http: HttpTestingController;

  const mockPayload: CourtReportRequest = {
    canchaId: 101,
    tipoProblema: 'ILUMINACION',
    descripcion: 'Reflectores apagados en zona sur',
    prioridad: 'ALTA',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CourtReportService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    http.verify();
    vi.restoreAllMocks();
  });

  it('sends POST /api/court-reports with court report payload', () => {
    let result: unknown;
    service.createReport(mockPayload).subscribe((val) => (result = val));

    const req = http.expectOne(`${environment.apiUrl}/court-reports`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(mockPayload);

    req.flush({ id: 1, ...mockPayload, estado: 'PENDIENTE', sedeId: 10 });
    expect(result).toEqual({ id: 1, ...mockPayload, estado: 'PENDIENTE', sedeId: 10 });
  });

  it('fetches reports by venue via GET /api/court-reports/venue/:id', () => {
    let result: unknown;
    service.getByVenue(10).subscribe((val) => (result = val));

    const req = http.expectOne(`${environment.apiUrl}/court-reports/venue/10`);
    expect(req.request.method).toBe('GET');

    req.flush([{ id: 1, canchaId: 101, sedeId: 10, estado: 'PENDIENTE' }]);
    expect(result).toEqual([{ id: 1, canchaId: 101, sedeId: 10, estado: 'PENDIENTE' }]);
  });

  it('updates report status via PATCH /api/court-reports/:id/status', () => {
    let result: unknown;
    service
      .updateStatus(1, { estado: 'RESUELTO', resolucion: 'Arreglado' })
      .subscribe((val) => (result = val));

    const req = http.expectOne(`${environment.apiUrl}/court-reports/1/status`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ estado: 'RESUELTO', resolucion: 'Arreglado' });

    req.flush({ id: 1, estado: 'RESUELTO', resolucion: 'Arreglado' });
    expect(result).toEqual({ id: 1, estado: 'RESUELTO', resolucion: 'Arreglado' });
  });
});
