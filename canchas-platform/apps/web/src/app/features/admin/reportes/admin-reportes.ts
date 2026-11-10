import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import {
  CourtReportService,
  CourtReportResponse,
  ReportStatus,
} from '@core/services/court-report.service';
import { ReviewService, ReviewResponse } from '@features/jugador/detalle/review.service';
import { AdminContext } from '../admin-context.service';

@Component({
  standalone: true,
  selector: 'app-admin-reportes',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatChipsModule,
    MatTooltipModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatTableModule,
    MatPaginatorModule,
  ],
  templateUrl: './admin-reportes.html',
  styleUrl: './admin-reportes.css',
})
export class AdminReportes implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly db = inject(DatabaseService);
  protected readonly adminContext = inject(AdminContext);
  private readonly courtReportService = inject(CourtReportService);
  private readonly reviewService = inject(ReviewService);

  readonly activeTab = signal<'reportes' | 'comentarios'>('reportes');

  // Filtros
  readonly selectedSedeId = signal<number | null>(null);
  readonly selectedCanchaId = signal<number | null>(null);
  readonly selectedEstadoReporte = signal<string>('TODOS');
  readonly selectedRatingComentario = signal<string>('TODOS');

  // Estados de carga
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly successMessage = signal<string | null>(null);

  // Datos
  readonly reports = signal<CourtReportResponse[]>([]);
  readonly reviews = signal<ReviewResponse[]>([]);

  // Modal para resolver reporte
  readonly resolvingReport = signal<CourtReportResponse | null>(null);
  readonly resolvingStatus = signal<ReportStatus>('RESUELTO');
  readonly resolvingComment = signal<string>('');
  readonly isSavingResolution = signal<boolean>(false);

  // Sedes y Canchas disponibles para el usuario
  readonly isSuperAdmin = computed(() => this.auth.isSuperAdmin());
  readonly sedesDisponibles = computed(() => {
    if (this.isSuperAdmin()) {
      return this.db.sedes();
    }
    return this.adminContext.venues();
  });

  readonly canchasDisponibles = computed(() => {
    const sedeId = this.selectedSedeId();
    if (!sedeId) return [];
    return this.db.getCanchasPorSede(sedeId);
  });

  readonly filteredReports = computed(() => {
    let list = this.reports();
    const sedeId = this.selectedSedeId();
    const canchaId = this.selectedCanchaId();
    const estado = this.selectedEstadoReporte();

    if (sedeId) {
      list = list.filter((r) => Number(r.sedeId) === Number(sedeId));
    }
    if (canchaId) {
      list = list.filter((r) => Number(r.canchaId) === Number(canchaId));
    }
    if (estado !== 'TODOS') {
      list = list.filter((r) => r.estado === estado);
    }
    return list;
  });

  readonly displayedColumnsReports = [
    'id',
    'canchaSede',
    'tipoProblema',
    'descripcion',
    'reportadoPor',
    'prioridad',
    'estado',
    'fecha',
    'accion',
  ];
  readonly reportsPageIndex = signal(0);
  readonly reportsPageSize = signal(10);
  readonly paginatedReports = computed(() => {
    const start = this.reportsPageIndex() * this.reportsPageSize();
    return this.filteredReports().slice(start, start + this.reportsPageSize());
  });

  onReportsPage(event: PageEvent): void {
    this.reportsPageIndex.set(event.pageIndex);
    this.reportsPageSize.set(event.pageSize);
  }

  readonly filteredReviews = computed(() => {
    let list = this.reviews();
    const canchaId = this.selectedCanchaId();
    const rating = this.selectedRatingComentario();

    if (canchaId) {
      list = list.filter((r) => Number(r.canchaId) === Number(canchaId));
    }
    if (rating !== 'TODOS') {
      const minStars = Number(rating);
      list = list.filter((r) => r.puntuacion === minStars);
    }
    return list;
  });

  readonly stats = computed(() => {
    const reps = this.reports();
    const revs = this.reviews();
    const pendientes = reps.filter((r) => r.estado === 'PENDIENTE').length;
    const enRevision = reps.filter((r) => r.estado === 'EN_REVISION').length;
    const resueltos = reps.filter((r) => r.estado === 'RESUELTO').length;
    const avgRating =
      revs.length > 0
        ? (revs.reduce((acc, curr) => acc + (curr.puntuacion || 0), 0) / revs.length).toFixed(1)
        : '0.0';

    return {
      totalReportes: reps.length,
      pendientes,
      enRevision,
      resueltos,
      totalReviews: revs.length,
      avgRating,
    };
  });

  ngOnInit(): void {
    // Si hay una sede activa en el contexto, inicializar el selector
    const currentVenue = this.adminContext.venue();
    if (currentVenue?.id) {
      this.selectedSedeId.set(Number(currentVenue.id));
    }
    this.loadData();
  }

  onSedeChange(sedeIdStr: string): void {
    const id = sedeIdStr ? Number(sedeIdStr) : null;
    this.selectedSedeId.set(id);
    this.selectedCanchaId.set(null);
    this.loadData();
  }

  onCanchaChange(canchaIdStr: string): void {
    const id = canchaIdStr ? Number(canchaIdStr) : null;
    this.selectedCanchaId.set(id);
    this.loadData();
  }

  loadData(): void {
    this.loading.set(true);
    this.error.set(null);

    const sedeId = this.selectedSedeId();
    const canchaId = this.selectedCanchaId();

    // 1. Cargar Reportes
    const reportsReq = this.courtReportService.getAll({
      sedeId: sedeId ?? undefined,
      canchaId: canchaId ?? undefined,
    });

    reportsReq.subscribe({
      next: (res) => {
        this.reports.set(res || []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message || 'Error al cargar los reportes de canchas');
        this.loading.set(false);
      },
    });

    // 2. Cargar Reseñas
    if (canchaId) {
      this.reviewService.getByCourt(canchaId).subscribe({
        next: (res) => this.reviews.set(res || []),
        error: () => this.reviews.set([]),
      });
    } else if (sedeId) {
      this.reviewService.getByVenue(sedeId).subscribe({
        next: (res) => this.reviews.set(res || []),
        error: () => this.reviews.set([]),
      });
    } else {
      // Si no hay filtro de sede, intentar recopilar de las sedes disponibles
      const sedes = this.sedesDisponibles();
      if (sedes.length > 0) {
        this.reviewService.getByVenue(sedes[0].id).subscribe({
          next: (res) => this.reviews.set(res || []),
          error: () => this.reviews.set([]),
        });
      } else {
        this.reviews.set([]);
      }
    }
  }

  openResolutionModal(report: CourtReportResponse): void {
    this.resolvingReport.set(report);
    this.resolvingStatus.set(report.estado === 'PENDIENTE' ? 'EN_REVISION' : 'RESUELTO');
    this.resolvingComment.set(report.resolucion || '');
  }

  closeResolutionModal(): void {
    this.resolvingReport.set(null);
    this.resolvingComment.set('');
    this.isSavingResolution.set(false);
  }

  saveResolution(): void {
    const rep = this.resolvingReport();
    if (!rep) return;

    this.isSavingResolution.set(true);
    this.courtReportService
      .updateStatus(rep.id, {
        estado: this.resolvingStatus(),
        resolucion: this.resolvingComment().trim() || undefined,
      })
      .subscribe({
        next: (updated) => {
          this.reports.update((list) => list.map((r) => (r.id === updated.id ? updated : r)));
          this.successMessage.set(`Reporte #${updated.id} actualizado con éxito.`);
          setTimeout(() => this.successMessage.set(null), 4000);
          this.closeResolutionModal();
        },
        error: (err) => {
          this.error.set(err?.error?.message || 'Error al actualizar el estado del reporte');
          this.isSavingResolution.set(false);
        },
      });
  }

  formatDate(dateStr?: string): string {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('es-PE', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }
}
