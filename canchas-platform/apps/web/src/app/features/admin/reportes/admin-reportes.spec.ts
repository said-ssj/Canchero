import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminReportes } from './admin-reportes';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { AdminContext } from '../admin-context.service';
import { CourtReportService, CourtReportResponse } from '@core/services/court-report.service';
import { ReviewService, ReviewResponse } from '@features/jugador/detalle/review.service';
import { of, throwError } from 'rxjs';

describe('AdminReportes', () => {
  let component: AdminReportes;
  let fixture: ComponentFixture<AdminReportes>;

  const mockCourtReportService = {
    getAll: vi.fn(),
    updateStatus: vi.fn(),
  };

  const mockReviewService = {
    getByVenue: vi.fn(),
    getByCourt: vi.fn(),
  };

  const mockAuthService = {
    isSuperAdmin: vi.fn().mockReturnValue(false),
    currentUser: vi.fn().mockReturnValue({ id: 'user-admin', rol: 'admin' }),
  };

  const mockDatabaseService = {
    sedes: vi.fn().mockReturnValue([{ id: 1, nombre: 'Sede Central' }]),
    getCanchasPorSede: vi
      .fn()
      .mockReturnValue([{ id: 101, nombre: 'Cancha 1', deporte: 'Futbol' }]),
  };

  const mockAdminContext = {
    venues: vi.fn().mockReturnValue([{ id: 1, nombre: 'Sede Central' }]),
    venue: vi.fn().mockReturnValue({ id: 1, nombre: 'Sede Central' }),
  };

  const sampleReports: CourtReportResponse[] = [
    {
      id: 1,
      canchaId: 101,
      nombreCancha: 'Cancha 1',
      sedeId: 1,
      nombreSede: 'Sede Central',
      usuarioId: 'user-player',
      usuarioNombre: 'Jugador Uno',
      tipoProblema: 'ILUMINACION',
      descripcion: 'Foco dañado',
      estado: 'PENDIENTE',
      prioridad: 'ALTA',
      fechaCreacion: '2026-11-07T20:00:00',
    },
  ];

  const sampleReviews: ReviewResponse[] = [
    {
      id: 'rev-1',
      sedeId: '1',
      canchaId: 101,
      canchaNombre: 'Cancha 1',
      clienteNombre: 'Carlos',
      puntuacion: 5,
      comentario: 'Excelente césped',
      fecha: '2026-11-07T19:00:00',
    },
  ];

  beforeEach(async () => {
    mockCourtReportService.getAll.mockReturnValue(of(sampleReports));
    mockCourtReportService.updateStatus.mockReturnValue(
      of({ ...sampleReports[0], estado: 'RESUELTO', resolucion: 'Listo' }),
    );
    mockReviewService.getByVenue.mockReturnValue(of(sampleReviews));
    mockReviewService.getByCourt.mockReturnValue(of(sampleReviews));

    await TestBed.configureTestingModule({
      imports: [AdminReportes],
      providers: [
        { provide: CourtReportService, useValue: mockCourtReportService },
        { provide: ReviewService, useValue: mockReviewService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: DatabaseService, useValue: mockDatabaseService },
        { provide: AdminContext, useValue: mockAdminContext },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AdminReportes);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load initial reports and reviews', () => {
    expect(component).toBeTruthy();
    expect(component.reports().length).toBe(1);
    expect(component.reviews().length).toBe(1);
    expect(mockCourtReportService.getAll).toHaveBeenCalled();
  });

  it('should filter reports by status', () => {
    component.selectedEstadoReporte.set('RESUELTO');
    expect(component.filteredReports().length).toBe(0);

    component.selectedEstadoReporte.set('PENDIENTE');
    expect(component.filteredReports().length).toBe(1);
  });

  it('should filter reviews by stars', () => {
    component.selectedRatingComentario.set('5');
    expect(component.filteredReviews().length).toBe(1);

    component.selectedRatingComentario.set('3');
    expect(component.filteredReviews().length).toBe(0);
  });

  it('should handle resolution modal lifecycle', () => {
    const report = sampleReports[0];
    component.openResolutionModal(report);
    expect(component.resolvingReport()).toEqual(report);
    expect(component.resolvingStatus()).toBe('EN_REVISION');

    component.resolvingComment.set('Reparado con éxito');
    component.saveResolution();

    expect(mockCourtReportService.updateStatus).toHaveBeenCalledWith(1, {
      estado: 'EN_REVISION',
      resolucion: 'Reparado con éxito',
    });
    expect(component.resolvingReport()).toBeNull();
  });

  it('sin superadmin nunca pide los reportes de todas las sedes, aunque se elija "Todas"', () => {
    mockCourtReportService.getAll.mockClear();
    component.onSedeChange('');
    expect(mockCourtReportService.getAll).toHaveBeenCalledWith({ sedeId: 1, canchaId: undefined });
  });
});
