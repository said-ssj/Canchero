import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ReviewResponse {
  id: string;
  venueId: string;
  playerName: string;
  puntuacion: number;
  comentario: string;
  bookingCodigoPase: string;
  fecha?: string;
}

export interface PublishReviewData {
  venueId: string;
  playerId: string;
  bookingId: string;
  puntuacion: number;
  comentario: string;
}

@Injectable({ providedIn: 'root' })
export class ReviewService {
  private readonly http = inject(HttpClient);

  getByVenue(venueId: string): Observable<ReviewResponse[]> {
    return this.http
      .get<ReviewResponse[]>(`${environment.apiUrl}/reviews/sede/${venueId}`)
      .pipe(catchError(() => of([])));
  }

  publish(data: PublishReviewData): Observable<ReviewResponse | null> {
    return this.http
      .post<ReviewResponse>(`${environment.apiUrl}/reviews`, data)
      .pipe(catchError(() => of(null)));
  }
}