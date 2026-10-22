import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { environment } from '@env/environment';
import { ReviewService } from './review.service';

describe('ReviewService persistence', () => {
  let service: ReviewService;
  let http: HttpTestingController;
  const payload = { venueId: '10', playerId: 'user', bookingId: '101', puntuacion: 5, comentario: 'Buen partido' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ReviewService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => { http.verify(); vi.restoreAllMocks(); });

  it.each([401, 403, 409, 500])('propagates HTTP %s without manufacturing a local review', (status) => {
    const next = vi.fn();
    const error = vi.fn();
    const write = vi.spyOn(Storage.prototype, 'setItem');
    service.publish(payload).subscribe({ next, error });
    http.expectOne(`${environment.apiUrl}/reviews`).flush({ message: 'Rejected' }, { status, statusText: 'Rejected' });
    expect(next).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });

  it('lists only remote opinions without reading browser fixtures', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem');
    let result: unknown;
    service.getByVenue('10').subscribe((value) => { result = value; });
    http.expectOne(`${environment.apiUrl}/reviews/sede/10`).flush([]);
    expect(result).toEqual([]);
    expect(read).not.toHaveBeenCalled();
  });

  it('does not turn a failed listing into an empty success', () => {
    const error = vi.fn();
    const next = vi.fn();
    service.getByVenue('10').subscribe({ error, next });
    http.expectOne(`${environment.apiUrl}/reviews/sede/10`).flush(null, { status: 503, statusText: 'Unavailable' });
    expect(error).toHaveBeenCalledOnce();
    expect(next).not.toHaveBeenCalled();
  });
});
