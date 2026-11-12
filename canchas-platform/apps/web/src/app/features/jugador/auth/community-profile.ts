import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { MatDialog } from '@angular/material/dialog';
import { ProfileHandleDialog } from './profile-handle-dialog';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { CourtReportService } from '@core/services/court-report.service';
import { ChatService } from '@core/services/chat.service';
import {
  CommunityProfileService,
  CommunityProfile as Profile,
  CommunityPost,
  CommunityReview,
  MutualFollower,
} from '@core/services/community-profile.service';
import { ProfileHeader } from '@shared/components/profile-header/profile-header';
import { NotificationPreferences } from '@shared/components/notification-preferences/notification-preferences';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatDividerModule } from '@angular/material/divider';
import { EmojiButton } from '@shared/components/emoji-button/emoji-button';

@Component({
  selector: 'app-community-profile',
  imports: [
    FormsModule,
    RouterLink,
    ProfileHeader,
    NotificationPreferences,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
    MatMenuModule,
    MatTooltipModule,
    MatChipsModule,
    MatSnackBarModule,
    MatDividerModule,
    EmojiButton,
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
  private readonly chat = inject(ChatService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  protected draftAvatar: string | null = null;
  protected photoChanged = false;

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
  protected readonly handleValidationError = signal<string>('');
  protected readonly isFavoriteVenuePublic = signal<boolean>(
    typeof localStorage !== 'undefined'
      ? localStorage.getItem('canchero_show_venue_public') !== 'false'
      : true,
  );
  protected readonly myBookings = signal<any[]>([]);

  protected readonly busy = signal(false);
  protected readonly reading = signal(false);
  protected readonly tab = signal('publicaciones');
  protected readonly previewRole = signal<'self' | 'visitor'>('self');
  protected readonly settingsOpen = signal(false);
  protected readonly draftPhotos = signal<string[]>([]);
  protected readonly following = signal<boolean | null>(null);
  protected readonly mutualFollowers = signal<MutualFollower[]>([]);
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

  protected readonly isOwnerPerspective = computed(() => this.business() && this.isSelf());
  protected readonly isVisitorPerspective = computed(() => this.previewRole() === 'visitor');
  protected togglePerspective(): void {
    if (!this.ownsProfile()) return;
    this.previewRole.set(this.previewRole() === 'self' ? 'visitor' : 'self');
    this.settingsOpen.set(false);
    this.editingInfo.set(false);
    this.shareToast.set(this.previewRole() === 'self' ? 'Vista propia' : 'Vista de visitante');
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

  protected readonly ownsProfile = computed(() => {
    const user = this.auth.user();
    const id = this.id();
    return !!user && (!id || id === 'self' || id === 'me' || String(user.id) === String(id));
  });
  protected readonly isSelf = computed(() => this.ownsProfile() && this.previewRole() === 'self');
  protected readonly signedIn = this.auth.isLoggedIn;

  protected readonly avatarUrl = computed<string | null>(() => this.profile()?.photo || null);

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

  protected readonly handle = computed(() => this.profile()?.handle || '');

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

  protected readonly memberSince = computed(() => {
    const u = this.auth.user() as Record<string, unknown> | null;
    const dateStr = this.isSelf()
      ? ((u?.['createdAt'] || u?.['fecmod'] || u?.['created_at']) as string | undefined)
      : null;
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          const m = d.toLocaleString('es-PE', { month: 'long' });
          return `${m.charAt(0).toUpperCase() + m.slice(1)} ${d.getFullYear()}`;
        }
      } catch {}
    }
    return 'Sin fecha registrada';
  });
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
      this.mutualFollowers.set([]);
      if (p && user && p.id !== user.id) void this.loadRelationship(p.id, user.id);
    });
    const initialTab = this.route.snapshot.queryParamMap.get('tab');
    if (initialTab) {
      this.tab.set(initialTab);
    }
  }

  protected setTab(newTab: string): void {
    this.tab.set(newTab);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab: newTab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
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
    this.previewRole.set('self');
    this.isBlocked.set(false);
    try {
      if (this.signedIn() && id !== this.auth.user()?.id) {
        try {
          const relation = await firstValueFrom(this.chat.relationship(id));
          if (request !== this.request) return;
          this.isBlocked.set(relation.blockedByMe);
        } catch {
          if (request === this.request)
            this.actionError.set('No se pudo comprobar el bloqueo de este perfil.');
        }
      }
      const profile = await firstValueFrom(this.api.profile(id));
      if (request !== this.request) return;
      this.profile.set(profile);
      if (profile.restricted) return;
      if (this.ownsProfile() && typeof this.db.fetchMyBookings === 'function') {
        void this.db
          .fetchMyBookings()
          .then((b) => {
            if (request === this.request && Array.isArray(b)) this.myBookings.set(b);
          })
          .catch(() => {});
      }
      await this.loadPosts(id, 0, request);
    } catch {
      if (request === this.request)
        this.error.set('No pudimos cargar este perfil. Reintenta en unos momentos.');
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

  protected startEditingInfo(): void {
    if (!this.isSelf() || this.busy() || this.reading()) return;
    if (this.editingInfo()) {
      this.cancelEditingInfo();
      return;
    }
    this.settingsOpen.set(false);
    const p = this.profile();
    const player = typeof this.auth.playerProfile === 'function' ? this.auth.playerProfile() : null;
    this.editNombre = player?.nombre || p?.name?.split(' ')[0] || '';
    this.editApellido = player?.apellido || p?.name?.split(' ').slice(1).join(' ') || '';
    this.editHandle = p?.handle || '';
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
    if (!this.isSelf() || this.busy()) return;
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
            whatsapp: this.profile()?.whatsapp || '',
            cover: this.profile()?.cover || null,
          }),
        );
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
              handle: current.handle,
              biography: this.editBiography,
              whatsapp: current.whatsapp,
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
    if (!this.isSelf() || this.busy() || this.reading()) return;
    if (this.settingsOpen()) {
      this.settingsOpen.set(false);
      return;
    }
    const p = this.profile();
    if (!p) return;
    this.editingInfo.set(false);
    this.biography = p.biography;
    this.whatsapp = p.whatsapp;
    this.cover = p.cover;
    this.draftAvatar = this.avatarUrl();
    this.photoChanged = false;
    this.settingsOpen.set(true);
    this.actionError.set('');
  }
  protected requestAvatar(input: HTMLInputElement) {
    if (!this.isSelf()) return;
    if (!this.settingsOpen()) this.openSettings();
    input.click();
  }
  protected async selectAvatar(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = '';
    if (!this.isSelf() || !file || this.busy() || this.reading()) return;
    this.reading.set(true);
    this.actionError.set('');
    try {
      this.draftAvatar = await this.optimize(file);
      this.photoChanged = true;
    } catch {
      this.actionError.set('Elige una imagen JPG, PNG o WebP de hasta 5 MB.');
    } finally {
      this.reading.set(false);
    }
  }
  protected changeHandle() {
    if (!this.isSelf()) return;
    this.dialog
      .open(ProfileHandleDialog, {
        width: '460px',
        maxWidth: '95vw',
        data: { handle: this.profile()?.handle || '' },
      })
      .afterClosed()
      .subscribe((state: any) => {
        if (state && this.isSelf()) {
          this.editHandle = state.handle || '';
          this.profile.update((p) => (p ? { ...p, handle: state.handle } : p));
        }
      });
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
          photo: this.draftAvatar,
          updatePhoto: this.photoChanged,
        }),
      );
      if (id !== this.id()) return;
      this.profile.update((p) =>
        p
          ? {
              ...p,
              biography: settings.biography,
              whatsapp: settings.whatsapp,
              cover: settings.cover,
              photo: this.photoChanged ? this.draftAvatar : p.photo,
            }
          : p,
      );
      if (this.photoChanged) {
        const user = this.auth.user();
        if (user && typeof localStorage !== 'undefined') {
          if (this.draftAvatar)
            localStorage.setItem(`canchero_user_avatar_${user.id}`, this.draftAvatar);
          else localStorage.removeItem(`canchero_user_avatar_${user.id}`);
        }
        if (typeof this.auth.loadPlayerProfile === 'function')
          await firstValueFrom(this.auth.loadPlayerProfile());
      }
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
    if (this.ownsProfile()) return;
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
    if (!this.ownsProfile())
      void this.router.navigate(['/mensajes'], { queryParams: { usuario: p.id } });
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
    this.snackBar.open('Reporte enviado para revisión.', 'Cerrar', { duration: 3500 });
  }

  protected confirmarBloqueoUsuario(): void {
    if (!this.signedIn()) {
      this.openAuthPrompt('bloquear a este usuario');
      return;
    }
    const p = this.profile();
    if (!p) return;
    if (
      window.confirm(
        `¿Seguro que deseas bloquear a ${p.name}? Ya no podrás interactuar con este perfil ni ver sus publicaciones.`,
      )
    ) {
      this.bloquearUsuario();
    }
  }

  protected bloquearUsuario(): void {
    const p = this.profile();
    if (!p) return;
    this.chat.block(p.id, true).subscribe({
      next: () => {
        this.isBlocked.set(true);
        this.snackBar.open(`Has bloqueado a ${p.name}.`, 'Cerrar', { duration: 3500 });
      },
      error: () => this.actionError.set('No se pudo guardar el bloqueo.'),
    });
  }

  protected desbloquearUsuario(): void {
    const p = this.profile();
    if (!p) return;
    this.chat.block(p.id, false).subscribe({
      next: () => {
        this.isBlocked.set(false);
        this.snackBar.open('Usuario desbloqueado.', 'Cerrar', { duration: 3000 });
      },
      error: () => this.actionError.set('No se pudo guardar el desbloqueo.'),
    });
  }

  /* ================= COMPARTIR PERFIL ================= */
  protected async compartirPerfil(): Promise<void> {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        this.snackBar.open('Enlace copiado', 'Cerrar', { duration: 3000 });
        return;
      } catch {}
    }
    this.snackBar.open('Enlace copiado', 'Cerrar', { duration: 3000 });
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
      if (id === this.profile()?.id && user === this.auth.user()?.id) {
        this.following.set(result.following);
        this.mutualFollowers.set(result.mutualFollowers || []);
      }
    } catch {
      if (id === this.profile()?.id) {
        this.following.set(null);
        this.mutualFollowers.set([]);
      }
    }
  }

  protected formatRelativeDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      if (diffMs < 0) return 'hace un momento';
      const diffSec = Math.floor(diffMs / 1000);
      if (diffSec < 60) return 'hace un momento';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `hace ${diffMin} min`;
      const diffHours = Math.floor(diffMin / 60);
      if (diffHours < 24) return `hace ${diffHours} h`;
      const diffDays = Math.floor(diffHours / 24);
      if (diffDays === 1) return 'ayer';
      if (diffDays < 7) return `hace ${diffDays} d`;
      return d.toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  }

  protected formatFullDate(dateStr: string | null | undefined): string {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleString('es-PE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  protected getInitials(name: string | null | undefined): string {
    if (!name) return 'JU';
    return (
      name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((p) => p[0])
        .join('')
        .toUpperCase() || 'JU'
    );
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
