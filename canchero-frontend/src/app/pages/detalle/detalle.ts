import { Component, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import { ReviewService, type ReviewResponse } from '../../services/review.service';
import { AuthService } from '../../services/auth.service';
import type { Venue } from '../../models/venue.model';
import type { Court } from '../../models/court.model';

export interface Review {
  id: string;
  author: string;
  rating: number;
  text: string;
  matchCount: number;
}

interface ReservationMatch {
  id: number;
  fecha: string;
}

interface TimeSlot {
  hora: string;
  disponible: boolean;
}

@Component({
  imports: [RouterLink],
  selector: 'app-detalle',
  styleUrl: './detalle.css',
  templateUrl: './detalle.html',
})
export class Detalle {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly db = inject(DatabaseService);
  private readonly reviewService = inject(ReviewService);
  private readonly auth = inject(AuthService);

  constructor() {
    effect(() => {
      const current = this.venue();
      if (current) {
        this.loadReviews(current.id);
      }
    });
  }

  protected readonly venue = computed<Venue | undefined>(() => {
    const id = this.route.snapshot.paramMap.get('id');
    return id ? this.db.getVenueDetalle(id) : undefined;
  });

  protected readonly carouselIdx = signal(0);
  protected readonly favorito = signal(false);
  protected readonly notificaciones = signal(false);
  protected readonly selectedCourtId = signal<string>(
    this.venue()?.canchas.find((cancha) => cancha.disponible)?.id ?? '',
  );

  protected readonly selectedDateLabel = signal('Hoy (Vie)');
  protected readonly selectedTimeLabel = signal('19:00 - 20:00');
  protected readonly galleryOpen = signal(false);

  protected readonly toastText = signal('');
  protected readonly toastVisible = signal(false);

  protected readonly reviews = signal<Review[]>([]);
  protected readonly reviewModalOpen = signal(false);
  protected readonly reviewStars = signal(5);
  protected readonly reviewText = signal('');

  protected readonly reviewsAvg = computed<number>(() => {
    const items = this.reviews();
    if (items.length === 0) {
      return 0;
    }
    return items.reduce((sum, review) => sum + review.rating, 0) / items.length;
  });

  protected readonly ratingDisplay = computed<string>(() => this.reviewsAvg().toFixed(1));

  protected readonly reviewCount = computed(
    () => `(${this.reviews().length} ${this.reviews().length === 1 ? 'opinión' : 'opiniones'})`,
  );

  protected readonly canReview = computed<boolean>(() => {
    const venue = this.venue();
    if (!venue) {
      return false;
    }
    return this.reservasJugadasDe(venue).length > 0;
  });

  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly fechas = ['Hoy (Vie)', 'Mañana (Sáb)', 'Dom 03'];

  protected readonly horarios: TimeSlot[] = [
    { hora: '18:00 - 19:00', disponible: true },
    { hora: '19:00 - 20:00', disponible: true },
    { hora: '20:00 - 21:00', disponible: false },
    { hora: '21:00 - 22:00', disponible: true },
  ];

  protected readonly heroImages = computed<string[]>(() => this.venue()?.fotos ?? []);

  protected readonly currentHero = computed<string>(() => {
    const images = this.heroImages();
    return images[this.carouselIdx()] ?? images[0] ?? '';
  });

  protected readonly heroCaption = computed<string>(() => this.venue()?.nombre ?? '');

  protected readonly selectedCourt = computed<Court | undefined>(() => {
    const canchas = this.venue()?.canchas ?? [];
    return canchas.find((cancha) => cancha.id === this.selectedCourtId()) ?? canchas[0];
  });

  protected readonly availableCount = computed(
    () => this.venue()?.canchas.filter((cancha) => cancha.disponible).length ?? 0,
  );

  protected readonly tarifaDisplay = computed<string>(() => {
    const court = this.selectedCourt();
    const price = court ? court.precioHora : (this.venue()?.precioBase ?? 0);
    return `S/. ${price}`;
  });

  protected readonly losaName = computed(() => this.selectedCourt()?.nombre ?? '');
  protected readonly summaryTime = computed(() => `${this.selectedDateLabel()} • ${this.selectedTimeLabel()}`);

  protected readonly summaryTotal = computed<string>(() => {
    const court = this.selectedCourt();
    const price = court ? court.precioHora : (this.venue()?.precioBase ?? 0);
    return `S/. ${price.toFixed(2)}`;
  });

  protected capitalize(value: string): string {
    return value
      .split(' ')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }

  protected initialsOf(nombre: string): string {
    return nombre
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('') || 'U';
  }

  private loadReviews(venueId: string): void {
    this.reviewService.getByVenue(venueId).subscribe((responses) => {
      this.reviews.set(this.toReviews(responses));
    });
  }

  private toReviews(responses: ReviewResponse[]): Review[] {
    const count = this.reservasJugadasDe(this.venue() ?? ({} as Venue)).length || 1;
    return responses.map((response) => ({
      id: response.id,
      author: response.playerName,
      rating: response.puntuacion,
      text: response.comentario,
      matchCount: count,
    }));
  }

  protected mapsUrl(venue: Venue): string {
    return `https://maps.google.com/?q=${encodeURIComponent(venue.direccion)}`;
  }

  protected nextHeroImage(): void {
    const count = Math.max(this.heroImages().length, 1);
    this.carouselIdx.set((this.carouselIdx() + 1) % count);
  }

  protected prevHeroImage(): void {
    const count = Math.max(this.heroImages().length, 1);
    this.carouselIdx.set((this.carouselIdx() - 1 + count) % count);
  }

  protected goToHeroImage(index: number): void {
    this.carouselIdx.set(index);
  }

  protected toggleFavorite(): void {
    this.favorito.update((value) => !value);
    this.showToast(this.favorito() ? '★ ¡Agregado a tus canchas favoritas!' : 'Eliminado de favoritos');
  }

  protected handleNotificationClick(): void {
    this.notificaciones.update((value) => !value);
    this.showToast('🔔 Notificaciones activadas para horarios libres en esta sede');
  }

  protected selectLosa(court: Court): void {
    this.selectedCourtId.set(court.id);
  }

  protected selectDate(label: string): void {
    this.selectedDateLabel.set(label);
  }

  protected selectTimeSlot(hora: string): void {
    this.selectedTimeLabel.set(hora);
  }

  protected goToBookingFlow(): void {
    const venue = this.venue();
    const court = this.selectedCourt();
    if (!venue || !court) {
      return;
    }
    void this.router.navigate(['/checkout'], {
      queryParams: {
        id: venue.id,
        cancha: court.tipo,
        losaName: court.nombre,
        precio: court.precioHora,
        fecha: this.selectedDateLabel(),
        hora: this.selectedTimeLabel(),
      },
    });
  }

  protected openPhotoModal(): void {
    this.galleryOpen.set(true);
  }

  protected closePhotoModal(event: Event): void {
    if ((event.target as HTMLElement).id === 'photoGalleryModal') {
      this.galleryOpen.set(false);
    }
  }

  protected closePhotoModalDirect(): void {
    this.galleryOpen.set(false);
  }

  protected openReviewModal(): void {
    this.reviewStars.set(5);
    this.reviewText.set('');
    this.reviewModalOpen.set(true);
  }

  protected setReviewStars(stars: number): void {
    this.reviewStars.set(stars);
  }

  protected onReviewInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.reviewText.set(target?.value ?? '');
  }

  protected closeReviewModal(event: Event): void {
    if ((event.target as HTMLElement).closest('.modal-window-classic')) {
      return;
    }
    this.reviewModalOpen.set(false);
  }

  protected closeReviewModalDirect(): void {
    this.reviewModalOpen.set(false);
  }

  protected submitReview(): void {
    const venue = this.venue();
    const text = this.reviewText().trim();
    const user = this.auth.currentUser();
    if (!venue || text.length < 10 || !user) {
      return;
    }
    const jugados = this.reservasJugadasDe(venue);
    const review: Review = {
      id: `review_${Date.now()}`,
      author: user.nombre,
      rating: this.reviewStars(),
      text,
      matchCount: Math.max(jugados.length, 1),
    };
    const reserva = jugados[0];
    if (reserva) {
      this.reviewService
        .publish({
          venueId: venue.id,
          playerId: user.id,
          bookingId: String(reserva.id),
          puntuacion: this.reviewStars(),
          comentario: text,
        })
        .subscribe((saved) => {
          if (saved) {
            review.id = saved.id;
          }
          this.reviews.update((prev) => [review, ...prev]);
          this.reviewModalOpen.set(false);
          this.showToast('★ ¡Gracias! Tu opinión fue publicada.');
        });
      return;
    }
    this.reviews.update((prev) => [review, ...prev]);
    this.reviewModalOpen.set(false);
    this.showToast('★ ¡Gracias! Tu opinión fue publicada.');
  }

  private reservasJugadasDe(venue: Venue): ReservationMatch[] {
    const estadoCuenta = this.auth.currentUser()?.email;
    const jugador = this.db.usuarios().find(
      (u) => u.email.toLowerCase() === (estadoCuenta ?? 'jugador@canchero.pe').toLowerCase(),
    ) ?? this.db.usuarios()[0];
    if (!jugador) {
      return [];
    }
    const canchaIds = this.db
      .canchas()
      .filter((c) => String(c.sede_id) === String(venue.id))
      .map((c) => c.id);
    return this.db
      .reservas()
      .filter(
        (r) =>
          r.usuario_id === jugador.id &&
          r.estado === 'completada' &&
          canchaIds.includes(r.cancha_id),
      )
      .map((r) => ({ id: r.id, fecha: r.fecha }));
  }

  private showToast(message: string): void {
    this.toastText.set(message);
    this.toastVisible.set(true);
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => this.toastVisible.set(false), 3000);
  }
}