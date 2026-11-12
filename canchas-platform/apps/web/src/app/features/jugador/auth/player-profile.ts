import { HttpClient } from '@angular/common/http';
import { environment } from '@env/environment';
import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService, PlayerProfile } from '@core/auth/auth.service';
import { firstValueFrom } from 'rxjs';
import { NotificationPreferences } from '@shared/components/notification-preferences/notification-preferences';
import { ProfileHeader } from '@shared/components/profile-header/profile-header';
import { ManagedVenueProfiles } from '@shared/components/profile-header/managed-venue-profiles';
import { CommunityProfilePage } from './community-profile';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatProgressBarModule } from '@angular/material/progress-bar';

interface District {
  id_departamento: number;
  departamento: string;
  id_provincia: number;
  provincia: string;
  id_distrito: number;
  distrito: string;
}

@Component({
  imports: [
    FormsModule,
    NotificationPreferences,
    ProfileHeader,
    ManagedVenueProfiles,
    CommunityProfilePage,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatProgressBarModule,
  ],
  templateUrl: './player-profile.html',
  styleUrl: './player-profile.css',
})
export class PlayerProfilePage {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected firstAccess = ['google', 'registro', 'inicio'].includes(
    this.route.snapshot.queryParamMap.get('acceso') || '',
  );
  protected readonly handleLocked = signal(false);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly readingPhoto = signal(false);
  protected readonly error = signal('');
  protected readonly photoError = signal('');
  protected readonly editing = signal(this.route.snapshot.queryParamMap.get('editar') === '1');
  protected readonly saved = signal(false);
  protected readonly activeTab = signal<'information' | 'photos'>('information');
  protected readonly photoFailed = signal(false);
  protected readonly account = this.auth.user;
  protected get managesVenues(): boolean {
    return this.auth.isOwner();
  }
  protected get fullName(): string {
    return (
      [this.profile?.nombre, this.profile?.apellido].filter((value) => value?.trim()).join(' ') ||
      'Tu perfil'
    );
  }
  protected get initials(): string {
    return (
      [this.profile?.nombre, this.profile?.apellido]
        .filter((value) => value?.trim())
        .map((value) => value!.trim()[0])
        .join('')
        .toUpperCase() || 'U'
    );
  }
  protected get roleLabel(): string {
    const role = this.account()?.rol;
    if (role === 'superadmin') return 'Superadministrador';
    if (role === 'admin') return 'Administrador';
    if (role === 'operador') return 'Operador';
    if (role === 'caja') return 'Cajero';
    return this.auth.isOwner() ? 'Dueño de sede' : 'Jugador';
  }
  protected get locationLabel(): string {
    const district = this.districts.find((item) => item.id_distrito === this.profile?.idDistrito);
    return district
      ? [...new Set([district.distrito, district.provincia, district.departamento])].join(', ')
      : 'Ubicación sin completar';
  }
  protected cancelEdit(): void {
    if (this.persistedProfile) this.profile = { ...this.persistedProfile };
    const district = this.districts.find((item) => item.id_distrito === this.profile?.idDistrito);
    this.departmentId = district?.id_departamento ?? null;
    this.provinceId = district?.id_provincia ?? null;
    this.photoFailed.set(false);
    this.editing.set(false);
    this.photoError.set('');
    this.error.set('');
  }
  protected districts: District[] = [];
  protected departments = new Map<number, string>();
  protected departmentId: number | null = null;
  protected provinceId: number | null = null;

  protected get provinces(): Map<number, string> {
    return new Map(
      this.districts
        .filter((d) => d.id_departamento === this.departmentId)
        .map((d) => [d.id_provincia, d.provincia]),
    );
  }

  protected get availableDistricts(): District[] {
    return this.districts.filter((d) => d.id_provincia === this.provinceId);
  }

  protected selectDepartment(id: number | null): void {
    this.departmentId = id;
    this.selectProvince(null);
  }

  protected selectProvince(id: number | null): void {
    this.provinceId = id;
    if (this.profile) this.profile.idDistrito = null;
  }

  protected profile: PlayerProfile | null = null;
  private handleEdited = false;
  private handleSelectionPending = true;
  private selectedHandleOnFocus = false;

  @ViewChild('handleInput')
  protected set handleInput(ref: ElementRef<HTMLInputElement> | undefined) {
    if (!ref || !this.firstAccess || this.handleLocked() || !this.profile?.handle) return;
    queueMicrotask(() => {
      if (!ref.nativeElement.isConnected || this.handleEdited || !this.handleSelectionPending)
        return;
      ref.nativeElement.focus();
      ref.nativeElement.select();
      this.handleSelectionPending = false;
    });
  }

  protected updateName(value: string): void {
    if (!this.profile) return;
    this.profile.nombre = value;
    this.suggestHandle();
  }

  private suggestHandle(): void {
    if (!this.profile || !this.firstAccess || this.handleLocked() || this.handleEdited) return;
    this.profile.handle = (this.profile.nombre ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .slice(0, 30);
    this.handleSelectionPending = true;
  }

  protected updateHandle(value: string): void {
    if (!this.profile || this.handleLocked()) return;
    this.profile.handle = value;
    this.handleEdited = true;
    this.handleSelectionPending = false;
    this.selectedHandleOnFocus = false;
  }

  protected selectHandle(event: FocusEvent): void {
    if (!this.firstAccess || this.handleLocked() || !this.handleSelectionPending) return;
    (event.target as HTMLInputElement).select();
    this.handleSelectionPending = false;
    this.selectedHandleOnFocus = true;
  }

  protected preserveHandleSelection(event: MouseEvent): void {
    if (this.selectedHandleOnFocus) event.preventDefault();
    this.selectedHandleOnFocus = false;
  }

  private persistedProfile: PlayerProfile | null = null;

  async ngOnInit(): Promise<void> {
    await this.auth.ready;
    if (!this.auth.isLoggedIn()) {
      void this.router.navigateByUrl('/login');
      return;
    }
    await this.load();
  }

  protected async load(): Promise<void> {
    const identity = this.auth.user()?.id;
    this.loading.set(true);
    this.error.set('');
    try {
      const profile = await firstValueFrom(this.auth.loadPlayerProfile(true));
      if (this.auth.user()?.id !== identity) {
        this.profile = null;
        void this.router.navigateByUrl('/login');
        return;
      }
      if (this.firstAccess && profile.completo) {
        this.continue();
        return;
      }
      if (!profile.completo) this.firstAccess = true;
      this.handleLocked.set(!!profile.handle);
      this.districts = await firstValueFrom(
        this.http.get<District[]>(environment.apiUrl + '/catalog/districts'),
      ).catch(() => []);
      this.departments = new Map(this.districts.map((d) => [d.id_departamento, d.departamento]));
      const savedDistrict = this.districts.find((d) => d.id_distrito === profile.idDistrito);
      this.departmentId = savedDistrict?.id_departamento ?? null;
      this.provinceId = savedDistrict?.id_provincia ?? null;
      this.profile = {
        ...profile,
        idDistrito: savedDistrict?.id_distrito ?? null,
        nombre: !profile.completo && profile.nombre === 'Usuario' ? '' : (profile.nombre ?? ''),
      };
      this.handleEdited = false;
      this.suggestHandle();
      this.persistedProfile = { ...this.profile };
    } catch {
      this.error.set('No pudimos cargar tu perfil. Inténtalo nuevamente.');
    } finally {
      this.loading.set(false);
    }
  }

  protected async selectPhoto(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = '';
    if (!file || !this.profile) return;
    this.photoError.set('');
    const heic =
      /\.(heic|heif)$/i.test(file.name) || /^image\/hei[cf](?:-sequence)?$/i.test(file.type);
    const mime = /\.svg$/i.test(file.name)
      ? 'image/svg+xml'
      : /\.webp$/i.test(file.name)
        ? 'image/webp'
        : /\.png$/i.test(file.name)
          ? 'image/png'
          : /\.jpe?g$/i.test(file.name)
            ? 'image/jpeg'
            : file.type;
    if (
      (!heic && !['image/jpeg', 'image/png', 'image/svg+xml', 'image/webp'].includes(mime)) ||
      file.size > 5_000_000
    ) {
      this.photoError.set('Elige una imagen JPG, PNG, SVG, WebP o HEIC/HEIF de hasta 5 MB.');
      return;
    }
    this.readingPhoto.set(true);
    let url: string | undefined;
    try {
      let source: Blob = file.slice(0, file.size, mime);
      if (heic) {
        const { heicTo } = await import('heic-to/csp');
        source = await heicTo({ blob: file, type: 'image/jpeg' });
      }
      url = URL.createObjectURL(source);
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d');
      if (!context) throw new Error();
      const size = Math.min(image.naturalWidth, image.naturalHeight);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, 256, 256);
      context.drawImage(
        image,
        (image.naturalWidth - size) / 2,
        (image.naturalHeight - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      this.profile.foto = canvas.toDataURL('image/jpeg', 0.82);
      this.photoFailed.set(false);
    } catch {
      this.photoError.set('No pudimos abrir la imagen. Elige otra foto.');
    } finally {
      if (url) URL.revokeObjectURL(url);
      this.readingPhoto.set(false);
    }
  }

  /* ================= COMPARTIR PERFIL ================= */
  protected async compartirPerfil(): Promise<void> {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const title = this.fullName
      ? `Perfil de ${this.fullName} en Canchero`
      : 'Perfil de jugador en Canchero';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({ title, text: `Mira mi perfil en Canchero`, url });
        return;
      } catch {}
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(url);
        this.saved.set(true);
        setTimeout(() => this.saved.set(false), 3000);
      } catch {}
    }
  }

  protected async save(): Promise<void> {
    if (!this.profile || this.saving() || this.readingPhoto()) return;
    if (
      !this.profile.nombre?.trim() ||
      !this.profile.apellido?.trim() ||
      !/^[a-z0-9_.\-]{3,30}$/.test(this.profile.handle ?? '')
    ) {
      this.error.set(
        'Completa tus nombres, apellidos y un identificador @ válido de 3 a 30 caracteres.',
      );
      return;
    }
    this.error.set('');
    this.saving.set(true);
    try {
      this.profile = await firstValueFrom(this.auth.savePlayerProfile(this.profile));
      this.persistedProfile = { ...this.profile };
      if (this.firstAccess) this.continue();
      else {
        this.editing.set(false);
        this.saved.set(true);
      }
    } catch (failure: unknown) {
      this.error.set(
        (failure as { error?: { message?: string } })?.error?.message ||
          'No pudimos guardar tu perfil. Revisa los datos e inténtalo nuevamente.',
      );
    } finally {
      this.saving.set(false);
    }
  }

  private continue(): void {
    const target = this.route.snapshot.queryParamMap.get('regreso');
    const safeTarget =
      target &&
      /^\/(?![/\\])/.test(target) &&
      !target.includes('\\') &&
      !/^\/perfil(?:[/?#]|$)/.test(target);
    void this.router.navigateByUrl(
      safeTarget ? target : this.auth.isOwner() ? '/admin' : '/itinerario',
      {
        replaceUrl: true,
      },
    );
  }
}
