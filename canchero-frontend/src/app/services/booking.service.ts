import { Injectable, inject, signal, type WritableSignal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';
import type { Booking, BookingStatus } from '../models/booking.model';

export interface CreateBookingData {
  courtName: string;
  venueName: string;
  venueId: string;
  fecha: string;
  horario: string;
  total: number;
  jugadores?: string[];
}

@Injectable({ providedIn: 'root' })
export class BookingService {
  private readonly http = inject(HttpClient);
  private readonly key = 'canchero_bookings';
  private readonly bookingsSignal: WritableSignal<Booking[]> = signal(this.load());

  readonly bookings = this.bookingsSignal.asReadonly();

  constructor() {}

  getBookingsByPlayer(): Booking[] {
    return this.bookingsSignal();
  }

  getBookingByCode(codigo: string): Booking | undefined {
    return this.bookingsSignal().find((b) => b.codigoPase === codigo);
  }

  createBooking(data: CreateBookingData): Observable<Booking> {
    return this.http
      .post<Booking>(`${environment.apiUrl}/bookings`, data)
      .pipe(
        catchError(() => of(this.createLocal(data))),
      );
  }

  listRemote(): Observable<Booking[]> {
    return this.http
      .get<Booking[]>(`${environment.apiUrl}/bookings`)
      .pipe(catchError(() => of(this.bookingsSignal())));
  }

  updateStatus(id: string, status: BookingStatus): void {
    this.bookingsSignal.update((prev) =>
      prev.map((b) => (b.id === id ? { ...b, status } : b)),
    );
    this.persist(this.bookingsSignal());
  }

  private createLocal(data: CreateBookingData): Booking {
    const booking: Booking = {
      id: `b_${Date.now()}`,
      codigoPase: `#CAN-${Math.floor(1000 + Math.random() * 9000)}`,
      courtName: data.courtName,
      venueName: data.venueName,
      venueId: data.venueId,
      fecha: data.fecha,
      horario: data.horario,
      total: data.total,
      status: 'CONFIRMADO',
      jugadores: data.jugadores ?? [],
    };
    this.bookingsSignal.update((prev) => [booking, ...prev]);
    this.persist(this.bookingsSignal());
    return booking;
  }

  private load(): Booking[] {
    try {
      const raw = localStorage.getItem(this.key);
      if (!raw) {
        return [];
      }
      return JSON.parse(raw) as Booking[];
    } catch {
      return [];
    }
  }

  private persist(bookings: Booking[]): void {
    localStorage.setItem(this.key, JSON.stringify(bookings));
  }
}