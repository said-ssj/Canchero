import { TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptors, HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';
import { environment } from '../../../environments/environment';

describe('Authenticated API requests', () => {
  it('clears an expired session when a protected request returns 401', () => {
    let token: string | null = 'test-token';
    TestBed.configureTestingModule({ providers: [
      provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(),
      { provide: AuthService, useValue: { authToken: () => token, clearSession: () => { token = null; } } },
    ] });
    TestBed.inject(HttpClient).get(`${environment.apiUrl}/private`).subscribe({ error: () => undefined });
    const http = TestBed.inject(HttpTestingController);
    const request = http.expectOne(`${environment.apiUrl}/private`);
    expect(request.request.headers.get('Authorization')).toBe('Bearer test-token');
    request.flush(null, { status: 401, statusText: 'Unauthorized' });
    expect(token).toBeNull();
    http.verify();
  });
});
