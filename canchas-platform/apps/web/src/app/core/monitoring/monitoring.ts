import { ErrorHandler, Injectable } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '@env/environment';

let sentry: typeof import('@sentry/angular') | null = null;

export function sanitizeClientEvent(event: any): any {
  delete event.user;
  delete event.request;
  delete event.extra;
  delete event.contexts;
  delete event.breadcrumbs;
  delete event.spans;
  delete event.transaction;
  event.message = event.message ? 'Error de la aplicación' : undefined;
  event.tags = { application: 'canchero-web' };
  if (event.exception?.values) {
    for (const exception of event.exception.values) {
      exception.value = '[Contenido omitido]';
      if (exception.stacktrace?.frames)
        for (const frame of exception.stacktrace.frames) {
          if (frame.filename) frame.filename = frame.filename.split(/[?#]/)[0];
          delete frame.vars;
        }
    }
  }
  return event;
}

export async function initializeMonitoring(): Promise<void> {
  if (!environment.sentryEnabled || !environment.sentryDsn) return;
  try {
    const url = new URL(environment.sentryDsn);
    if (
      url.protocol !== 'https:' ||
      !url.username ||
      url.password ||
      !/^\/\d+$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      return;
    sentry = await import('@sentry/angular');
    sentry.init({
      dsn: environment.sentryDsn,
      environment: environment.appEnvironment,
      release: environment.appRelease || undefined,
      dataCollection: {
        userInfo: false,
        cookies: false,
        httpHeaders: false,
        httpBodies: [],
        urlQueryParams: false,
        databaseQueryData: false,
        queues: false,
        stackFrameVariables: false,
        frameContextLines: 0,
        graphQL: { document: false, variables: false },
        genAI: { inputs: false, outputs: false },
        mcp: { inputs: false, outputs: false },
      },
      sendClientReports: false,
      tracesSampleRate: 0,
      defaultIntegrations: false,
      integrations: [sentry.globalHandlersIntegration(), sentry.dedupeIntegration()],
      beforeSend: sanitizeClientEvent,
      beforeBreadcrumb: () => null,
    });
  } catch {
    // El monitoreo nunca impide iniciar Canchero.
    sentry = null;
  }
}

export function reportClientError(error: unknown): void {
  sentry?.captureException(error);
}

@Injectable()
export class MonitoringErrorHandler extends ErrorHandler {
  override handleError(error: unknown): void {
    reportClientError(error);
    super.handleError(error);
  }
}

export const monitoringInterceptor: HttpInterceptorFn = (request, next) =>
  next(request).pipe(
    catchError((error: unknown) => {
      if (
        request.url.startsWith(environment.apiUrl) &&
        error instanceof HttpErrorResponse &&
        error.status >= 500
      ) {
        reportClientError(new Error('HTTP ' + error.status));
      }
      return throwError(() => error);
    }),
  );
