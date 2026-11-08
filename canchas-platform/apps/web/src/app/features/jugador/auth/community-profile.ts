import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import {
  CommunityProfileService,
  CommunityProfile as Profile,
  CommunityPost,
} from '@core/services/community-profile.service';
import { ProfileHeader } from '@shared/components/profile-header/profile-header';
import { NotificationPreferences } from '@shared/components/notification-preferences/notification-preferences';

@Component({
  selector: 'app-community-profile',
  imports: [FormsModule, RouterLink, DatePipe, ProfileHeader, NotificationPreferences],
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
  protected readonly busy = signal(false);
  protected readonly reading = signal(false);
  protected readonly tab = signal('publicaciones');
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
  protected readonly isSelf = computed(
    () => !!this.auth.user() && this.auth.user()?.id === this.id(),
  );
  protected readonly signedIn = this.auth.isLoggedIn;
  protected readonly initials = computed(
    () =>
      this.profile()
        ?.name.split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join('')
        .toUpperCase() || 'U',
  );
  protected readonly business = computed(
    () => this.profile()?.role === 'Dueño' || !!this.profile()?.venues.length,
  );
  protected readonly courts = computed(
    () =>
      this.profile()?.venues.flatMap((venue) =>
        (this.db.getVenueDetalle(venue.id)?.canchas ?? []).map((court) => ({
          ...court,
          venueId: venue.id,
          venueName: venue.name,
        })),
      ) ?? [],
  );
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
    return (this.profile()?.venues ?? []).map((venue) => ({
      venue,
      items: [
        ...new Set(
          this.courts()
            .filter((c) => c.venueId === venue.id)
            .flatMap((c) => c.equipamiento ?? []),
        ),
      ],
    }));
  });
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
    this.hasMore.set(false);
    this.tab.set('publicaciones');
    try {
      const profile = await firstValueFrom(this.api.profile(id));
      if (request !== this.request) return;
      this.profile.set(profile);
      await this.loadPosts(id, 0, request);
    } catch {
      if (request === this.request)
        this.error.set('No pudimos cargar este perfil. Inténtalo nuevamente.');
    } finally {
      if (request === this.request) this.loading.set(false);
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
  protected editProfile() {
    if (this.embedded()) this.editAccount.emit();
    else void this.router.navigate(['/perfil'], { queryParams: { editar: '1' } });
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
