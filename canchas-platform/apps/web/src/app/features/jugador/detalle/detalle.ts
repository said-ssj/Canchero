import { Component, computed, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { toSignal } from '@angular/core/rxjs-interop';
import { finalize } from 'rxjs';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { VenueWeather } from '@shared/components/venue-weather/venue-weather';
import { ProfileHeader } from '@shared/components/profile-header/profile-header';
import { OwnerIdentity } from '@shared/components/profile-header/owner-identity';
import type { VenueDayHours } from '@shared/models/venue-hours.model';
import { DatabaseService } from '@core/supabase/database.service';
import { CourtFilterService } from '@core/services/court-filter.service';
import { MapsService } from '@core/services/maps.service';
import { ReviewService, type ReviewResponse } from './review.service';
import { AuthService } from '@core/auth/auth.service';
import type { Venue } from '@shared/models/venue.model';
import type { Court } from '@shared/models/court.model';

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
  imports: [RouterLink, VenueWeather, ProfileHeader, OwnerIdentity],
  selector: 'app-detalle',
  styleUrl: './detalle.css',
  templateUrl: './detalle.html',
})
export class Detalle {
  private readonly route = inject(ActivatedRoute);
  private readonly routeParams = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  private readonly router = inject(Router);
  private readonly db = inject(DatabaseService);
  private readonly reviewService = inject(ReviewService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly courtFilters = inject(CourtFilterService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly mapsService = inject(MapsService);
  protected readonly comoLlegarModalOpen = signal(false);
  protected readonly venueHours = signal<VenueDayHours[]>([]);
  protected readonly hoursLoading = signal(false);
  protected readonly hoursError = signal(false);
  private hoursRequest = 0;
  protected readonly dayNames = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
  ];
  protected readonly orderedHours = computed(() =>
    [...this.venueHours()].sort((a, b) => ((a.diaSemana + 6) % 7) - ((b.diaSemana + 6) % 7)),
  );
  protected readonly coordinates = computed(() => {
    const source = this.db.sedes().find((sede) => String(sede.id) === this.venue()?.id);
    if (
      source?.latitud == null ||
      source?.longitud == null ||
      source.latitud === '' ||
      source.longitud === ''
    )
      return null;
    const lat = Number(source.latitud),
      lng = Number(source.longitud);
    return Number.isFinite(lat) &&
      Number.isFinite(lng) &&
      Math.abs(lat) <= 90 &&
      Math.abs(lng) <= 180
      ? { lat, lng }
      : null;
  });
  protected readonly whatsappUrl = computed(() => {
    let number = this.venue()?.telefono?.replace(/\D/g, '') ?? '';
    if (/^9\d{8}$/.test(number)) number = '51' + number;
    return /^\d{10,15}$/.test(number) ? `https://wa.me/${number}` : null;
  });

  protected readonly safeMapUrl = computed<SafeResourceUrl>(() => {
    const coords = this.coordinates();
    const url = coords
      ? this.mapsService.getEmbedMapUrl(coords.lat, coords.lng, 16, 'satellite')
      : 'about:blank';
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  constructor() {
    effect(() => {
      const current = this.venue();
      if (current) {
        this.carouselIdx.set(0);
        this.comoLlegarModalOpen.set(false);
        this.reviewModalOpen.set(false);
        this.loadReviews(current.id);
        void this.loadHours(current.id);
      }
    });

    effect(() => {
      const canchas = this.filteredCanchas();
      const currentId = this.selectedCourtId();
      if (canchas.length > 0 && !canchas.some((c) => c.id === currentId)) {
        this.selectedCourtId.set((canchas.find((court) => court.disponible) ?? canchas[0]).id);
      }
    });
  }

  protected readonly venue = computed<Venue | undefined>(() => {
    const id = this.routeParams().get('id');
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
  protected readonly reviewsLoading = signal(false);
  protected readonly reviewsLoadError = signal('');
  private reviewsRequest = 0;
  protected readonly reviewModalOpen = signal(false);
  protected readonly reviewStars = signal(5);
  protected readonly reviewText = signal('');
  protected readonly reviewSubmitting = signal(false);
  protected readonly reviewError = signal('');

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
    return !!venue && !!this.auth.currentUser();
  });

  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  protected readonly fechas = ['Hoy (Vie)', 'Mañana (Sáb)', 'Dom 03'];

  protected readonly horarios: TimeSlot[] = [
    { hora: '18:00 - 19:00', disponible: true },
    { hora: '19:00 - 20:00', disponible: true },
    { hora: '20:00 - 21:00', disponible: false },
    { hora: '21:00 - 22:00', disponible: true },
  ];

  protected readonly isLoading = computed(() => this.db.catalogLoading());
  protected readonly fallbackVenueImg =
    'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=1200&auto=format&fit=crop';

  protected readonly heroImages = computed<string[]>(() => {
    const v = this.venue();
    const source = this.db.sedes().find((sede) => String(sede.id) === v?.id);
    return [
      ...new Set(
        [
          source?.imagen_url,
          ...(Array.isArray(source?.fotos) ? source.fotos : []),
          ...(v?.canchas.map((court) => court.foto) ?? []),
        ].filter((photo): photo is string => typeof photo === 'string' && !!photo.trim()),
      ),
    ];
  });

  protected readonly currentHero = computed<string>(() => {
    const images = this.heroImages();
    return images[this.carouselIdx()] ?? images[0] ?? '';
  });

  protected readonly heroCaption = computed<string>(() => this.venue()?.nombre ?? '');

  protected readonly filteredCanchas = computed<Court[]>(() => {
    const all = this.venue()?.canchas ?? [];
    return all.filter((cancha) => this.courtFilters.matchesCourt(cancha));
  });

  protected readonly selectedCourt = computed<Court | undefined>(() => {
    const canchas = this.filteredCanchas();
    if (canchas.length === 0) {
      return this.venue()?.canchas[0];
    }
    return canchas.find((cancha) => cancha.id === this.selectedCourtId()) ?? canchas[0];
  });

  protected readonly availableCount = computed(
    () => this.filteredCanchas().filter((cancha) => cancha.disponible).length,
  );

  protected readonly tarifaDisplay = computed<string>(() => {
    const court = this.selectedCourt();
    const price = court ? court.precioHora : (this.venue()?.precioBase ?? 0);
    return `S/. ${price}`;
  });

  protected readonly losaName = computed(() => this.selectedCourt()?.nombre ?? '');
  protected readonly summaryTime = computed(
    () => `${this.selectedDateLabel()} • ${this.selectedTimeLabel()}`,
  );

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
    return (
      nombre
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part.charAt(0).toUpperCase())
        .join('') || 'U'
    );
  }

  private loadReviews(venueId: string): void {
    const request = ++this.reviewsRequest;
    this.reviews.set([]);
    this.reviewsLoadError.set('');
    this.reviewsLoading.set(true);
    const current = () => request === this.reviewsRequest && this.venue()?.id === venueId;
    this.reviewService
      .getByVenue(venueId)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => {
          if (current()) this.reviewsLoading.set(false);
        }),
      )
      .subscribe({
        next: (responses) => {
          if (current()) this.reviews.set(this.toReviews(responses));
        },
        error: () => {
          if (current()) this.reviewsLoadError.set('No se pudieron cargar las opiniones.');
        },
      });
  }

  protected async loadHours(venueId: string): Promise<void> {
    const request = ++this.hoursRequest;
    this.venueHours.set([]);
    this.hoursLoading.set(true);
    this.hoursError.set(false);
    try {
      const hours = await this.db.cargarHorariosSede(Number(venueId));
      if (request === this.hoursRequest) this.venueHours.set(hours);
    } catch {
      if (request === this.hoursRequest) this.hoursError.set(true);
    } finally {
      if (request === this.hoursRequest) this.hoursLoading.set(false);
    }
  }

  protected retryReviews(): void {
    const venue = this.venue();
    if (venue) this.loadReviews(venue.id);
  }

  private toReviews(responses: ReviewResponse[]): Review[] {
    const count = this.reservasJugadasDe(this.venue() ?? ({} as Venue)).length || 1;
    return responses.map((response) => ({
      id: response.id,
      author: response.playerName || response.clienteNombre || 'Jugador Canchero',
      rating: response.puntuacion,
      text: response.comentario,
      matchCount: count,
    }));
  }

  protected mapsUrl(venue: Venue): string {
    const lat = venue.latitud != null ? Number(venue.latitud) : -14.06778;
    const lng = venue.longitud != null ? Number(venue.longitud) : -75.72861;
    return this.mapsService.getGoogleMapsDirectionsUrl(lat, lng);
  }

  protected abrirComoLlegar(): void {
    if (!this.coordinates()) return;
    this.comoLlegarModalOpen.set(true);
  }

  protected irDirectoRutaNavegable(): void {
    const coords = this.coordinates();
    if (!coords) return;
    const target = this.mapsService.getGoogleMapsDirectionsUrl(coords.lat, coords.lng);
    window.open(target, '_blank', 'noopener,noreferrer');
    this.comoLlegarModalOpen.set(false);
  }

  protected closeComoLlegarModal(event?: Event): void {
    if (event && (event.target as HTMLElement).closest('.modal-window-classic')) {
      return;
    }
    this.comoLlegarModalOpen.set(false);
  }

  protected closeComoLlegarModalDirect(): void {
    this.comoLlegarModalOpen.set(false);
  }

  protected copiarCoordenadas(venue: Venue): void {
    const coords = this.coordinates();
    if (!coords || venue.id !== this.venue()?.id) return;
    const { lat, lng } = coords;
    navigator.clipboard?.writeText(`${lat}, ${lng}`).then(() => {
      this.showToast('Coordenadas GPS copiadas al portapapeles');
    });
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
    this.showToast(this.favorito() ? 'Agregado a tus canchas favoritas' : 'Eliminado de favoritos');
  }

  protected handleNotificationClick(): void {
    this.notificaciones.update((value) => !value);
    this.showToast('Notificaciones activadas para horarios libres en esta sede');
  }

  protected selectLosa(court: Court): void {
    if (!court.disponible) return;
    this.selectedCourtId.set(court.id);
    const venue = this.venue();
    if (!venue) {
      return;
    }
    void this.router.navigate(['/checkout'], {
      queryParams: {
        courtId: court.id,
      },
    });
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
    if (!venue || !court || !court.disponible) {
      return;
    }
    void this.router.navigate(['/checkout'], {
      queryParams: {
        courtId: court.id,
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
    if (this.reviewSubmitting()) return;
    this.reviewError.set('');
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
    if (!venue || text.length < 10 || !user || this.reviewSubmitting()) {
      return;
    }
    const jugados = this.reservasJugadasDe(venue);
    const reserva = jugados[0];
    if (!reserva) {
      this.reviewError.set(
        'Necesitas una reserva completada en esta sede para publicar una opinion.',
      );
      return;
    }
    this.reviewSubmitting.set(true);
    this.reviewError.set('');
    const sameContext = () =>
      this.auth.currentUser()?.id === user.id && this.venue()?.id === venue.id;
    this.reviewService
      .publish({
        venueId: venue.id,
        playerId: user.id,
        playerName: user.nombre,
        bookingId: String(reserva.id),
        puntuacion: this.reviewStars(),
        comentario: text,
      })
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        finalize(() => this.reviewSubmitting.set(false)),
      )
      .subscribe({
        next: (saved) => {
          if (!sameContext()) return;
          if (!saved?.id) {
            this.reviewError.set('El servidor no confirmo la publicacion de la opinion.');
            return;
          }
          const [review] = this.toReviews([saved]);
          this.reviews.update((prev) => [review, ...prev.filter((item) => item.id !== review.id)]);
          this.reviewModalOpen.set(false);
          this.showToast('Gracias. Tu opinión fue publicada.');
        },
        error: (error) => {
          if (!sameContext()) return;
          const messages: Record<number, string> = {
            401: 'Tu sesion vencio. Inicia sesion para publicar.',
            403: 'No tienes permiso para calificar esta reserva.',
            409: 'Esta reserva ya tiene una opinion o no se puede publicar ahora.',
          };
          this.reviewError.set(
            messages[error?.status] ?? 'No se pudo publicar la opinion. Intenta nuevamente.',
          );
        },
      });
  }

  protected ratingStars(rating: number): number[] {
    const count = Math.max(0, Math.min(5, Math.round(rating)));
    return Array.from({ length: count }, (_, index) => index + 1);
  }

  private reservasJugadasDe(venue: Venue): ReservationMatch[] {
    const currentUser = this.auth.currentUser();
    if (!currentUser) {
      return [];
    }
    const jugador = this.db
      .usuarios()
      .find(
        (u) =>
          String(u.id_usuario ?? u.id) === String(currentUser.id) ||
          (!!currentUser.email &&
            (u.correo || u.email || '').toLowerCase() === currentUser.email.toLowerCase()),
      );
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
