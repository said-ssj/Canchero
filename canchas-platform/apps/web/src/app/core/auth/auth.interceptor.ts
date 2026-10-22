import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.authToken();
  const isBackendRequest = req.url.startsWith(environment.apiUrl);

  if (!token || !isBackendRequest || req.headers.has('Authorization')) {
    return next(req);
  }

  return next(req.clone({
    setHeaders: {
      Authorization: `Bearer ${token}`,
    },
  })).pipe(catchError((error: unknown) => {
    if (error instanceof HttpErrorResponse && error.status === 401 && auth.authToken() === token) {
      auth.clearSession();
    }
    return throwError(() => error);
  }));
};
