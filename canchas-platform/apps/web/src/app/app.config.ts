import {
  ApplicationConfig,
  ErrorHandler,
  Injectable,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import {
  MAT_DATE_LOCALE,
  MAT_RIPPLE_GLOBAL_OPTIONS,
  provideNativeDateAdapter,
} from '@angular/material/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { authInterceptor } from './core/auth/auth.interceptor';
import { MonitoringErrorHandler, monitoringInterceptor } from './core/monitoring/monitoring';

@Injectable()
export class SpanishMatPaginatorIntl extends MatPaginatorIntl {
  override itemsPerPageLabel = 'Ítems por página:';
  override nextPageLabel = 'Siguiente página';
  override previousPageLabel = 'Página anterior';
  override firstPageLabel = 'Primera página';
  override lastPageLabel = 'Última página';

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    if (length === 0 || pageSize === 0) {
      return `0 de ${length}`;
    }
    const total = Math.max(length, 0);
    const startIndex = page * pageSize;
    const endIndex =
      startIndex < total ? Math.min(startIndex + pageSize, total) : startIndex + pageSize;
    return `${startIndex + 1} – ${endIndex} de ${total}`;
  };
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([monitoringInterceptor, authInterceptor])),
    { provide: ErrorHandler, useClass: MonitoringErrorHandler },
    provideAnimations(),
    provideNativeDateAdapter(),
    { provide: MAT_DATE_LOCALE, useValue: 'es-PE' },
    { provide: MatPaginatorIntl, useClass: SpanishMatPaginatorIntl },
    { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: false } },
    provideRouter(
      routes,
      withInMemoryScrolling({ anchorScrolling: 'enabled', scrollPositionRestoration: 'top' }),
    ),
  ],
};
