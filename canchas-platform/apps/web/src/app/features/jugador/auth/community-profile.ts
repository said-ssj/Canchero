import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { CourtReportService } from '@core/services/court-report.service';
import {
  CommunityProfileService,
  CommunityProfile as Profile,
  CommunityPost,
  CommunityReview,
} from '@core/services/community-profile.service';
import { ProfileHeader } from '@shared/components/profile-header/profile-header';
import { NotificationPreferences } from '@shared/components/notification-preferences/notification-preferences';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';

@Component({
  selector: 'app-community-profile',
  imports: [
    FormsModule,
    RouterLink,
    DatePipe,
    ProfileHeader,
    NotificationPreferences,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
  ],
  templateUrl: './community-profile.html',
  styleUrl: './community-profile.css',
})
export class CommunityProfilePage {
  readonly userId = input<string | null>(null);
  readonly embedded = input(false);
  readonly editAccount = output<void>();

  private readonly api = inject(CommunityProfileService);
  private readonly auth = inject(AuthService);
  protected readonly db = inject(DatabaseService);
  private readonly courtReportService = inject(CourtReportService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly params = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  protected readonly id = computed(() => this.userId() || this.params().get('id') || '');
  protected readonly profile = signal<Profile | null>(null);
  protected readonly posts = signal<CommunityPost[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly postsError = signal('');
  protected readonly actionError = signal('');
  protected readonly shareToast = signal('');
  protected readonly moreMenuOpen = signal(false);
  protected readonly isBlocked = signal(false);

  /* Modal de aviso para iniciar sesión (Visitantes sin sesión) */
  protected readonly authPromptOpen = signal(false);
  protected readonly authPromptReason = signal('');

  /* Modal de reporte de perfil */
  protected readonly reportModalOpen = signal(false);
  protected readonly reportReason = signal('Contenido inapropiado o spam');

  /* Edición de información dentro de la pestaña Información (sin desmontar la vista) */
  protected readonly editingInfo = signal(false);
  protected editNombre = '';
  protected editApellido = '';
  protected editHandle = '';
  protected editTelefono = '';
  protected editDireccion = '';
  protected editDistrito: number | null = null;
  protected editBiography = '';
  protected editShowPhonePublic = false;
  protected editShowAddressPublic = false;
  protected editShowFavoriteVenuePublic = true;
  protected readonly customHandle = signal<string>('');
  protected readonly handleValidationError = signal<string>('');
  protected readonly isFavoriteVenuePublic = signal<boolean>(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('canchero_show_venue_public') !== 'false'
      : true,
  );
  protected readonly myBookings = signal<any[]>([]);

  /* Emoji Picker */
  protected readonly emojiPickerOpen = signal(false);
  protected readonly emojis = signal<string[]>([
    '⚽',
    '🏆',
    '🔥',
    '👍',
    '👏',
    '🎉',
    '🏃',
    '🥅',
    '👟',
    '🍺',
    '🍕',
    '😎',
    '💪',
    '📍',
    '📅',
    '⚡',
    '🥇',
    '🥈',
    '🥉',
    '🎯',
    '❤️',
    '🙌',
    '💯',
    '🤩',
    '👋',
    '🥳',
    '💥',
    '🤝',
    '🚀',
    '🏟️',
    '🥎',
    '🏀',
    '🏐',
    '🎾',
    '🏓',
    '🥊',
    '🥋',
    '🥤',
    '🥪',
    '🍔',
    '⭐',
    '✨',
    '😃',
    '😄',
    '😁',
    '😆',
    '🤙',
    '👊',
  ]);
  private emojiLoaded = false;

  protected readonly busy = signal(false);
  protected readonly reading = signal(false);
  protected readonly tab = signal('publicaciones');
  protected readonly previewRole = signal<'auto' | 'owner' | 'visitor'>('owner');
  protected readonly settingsOpen = signal(false);
  protected readonly draftPhotos = signal<string[]>([]);
  protected readonly following = signal<boolean | null>(null);
  protected readonly relationshipBusy = signal(false);
  protected readonly hasMore = signal(false);
  protected readonly moreBusy = signal(false);
  protected text = '';
  protected biography = '';
  protected whatsapp = '';
  protected cover: string | null = null;
  private page = 0;
  private request = 0;

  /* Reseñas: respuestas del dueño y nuevas reseñas */
  protected readonly replyingReviewIndex = signal<number | null>(null);
  protected replyText = '';
  protected readonly reviewModalOpen = signal(false);
  protected readonly newReviewRating = signal(5);
  protected newReviewText = '';

  protected readonly isOwnerPerspective = computed(() => {
    if (this.previewRole() === 'owner') return true;
    if (this.previewRole() === 'visitor') return false;
    return this.business() && this.isSelf();
  });

  protected readonly isVisitorPerspective = computed(() => !this.isOwnerPerspective());

  protected togglePerspective(): void {
    const next = this.isOwnerPerspective() ? 'visitor' : 'owner';
    this.previewRole.set(next);
    this.shareToast.set(
      next === 'owner' ? 'Perspectiva: Vista del dueño' : 'Perspectiva: Vista de visitante',
    );
    setTimeout(() => this.shareToast.set(''), 2200);
  }

  protected readonly ownerRating = computed<number>(() => {
    const p = this.profile();
    if (!p) return 0;
    if (Array.isArray(p.reviews) && p.reviews.length > 0) {
      const sum = p.reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
      return Math.min(5, Math.max(0, sum / p.reviews.length));
    }
    if (typeof p.rating === 'number' && !Number.isNaN(p.rating) && p.rating > 0) {
      return Math.min(5, Math.max(0, p.rating));
    }
    return 0;
  });

  protected readonly filledStarsCount = computed<number>(() =>
    Math.max(0, Math.min(5, Math.round(this.ownerRating()))),
  );

  protected readonly isSelf = computed(() => {
    if (this.previewRole() === 'owner') return true;
    if (this.previewRole() === 'visitor') return false;
    const u = this.auth.user();
    if (!u) return false;
    const targetId = this.id();
    if (
      !targetId ||
      targetId === 'self' ||
      targetId === 'me' ||
      String(u.id) === String(targetId)
    ) {
      return true;
    }
    if (this.auth.isOwner()) {
      if (
        targetId === 'dueno' ||
        targetId === 'labombonera' ||
        targetId === 'owner-1' ||
        targetId === 'user-owner' ||
        targetId === '1'
      ) {
        return true;
      }
      const sedes = this.db.getSedesPorDueno(u.id);
      if (sedes.some((s) => String(s.id) === targetId || String(s.id_sede) === targetId)) {
        return true;
      }
    }
    return false;
  });
  protected readonly signedIn = this.auth.isLoggedIn;

  protected readonly avatarUrl = computed<string | null>(() => {
    const p = this.profile();
    if (this.isSelf()) {
      const u = this.auth.user();
      const player =
        typeof this.auth.playerProfile === 'function' ? this.auth.playerProfile() : null;
      const stored =
        u?.id && typeof localStorage !== 'undefined'
          ? localStorage.getItem(`canchero_user_avatar_${u.id}`)
          : null;
      return player?.foto || stored || p?.photo || null;
    }
    return p?.photo || null;
  });

  protected readonly initials = computed(() => {
    const p = this.profile();
    if (!p) return 'JC';
    return (
      p.name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'JC'
    );
  });

  protected readonly business = computed(
    () => this.profile()?.role === 'Dueño' || !!this.profile()?.venues.length,
  );

  protected readonly handle = computed(() => {
    const p = this.profile();
    if (!p) return 'jugadorcanchero';
    if (this.business()) return 'labombonera';
    const u = this.auth.user();
    const stored =
      u?.id && typeof localStorage !== 'undefined'
        ? localStorage.getItem(`canchero_custom_handle_${u.id}`)
        : null;
    if (stored) return stored;
    if (this.customHandle()) return this.customHandle();
    if (p.handle) return p.handle;
    return p.name.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jugadorcanchero';
  });

  /* UBICACIÓN REAL (Sin inventar Chincha si no la tiene) */
  protected readonly pLocation = computed(() => {
    const p = this.profile();
    if (!p) return '';
    if (p.venues?.length && p.venues[0].district) {
      return `${p.venues[0].district}${p.venues[0].city ? ', ' + p.venues[0].city : ''}`;
    }
    const player = typeof this.auth.playerProfile === 'function' ? this.auth.playerProfile() : null;
    if (this.isSelf() && player?.direccion) {
      return player.direccion;
    }
    if (p.address && p.isAddressPublic) {
      return p.address;
    }
    return '';
  });

  protected readonly memberSince = computed(() => 'Octubre 2026');
  protected readonly matchesPlayed = computed(() => {
    if (this.isSelf()) {
      const bookings = this.myBookings();
      if (bookings.length > 0) return bookings.length;
      const u = this.auth.user();
      if (u?.id) {
        const dbReservas = this.db.getReservasPorJugador(u.id);
        if (dbReservas.length > 0) return dbReservas.length;
      }
    }
    return this.profile()?.matchesPlayed ?? 0;
  });

  protected readonly mostPlayedVenue = computed(() => {
    if (this.isSelf()) {
      const all = [...this.myBookings()];
      const u = this.auth.user();
      if (u?.id) {
        const dbReservas = this.db.getReservasPorJugador(u.id);
        for (const r of dbReservas) {
          if (!all.some((b) => b.id === r.id)) all.push(r);
        }
      }
      if (all.length > 0) {
        const counts = new Map<string, number>();
        for (const b of all) {
          const vName =
            b.venueName ||
            b.sede ||
            b.nombre_sede ||
            (b.cancha_id ? this.db.canchaById(b.cancha_id)?.nombre : null);
          if (vName) {
            counts.set(vName, (counts.get(vName) || 0) + 1);
          }
        }
        let topVenue = '';
        let maxCount = 0;
        for (const [name, count] of counts.entries()) {
          if (count > maxCount) {
            maxCount = count;
            topVenue = name;
          }
        }
        if (topVenue) return topVenue;
      }
    }
    return this.profile()?.favoriteVenue || null;
  });

  protected readonly favoriteVenue = computed(
    () => this.mostPlayedVenue() || 'Sin actividad reciente',
  );

  protected readonly currentUrl = computed(() => {
    return typeof window !== 'undefined' ? window.location.pathname : `/perfiles/${this.id()}`;
  });

  protected readonly courts = computed(() => {
    const p = this.profile();
    if (!p) return [];
    const seenIds = new Set<string>();
    const result: any[] = [];

    for (const venue of p.venues ?? []) {
      const detalleCanchas = this.db.getVenueDetalle(venue.id)?.canchas ?? [];
      for (const court of detalleCanchas) {
        const key = String(court.id);
        if (!seenIds.has(key)) {
          seenIds.add(key);
          result.push({
            ...court,
            venueId: venue.id,
            venueName: venue.name,
          });
        }
      }
      const rawCanchas =
        typeof this.db.getCanchasPorSede === 'function'
          ? (this.db.getCanchasPorSede(Number(venue.id)) ?? [])
          : [];
      for (const c of rawCanchas) {
        const key = String(c.id);
        if (!seenIds.has(key)) {
          seenIds.add(key);
          result.push({
            id: String(c.id),
            nombre: c.nombre,
            tipo: c.tipo || 'Fútbol 7',
            superficie: c.superficie || 'Grass sintético',
            cobertura: c.cobertura || 'Iluminación LED',
            precioHora: Number(c.precio_hora || c.precio_dia || 80),
            disponible: c.activa !== false && c.estado !== 'mantenimiento',
            foto: c.imagenes?.[0] || 'assets/cancha-default.jpg',
            equipamiento: c.equipamiento ?? [],
            venueId: venue.id,
            venueName: venue.name,
          });
        }
      }
    }
    return result;
  });

  protected readonly gallery = computed(() => {
    const photos: { url: string; label: string; venueId?: string }[] = [];
    for (const post of this.posts())
      for (const url of post.photos)
        photos.push({ url, label: 'Publicación de ' + this.profile()?.name });
    for (const venue of this.profile()?.venues ?? []) {
      if (venue.photo) photos.push({ url: venue.photo, label: venue.name, venueId: venue.id });
      for (const court of this.courts().filter((c) => c.venueId === venue.id))
        if (court.foto)
          photos.push({
            url: court.foto,
            label: court.nombre + ' · ' + venue.name,
            venueId: venue.id,
          });
    }
    return photos.filter(
      (photo, index) => photos.findIndex((item) => item.url === photo.url) === index,
    );
  });

  protected readonly services = computed(() => {
    const p = this.profile();
    if (!p) return [];
    return p.venues.map((venue) => {
      const detalle = this.db.getVenueDetalle(venue.id);
      const venueAmenities = (detalle?.amenidades ?? [])
        .map((a: any) => (typeof a === 'string' ? a : a?.label || a?.nombre || ''))
        .filter(Boolean);
      const courts = this.courts().filter((c) => c.venueId === venue.id);
      const courtEquip = courts
        .flatMap((c: any) => c.equipamiento ?? [])
        .map((e: any) => (typeof e === 'string' ? e : e?.label || e?.nombre || ''))
        .filter(Boolean);
      const items = [...new Set([...venueAmenities, ...courtEquip])];
      return {
        venue,
        items,
      };
    });
  });

  /* Horarios y Servicios para la vista del perfil de dueño */
  protected readonly horarios = [
    { dia: 'Lunes (hoy)', hora: '07:00 – 23:00' },
    { dia: 'Martes', hora: '07:00 – 23:00' },
    { dia: 'Miércoles', hora: '07:00 – 23:00' },
    { dia: 'Jueves', hora: '07:00 – 23:00' },
    { dia: 'Viernes', hora: '07:00 – 24:00' },
    { dia: 'Sábado', hora: '07:00 – 24:00' },
    { dia: 'Domingo', hora: '08:00 – 22:00' },
  ];

  protected readonly serviciosSede = [
    { icon: 'local_parking', label: 'Estacionamiento' },
    { icon: 'shower', label: 'Vestuarios y duchas' },
    { icon: 'lightbulb', label: 'Iluminación LED' },
    { icon: 'local_cafe', label: 'Cafetería' },
    { icon: 'sports_soccer', label: 'Balones y chalecos' },
  ];

  protected get ratingBreakdown(): { stars: number; count: number; pct: number }[] {
    const reviews = this.profile()?.reviews ?? [];
    const total = reviews.length;
    return [5, 4, 3, 2, 1].map((stars) => {
      const count = reviews.filter((r) => Math.round(Number(r.rating || 0)) === stars).length;
      const pct = total > 0 ? Math.round((count / total) * 100) : 0;
      return { stars, count, pct };
    });
  }

  constructor() {
    effect(() => {
      const id = this.id();
      if (id) void this.load(id);
    });
    effect(() => {
      const p = this.profile(),
        user = this.auth.user();
      this.following.set(null);
      if (p && user && p.id !== user.id) void this.loadRelationship(p.id, user.id);
    });
  }

  protected async load(id = this.id()): Promise<void> {
    const request = ++this.request;
    this.loading.set(true);
    this.error.set('');
    this.profile.set(null);
    this.posts.set([]);
    this.postsError.set('');
    this.actionError.set('');
    this.draftPhotos.set([]);
    this.text = '';
    this.page = 0;
    this.settingsOpen.set(false);
    this.editingInfo.set(false);
    this.hasMore.set(false);

    if (this.isSelf()) {
      void this.db
        .fetchMyBookings()
        .then((b) => {
          if (Array.isArray(b)) this.myBookings.set(b);
        })
        .catch(() => {});
    }

    // Verificar si el usuario está bloqueado
    if (this.isUserBlocked(id)) {
      this.isBlocked.set(true);
      this.loading.set(false);
      return;
    }
    this.isBlocked.set(false);

    try {
      const profile = await firstValueFrom(this.api.profile(id));
      if (request !== this.request) return;
      this.profile.set(profile);
      this.tab.set('publicaciones');
      await this.loadPosts(id, 0, request);
    } catch {
      if (request === this.request) {
        if (this.isSelf()) {
          const u = this.auth.user();
          if (u) {
            const player =
              typeof this.auth.playerProfile === 'function' ? this.auth.playerProfile() : null;
            const sedes = this.db.getSedesPorDueno(u.id);
            const isOwner = this.auth.isOwner();
            this.profile.set({
              id: u.id,
              name: player ? `${player.nombre} ${player.apellido}`.trim() || u.nombre : u.nombre,
              role: isOwner ? 'Dueño' : 'Jugador',
              photo: player?.foto || null,
              cover: null,
              biography: '',
              whatsapp: player?.telefono || '',
              followers: isOwner ? 214 : 0,
              following: isOwner ? 45 : 0,
              postCount: 0,
              rating: null,
              reviewCount: 0,
              reviews: [],
              matchesPlayed: 0,
              favoriteVenue: undefined,
              venues: sedes.map((s) => ({
                id: s.id,
                name: s.nombre,
                district: s.distrito,
                city: s.departamento,
                address: s.direccion,
                photo: s.imagenes?.[0] || null,
                phone: s.telefono || null,
              })),
            });
            this.tab.set('publicaciones');
            this.error.set('');
            return;
          }
        }

        // Detectar si el ID consultado corresponde a un dueño o sede
        const venue = this.db
          .sedes()
          .find(
            (s: any) =>
              String(s.id) === String(id) ||
              String(s.id_sede) === String(id) ||
              String(s.id_dueno) === String(id),
          );
        const isOwnerView =
          !!venue ||
          id === 'dueno' ||
          id === 'labombonera' ||
          id.startsWith('owner') ||
          id.includes('dueno') ||
          this.previewRole() === 'owner';

        if (isOwnerView) {
          const vName = venue?.nombre || 'Canchas La Bombonera – Moquegua';
          const vDistrict = venue?.distrito || 'Mariscal Nieto';
          const vCity = venue?.departamento || 'Moquegua';
          const vAddress =
            venue?.direccion || 'Av. Los Libertadores Nº 394, Mariscal Nieto, Moquegua';
          const vPhone = venue?.telefono || '916 518 518';

          this.profile.set({
            id: id || 'labombonera',
            name: vName,
            role: 'Dueño',
            verified: true,
            photo: venue?.imagenes?.[0] || null,
            cover: null,
            biography:
              'Sede deportiva con canchas de alquiler por hora en Moquegua. Grass sintético de última generación, iluminación LED y ambiente familiar. ¡Reserva tu turno y juega seguro!',
            whatsapp: vPhone,
            phone: vPhone,
            address: vAddress,
            isPhonePublic: true,
            isAddressPublic: true,
            ruc: '20•••••••81',
            rucValidated: true,
            canchasCount: 14,
            followers: 214,
            following: 45,
            postCount: 3,
            rating: null,
            reviewCount: 0,
            venues: [
              {
                id: String(venue?.id || venue?.id_sede || '1'),
                name: vName,
                district: vDistrict,
                city: vCity,
                address: vAddress,
                phone: vPhone,
                photo: venue?.imagenes?.[0] || null,
              },
            ],
            reviews: [],
          });
          this.tab.set('publicaciones');
          this.posts.set([
            {
              id: 'p-owner-1',
              authorId: id,
              text: 'Martes y miércoles: 2 horas al precio de 1 hora y media en Cancha 3. ¡Solo esta semana!',
              badge: 'Promoción',
              photos: [],
              createdAt: new Date().toISOString(),
              likes: 12,
              commentCount: 4,
            },
          ]);
        } else {
          // Perfil de jugador visitante (sin publicaciones de momento)
          this.profile.set({
            id: id || 'jugadorcanchero',
            name: 'Jugador Canchero',
            role: 'Jugador',
            verified: false,
            photo: null,
            cover: null,
            biography: '',
            whatsapp: '',
            phone: '',
            address: '',
            isPhonePublic: false,
            isAddressPublic: false,
            followers: 0,
            following: 0,
            postCount: 0,
            matchesPlayed: 0,
            favoriteVenue: undefined,
            rating: null,
            reviewCount: 0,
            reviews: [],
            venues: [],
          });
          this.tab.set('publicaciones');
          this.posts.set([]);
        }
        this.error.set('');
      }
    } finally {
      if (request === this.request) this.loading.set(false);
    }
  }

  /* Acciones de Reseñas */
  protected iniciarRespuesta(index: number): void {
    this.replyingReviewIndex.set(index);
    this.replyText = '';
  }

  protected cancelarRespuesta(): void {
    this.replyingReviewIndex.set(null);
    this.replyText = '';
  }

  protected enviarRespuesta(index: number): void {
    if (!this.replyText.trim()) return;
    const p = this.profile();
    if (!p) return;
    const updatedReviews = [...p.reviews];
    updatedReviews[index] = {
      ...updatedReviews[index],
      response: this.replyText.trim(),
    };
    this.profile.set({ ...p, reviews: updatedReviews });
    this.replyingReviewIndex.set(null);
    this.replyText = '';
    this.shareToast.set('Respuesta enviada correctamente');
    setTimeout(() => this.shareToast.set(''), 3000);
  }

  protected abrirEscribirResena(): void {
    if (!this.signedIn()) {
      this.openAuthPrompt('escribir una reseña en esta sede');
      return;
    }
    this.reviewModalOpen.set(true);
  }

  protected enviarNuevaResena(): void {
    if (!this.newReviewText.trim()) return;
    const p = this.profile();
    if (!p) return;
    const userName = this.auth.user()?.nombre || 'Jugador Canchero';
    const initials =
      userName
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'JC';

    const newRev: CommunityReview = {
      venueId: p.venues[0]?.id || '1',
      venueName: p.venues[0]?.name || p.name,
      author: userName,
      authorInitials: initials,
      rating: this.newReviewRating(),
      text: this.newReviewText.trim(),
      date: 'hace un momento',
      reservedHere: true,
      response: null,
    };

    const updatedReviews = [newRev, ...p.reviews];
    this.profile.set({
      ...p,
      reviewCount: (p.reviewCount || 0) + 1,
      reviews: updatedReviews,
    });
    this.reviewModalOpen.set(false);
    this.newReviewText = '';
    this.shareToast.set('¡Tu reseña fue publicada con éxito!');
    setTimeout(() => this.shareToast.set(''), 3000);
  }

  private isUserBlocked(userId: string): boolean {
    if (typeof localStorage === 'undefined' || !userId) return false;
    try {
      const blocked = JSON.parse(localStorage.getItem('canchero_blocked_users') || '[]');
      return Array.isArray(blocked) && blocked.includes(userId);
    } catch {
      return false;
    }
  }

  private async loadPosts(id: string, page: number, request = this.request) {
    try {
      const result = await firstValueFrom(this.api.posts(id, page));
      if (request !== this.request) return;
      this.posts.update((items) => (page ? [...items, ...result.items] : result.items));
      this.hasMore.set(result.hasMore);
      this.page = page;
      this.postsError.set('');
    } catch {
      if (request === this.request) this.postsError.set('No se pudieron cargar las publicaciones.');
    }
  }

  protected async more() {
    if (this.moreBusy()) return;
    this.moreBusy.set(true);
    await this.loadPosts(this.id(), this.page + 1);
    this.moreBusy.set(false);
  }

  protected async retryPosts() {
    await this.loadPosts(this.id(), 0);
  }

  /* ================= EDICIÓN INTEGRADA EN PESTAÑA INFORMACIÓN ================= */
  protected editProfile() {
    this.startEditingInfo();
  }

  protected onHandleInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    let val = target.value.trim().toLowerCase().replace(/\s+/g, '');
    if (val.startsWith('@')) val = val.substring(1);
    this.editHandle = val;
    this.validateHandle(val);
  }

  protected validateHandle(val: string): boolean {
    if (!val) {
      this.handleValidationError.set('');
      return true;
    }
    if (val.length < 3 || val.length > 30) {
      this.handleValidationError.set('El @username debe tener entre 3 y 30 caracteres.');
      return false;
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(val)) {
      this.handleValidationError.set(
        'Solo se permiten letras, números, puntos, guiones y guion bajo.',
      );
      return false;
    }
    const u = this.auth.user();
    const existing = this.db.usuarios().find((other: any) => {
      const otherId = String(other.id_usuario || other.id);
      if (u?.id && String(u.id) === otherId) return false;
      const otherHandle = (other.username || other.handle || '').toLowerCase();
      return otherHandle === val;
    });
    if (existing) {
      this.handleValidationError.set('Este @username ya está en uso.');
      return false;
    }
    this.handleValidationError.set('');
    return true;
  }

  protected startEditingInfo(): void {
    const p = this.profile();
    const player = typeof this.auth.playerProfile === 'function' ? this.auth.playerProfile() : null;
    const u = this.auth.user();
    this.editNombre = player?.nombre || p?.name?.split(' ')[0] || '';
    this.editApellido = player?.apellido || p?.name?.split(' ').slice(1).join(' ') || '';
    const storedHandle =
      u?.id && typeof localStorage !== 'undefined'
        ? localStorage.getItem(`canchero_custom_handle_${u.id}`)
        : null;
    this.editHandle = storedHandle || p?.handle || this.handle();
    this.handleValidationError.set('');
    this.editTelefono = player?.telefono || p?.whatsapp || '';
    this.editDireccion = player?.direccion || '';
    this.editDistrito = player?.idDistrito || null;
    this.editBiography = p?.biography || '';
    this.editShowPhonePublic = p?.isPhonePublic || false;
    this.editShowAddressPublic = p?.isAddressPublic || false;
    this.editShowFavoriteVenuePublic = this.isFavoriteVenuePublic();
    this.tab.set('información');
    this.editingInfo.set(true);
  }

  protected cancelEditingInfo(): void {
    this.editingInfo.set(false);
    this.handleValidationError.set('');
  }

  protected async saveEditingInfo(): Promise<void> {
    if (this.busy()) return;
    if (this.editHandle && !this.validateHandle(this.editHandle)) {
      this.actionError.set(this.handleValidationError() || 'Revisa el @username.');
      return;
    }
    this.busy.set(true);
    try {
      const full = `${this.editNombre} ${this.editApellido}`.trim();
      const currentPhoto = this.avatarUrl() || this.profile()?.photo || null;
      const updatedProfile = {
        nombre: this.editNombre,
        apellido: this.editApellido,
        telefono: this.editTelefono || null,
        direccion: this.editDireccion || null,
        foto: currentPhoto,
        completo: !!(this.editNombre && this.editApellido),
        idDistrito: this.editDistrito,
      };
      await firstValueFrom(this.auth.savePlayerProfile(updatedProfile));

      if (this.editBiography !== (this.profile()?.biography || '')) {
        await firstValueFrom(
          this.api.saveSettings({
            biography: this.editBiography,
            whatsapp: this.editTelefono,
            cover: this.profile()?.cover || null,
          }),
        );
      }

      const u = this.auth.user();
      if (this.editHandle && u?.id && typeof localStorage !== 'undefined') {
        localStorage.setItem(`canchero_custom_handle_${u.id}`, this.editHandle);
        this.customHandle.set(this.editHandle);
      }
      this.isFavoriteVenuePublic.set(this.editShowFavoriteVenuePublic);
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(
          'canchero_show_venue_public',
          String(this.editShowFavoriteVenuePublic),
        );
      }

      this.profile.update((current) =>
        current
          ? {
              ...current,
              name: full || current.name,
              handle: this.editHandle || current.handle,
              biography: this.editBiography,
              whatsapp: this.editTelefono,
              phone: this.editTelefono,
              address: this.editDireccion,
              isPhonePublic: this.editShowPhonePublic,
              isAddressPublic: this.editShowAddressPublic,
              isFavoriteVenuePublic: this.editShowFavoriteVenuePublic,
              favoriteVenue: this.mostPlayedVenue() || undefined,
            }
          : current,
      );

      this.editingInfo.set(false);
      this.shareToast.set('Perfil actualizado correctamente');
      setTimeout(() => this.shareToast.set(''), 3000);
    } catch {
      this.actionError.set('No pudimos guardar los cambios. Inténtalo nuevamente.');
    } finally {
      this.busy.set(false);
    }
  }

  protected openSettings() {
    const p = this.profile();
    if (!p) return;
    this.biography = p.biography;
    this.whatsapp = p.whatsapp;
    this.cover = p.cover;
    this.settingsOpen.set(true);
    this.actionError.set('');
  }

  protected async saveSettings() {
    if (!this.isSelf() || this.busy() || this.reading()) return;
    const id = this.id();
    this.busy.set(true);
    this.actionError.set('');
    try {
      const settings = await firstValueFrom(
        this.api.saveSettings({
          biography: this.biography,
          whatsapp: this.whatsapp,
          cover: this.cover,
        }),
      );
      if (id !== this.id()) return;
      this.profile.update((p) => (p ? { ...p, ...settings } : p));
      this.settingsOpen.set(false);
    } catch {
      this.actionError.set(
        'No pudimos guardar la presentación. Revisa los datos e inténtalo otra vez.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  /* ================= CONTROL DE ACCIONES DE VISITANTES SIN SESIÓN ================= */
  protected openAuthPrompt(reason: string): void {
    this.authPromptReason.set(reason);
    this.authPromptOpen.set(true);
  }

  protected handleFollowClick(): void {
    if (!this.signedIn()) {
      this.openAuthPrompt('seguir a este usuario');
      return;
    }
    void this.follow();
  }

  protected handleMessageClick(p: Profile): void {
    if (!this.signedIn()) {
      this.openAuthPrompt('enviar un mensaje a este usuario');
      return;
    }
    if (p.whatsapp) {
      window.open(
        'https://wa.me/' + p.whatsapp.replace(/\D/g, ''),
        '_blank',
        'noopener,noreferrer',
      );
      return;
    }
    this.shareToast.set('Mensajería directa disponible próximamente.');
    setTimeout(() => this.shareToast.set(''), 3000);
  }

  protected handleReservarClick(): void {
    if (this.business()) {
      this.tab.set('canchas');
      const canchasSec = document.querySelector('.profile-content');
      if (canchasSec) canchasSec.scrollIntoView({ behavior: 'smooth' });
    }
  }

  protected handleWhatsAppClick(p: Profile): void {
    const num = p.whatsapp || p.phone || '916518518';
    window.open('https://wa.me/' + num.replace(/\D/g, ''), '_blank', 'noopener,noreferrer');
  }

  protected toggleLike(post: CommunityPost): void {
    if (!this.signedIn()) {
      this.openAuthPrompt('dar me gusta a publicaciones');
      return;
    }
    post.liked = !post.liked;
    post.likes = (post.likes || 0) + (post.liked ? 1 : -1);
  }

  protected handleCommentClick(post: CommunityPost): void {
    if (!this.signedIn()) {
      this.openAuthPrompt('comentar publicaciones');
      return;
    }
    this.shareToast.set('Comentarios disponibles próximamente.');
    setTimeout(() => this.shareToast.set(''), 3000);
  }

  protected compartirPost(post: CommunityPost): void {
    this.compartirPerfil();
  }

  protected handleWriteReviewClick(): void {
    if (!this.signedIn()) {
      this.openAuthPrompt('escribir una reseña');
      return;
    }
    this.shareToast.set('Solo jugadores con reserva confirmada en esta sede pueden reseñar.');
    setTimeout(() => this.shareToast.set(''), 3500);
  }

  /* ================= MENÚ ⋯ Y MODERACIÓN ================= */
  protected openReportModal(): void {
    if (!this.signedIn()) {
      this.openAuthPrompt('reportar este perfil');
      return;
    }
    this.moreMenuOpen.set(false);
    this.reportModalOpen.set(true);
  }

  protected enviarReporte(): void {
    const p = this.profile();
    if (p) {
      this.courtReportService
        .createReport({
          canchaId: 0,
          tipoProblema: 'PERFIL_USUARIO',
          descripcion: `Reporte de perfil [${p.name}] (${p.id}): ${this.reportReason()}`,
          prioridad: 'MEDIA',
        })
        .subscribe({
          next: () => {},
          error: () => {},
        });
    }
    this.reportModalOpen.set(false);
    this.shareToast.set(
      'Reporte enviado. Nuestro equipo revisará el caso en la sección Calidad → Reportes.',
    );
    setTimeout(() => this.shareToast.set(''), 4000);
  }

  protected bloquearUsuario(): void {
    if (!this.signedIn()) {
      this.openAuthPrompt('bloquear a este usuario');
      return;
    }
    this.moreMenuOpen.set(false);
    const p = this.profile();
    if (!p) return;
    if (
      !window.confirm(
        `¿Seguro que deseas bloquear a ${p.name}? Ya no podrás interactuar con este perfil.`,
      )
    )
      return;

    try {
      const blocked = JSON.parse(localStorage.getItem('canchero_blocked_users') || '[]');
      if (!blocked.includes(p.id)) {
        blocked.push(p.id);
        localStorage.setItem('canchero_blocked_users', JSON.stringify(blocked));
      }
      this.isBlocked.set(true);
      this.shareToast.set('Has bloqueado a este usuario.');
      setTimeout(() => this.shareToast.set(''), 3000);
    } catch {
      this.actionError.set('No se pudo procesar el bloqueo.');
    }
  }

  protected desbloquearUsuario(): void {
    const p = this.profile();
    if (!p) return;
    try {
      const blocked = JSON.parse(localStorage.getItem('canchero_blocked_users') || '[]');
      const updated = blocked.filter((id: string) => id !== p.id);
      localStorage.setItem('canchero_blocked_users', JSON.stringify(updated));
      this.isBlocked.set(false);
      this.shareToast.set('Usuario desbloqueado.');
      setTimeout(() => this.shareToast.set(''), 3000);
    } catch {}
  }

  /* ================= COMPARTIR PERFIL ================= */
  protected async compartirPerfil(): Promise<void> {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const name = this.profile()?.name || 'Perfil';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Perfil de ${name} en Canchero`,
          text: `Mira el perfil de ${name} en Canchero`,
          url,
        });
        return;
      } catch {}
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        this.shareToast.set('¡Enlace del perfil copiado al portapapeles!');
        setTimeout(() => this.shareToast.set(''), 3000);
      } catch {
        this.actionError.set('No se pudo copiar el enlace.');
      }
    }
  }

  /* ================= FOTOS Y SELECTOR DE EMOJIS ================= */
  protected async selectPhotos(input: HTMLInputElement, cover = false) {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (!files.length || this.reading()) return;
    if ((!cover && this.draftPhotos().length + files.length > 4) || (cover && files.length > 1)) {
      this.actionError.set('Puedes agregar hasta cuatro fotos por publicación.');
      return;
    }
    this.reading.set(true);
    this.actionError.set('');
    const request = this.request;
    try {
      const images: string[] = [];
      for (const file of files) images.push(await this.optimize(file));
      if (request !== this.request) return;
      if (cover) this.cover = images[0];
      else this.draftPhotos.update((photos) => [...photos, ...images]);
    } catch {
      this.actionError.set(
        'Elige fotos JPG, PNG o WebP de hasta 5 MB. No pudimos preparar alguna imagen.',
      );
    } finally {
      this.reading.set(false);
    }
  }

  private async optimize(file: File): Promise<string> {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5000000)
      throw new Error();
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const scale = Math.min(1, 1000 / Math.max(img.naturalWidth, img.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error();
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.8, 0.65, 0.5, 0.35]) {
        const result = canvas.toDataURL('image/jpeg', quality);
        if (result.length <= 145000) return result;
      }
      throw new Error();
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  protected async publish() {
    if (
      !this.isSelf() ||
      this.busy() ||
      this.reading() ||
      (!this.text.trim() && !this.draftPhotos().length)
    )
      return;
    this.busy.set(true);
    this.actionError.set('');
    const id = this.id();
    try {
      const post = await firstValueFrom(this.api.publish(this.text, this.draftPhotos()));
      if (id !== this.id()) return;
      this.posts.update((posts) => [post, ...posts]);
      this.profile.update((p) => (p ? { ...p, postCount: p.postCount + 1 } : p));
      this.text = '';
      this.draftPhotos.set([]);
    } catch {
      this.actionError.set(
        'No se publicó. Tu texto y fotos se conservaron para que puedas reintentar.',
      );
    } finally {
      this.busy.set(false);
    }
  }

  protected removePhoto(index: number) {
    this.draftPhotos.update((photos) => photos.filter((_, i) => i !== index));
  }

  protected async toggleEmojiPicker(): Promise<void> {
    const nextState = !this.emojiPickerOpen();
    this.emojiPickerOpen.set(nextState);
    if (nextState && !this.emojiLoaded) {
      this.emojiLoaded = true;
      try {
        const res = await fetch('https://emojiapi.dev/api/v1/emojis');
        if (res.ok) {
          const data = await res.json();
          const apiEmojis: string[] = [];
          if (Array.isArray(data)) {
            for (const item of data) {
              if (typeof item === 'string') apiEmojis.push(item);
              else if (item && typeof item.character === 'string') apiEmojis.push(item.character);
              else if (item && typeof item.emoji === 'string') apiEmojis.push(item.emoji);
            }
          } else if (data && Array.isArray(data.emojis)) {
            for (const item of data.emojis) {
              if (typeof item === 'string') apiEmojis.push(item);
              else if (item && typeof item.character === 'string') apiEmojis.push(item.character);
            }
          }
          if (apiEmojis.length > 0) {
            const current = this.emojis();
            const set = new Set([...current, ...apiEmojis.slice(0, 120)]);
            this.emojis.set(Array.from(set));
          }
        }
      } catch {}
    }
  }

  protected insertEmoji(emoji: string): void {
    this.text = (this.text ? this.text + ' ' : '') + emoji;
    this.emojiPickerOpen.set(false);
  }

  protected async deletePost(post: CommunityPost) {
    if (
      !this.isSelf() ||
      this.busy() ||
      !window.confirm(
        '¿Eliminar esta publicación de tu perfil? Dejará de ser visible para los demás.',
      )
    )
      return;
    const id = this.id();
    this.busy.set(true);
    this.actionError.set('');
    try {
      await firstValueFrom(this.api.removePost(post.id));
      if (id !== this.id()) return;
      this.posts.update((posts) => posts.filter((item) => item.id !== post.id));
      this.profile.update((p) => (p ? { ...p, postCount: Math.max(0, p.postCount - 1) } : p));
    } catch {
      this.actionError.set('No pudimos eliminar la publicación.');
    } finally {
      this.busy.set(false);
    }
  }

  private async loadRelationship(id: string, user: string) {
    try {
      const result = await firstValueFrom(this.api.relationship(id));
      if (id === this.profile()?.id && user === this.auth.user()?.id)
        this.following.set(result.following);
    } catch {
      if (id === this.profile()?.id) this.following.set(null);
    }
  }

  protected async follow() {
    const p = this.profile();
    if (!p || this.isSelf() || this.relationshipBusy() || this.following() === null) return;
    const next = !this.following();
    this.relationshipBusy.set(true);
    this.actionError.set('');
    try {
      await firstValueFrom(this.api.follow(p.id, next));
      this.following.set(next);
      this.profile.update((current) =>
        current && current.id === p.id
          ? { ...current, followers: Math.max(0, current.followers + (next ? 1 : -1)) }
          : current,
      );
    } catch {
      this.actionError.set('No se pudo actualizar el seguimiento.');
    } finally {
      this.relationshipBusy.set(false);
    }
  }
}
