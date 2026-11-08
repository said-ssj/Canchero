import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideAnimations } from '@angular/platform-browser/animations';
import { provideRouter, withInMemoryScrolling } from '@angular/router';
import { routes } from './app.routes';
import { MAT_RIPPLE_GLOBAL_OPTIONS } from '@angular/material/core';
import { authInterceptor } from './core/auth/auth.interceptor';
import { MonitoringErrorHandler, monitoringInterceptor } from './core/monitoring/monitoring';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([monitoringInterceptor, authInterceptor])),
    { provide: ErrorHandler, useClass: MonitoringErrorHandler },
    provideAnimations(),
    { provide: MAT_RIPPLE_GLOBAL_OPTIONS, useValue: { disabled: true } },
    provideRouter(routes, withInMemoryScrolling({ anchorScrolling: 'enabled' })),
  ],
};
