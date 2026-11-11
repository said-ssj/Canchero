import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { AdminContext } from '../admin-context.service';
import { AdminVenueRequired } from '../components/venue-required/venue-required';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import { generarMatrizQR, exportarQRSvg } from '@core/utils/qr-generator';
import type { Venue } from '@shared/models/venue.model';
import {
  PALETA_COLORES_CANCHERO,
  type ColorPaletteItem,
  type MetodoQr,
} from './admin-personalizacion.models';

@Component({
  standalone: true,
  selector: 'app-admin-personalizacion',
  imports: [
    AdminVenueRequired,
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './admin-personalizacion.html',
  styleUrl: './admin-personalizacion.css',
})
export class AdminPersonalizacion {
  private readonly context = inject(AdminContext);
  protected readonly db = inject(DatabaseService);
  protected readonly auth = inject(AuthService);
  private readonly sanitizer = inject(DomSanitizer);

  // Inputs del componente contenedor
  readonly duenoIdInput = input<string | number | null | undefined>(undefined, {
    alias: 'duenoId',
  });
  readonly duenoId = computed(() =>
    this.duenoIdInput() !== undefined ? this.duenoIdInput()! : this.context.ownerId(),
  );
  readonly venueIdInput = input<number | null | undefined>(undefined, { alias: 'venueId' });
  readonly venueId = computed(() =>
    this.venueIdInput() !== undefined ? this.venueIdInput()! : (this.context.venue()?.id ?? null),
  );
  readonly venueNameInput = input<string | undefined>(undefined, { alias: 'venueName' });
  readonly venueName = computed(() =>
    this.venueNameInput() !== undefined
      ? this.venueNameInput()!
      : (this.context.venue()?.nombre ?? 'Sin sede seleccionada'),
  );
  readonly venueAddressInput = input<string | undefined>(undefined, { alias: 'venueAddress' });
  readonly venueAddress = computed(() =>
    this.venueAddressInput() !== undefined
      ? this.venueAddressInput()!
      : (this.context.venue()?.direccion ?? ''),
  );
  readonly venuePhoneInput = input<string | undefined>(undefined, { alias: 'venuePhone' });
  readonly venuePhone = computed(() =>
    this.venuePhoneInput() !== undefined
      ? this.venuePhoneInput()!
      : (this.context.venue()?.telefono ?? ''),
  );
  readonly loadingInput = input<boolean | undefined>(undefined, { alias: 'loading' });
  readonly loading = computed(() =>
    this.loadingInput() !== undefined ? this.loadingInput()! : this.context.loading(),
  );
  readonly errorInput = input<string | undefined>(undefined, { alias: 'error' });
  readonly error = computed(() =>
    this.errorInput() !== undefined ? this.errorInput()! : this.context.error(),
  );

  // Outputs
  readonly notice = output<string>();
  readonly colorChange = output<string>();
  readonly venueUpdated = output<Venue>();

  // Paleta de colores oficial
  protected readonly paletaColores = PALETA_COLORES_CANCHERO;

  // Estado del color de acento
  protected readonly colorAcento = signal<string>('#3CB043');
  protected readonly colorAcentoNombre = signal<string>('Verde Césped Oficial');

  // Estado de textos de marca
  protected readonly previewTagline = signal<string>('');
  protected readonly liveVenueStory = signal<string>('');
  protected readonly historiaContador = computed(() => this.liveVenueStory().length);

  // Estado de QR y pagos
  protected readonly qrMetodo = signal<MetodoQr>('yape');
  protected readonly totemMerchant = signal<string>('');
  protected readonly totemPhone = signal<string>('');
  protected readonly customQrUploaded = signal<boolean>(false);
  protected readonly customQrRasterUrl = signal<string>('');

  // Identificación del dueño y sede
  protected readonly currentDuenoId = computed(() => {
    const explicit = this.duenoId();
    if (explicit !== null && explicit !== undefined) return explicit;
    return this.auth.currentUser()?.id ?? '';
  });

  protected readonly sede = computed<Venue | null>(() => {
    const vId = this.venueId();
    const sedes = this.db.getSedesPorDueno(this.currentDuenoId());
    return sedes.find((s) => Number(s.id) === Number(vId)) ?? null;
  });

  // Imagen de portada para preview
  protected readonly coverImage = computed<string>(() => {
    const s = this.db
      .getSedesPorDueno(this.currentDuenoId())
      .find((venue) => Number(venue.id) === Number(this.venueId()));
    return s?.fotos?.[0] || s?.imagen_url || '/images/venue-placeholder.svg';
  });

  protected onCoverError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.getAttribute('src') !== '/images/venue-placeholder.svg') {
      image.src = '/images/venue-placeholder.svg';
    }
  }

  // URL canónica de la sede para el código QR
  protected readonly qrUrl = computed<string>(() => {
    const s = this.sede();
    return new URL(s ? `/sedes/${s.id}` : '/sedes', globalThis.location.origin).href;
  });

  // Matriz QR matemática auténtica
  protected readonly qrMatrix = computed<boolean[][]>(() => {
    return generarMatrizQR(this.qrUrl());
  });

  // SVG nativo con acento de marca
  protected readonly qrSvgContent = computed<string>(() => {
    return exportarQRSvg(this.qrMatrix(), 240, this.colorAcento(), true);
  });

  protected readonly qrSvgSafe = computed<SafeHtml>(() => {
    return this.sanitizer.bypassSecurityTrustHtml(
      exportarQRSvg(this.qrMatrix(), 120, this.colorAcento(), true),
    );
  });

  protected readonly saving = signal(false);
  protected readonly feedback = signal('');
  private preferencesVenue = '';
  constructor() {
    // Sincronizar datos iniciales al cargar o cambiar de sede
    effect(() => {
      const s = this.sede();
      if (this.preferencesVenue === (s?.id ?? '')) return;
      this.preferencesVenue = s?.id ?? '';
      if (s) {
        void this.db
          .getVenuePreferences?.(Number(s.id))
          .then((value) => {
            if (this.sede()?.id !== s.id) return;
            this.totemMerchant.set(value.walletHolder || '');
            this.totemPhone.set(value.walletPhone || '');
          })
          .catch(() => this.feedback.set('No se pudieron cargar los datos de billetera.'));
        this.previewTagline.set((s.descripcion ?? '').slice(0, 58));
        this.liveVenueStory.set(s.descripcion ?? '');
        this.totemMerchant.set(s.nombre);
        this.totemPhone.set(s.telefono ?? '');
      } else {
        this.previewTagline.set('');
        this.liveVenueStory.set('');
        this.totemMerchant.set('');
        this.totemPhone.set('');
      }
      this.colorAcento.set('#3CB043');
      this.colorAcentoNombre.set('Verde Césped Oficial');
      this.customQrUploaded.set(false);
      this.customQrRasterUrl.set('');
    });
  }

  // ===== ACCIONES DE COLOR =====
  protected seleccionarColorSwatch(hex: string, nombre: string): void {
    this.colorAcento.set(hex);
    this.colorAcentoNombre.set(nombre);
    this.colorChange.emit(hex);
    this.notice.emit(`Color de acento seleccionado: ${nombre} (${hex})`);
  }

  protected swatchActive(hex: string): boolean {
    return this.colorAcento() === hex;
  }

  // ===== ACCIONES DE TEXTO =====
  protected actualizarPreviewTagline(val: string): void {
    this.previewTagline.set(val);
  }

  protected actualizarHistoria(val: string): void {
    this.liveVenueStory.set(val);
  }

  protected async guardarTextosMarca(): Promise<void> {
    const s = this.sede();
    if (s) {
      try {
        await this.db.saveOrUpdateSede(this.currentDuenoId(), {
          ...s,
          descripcion: this.liveVenueStory(),
        });
      } catch (error) {
        this.notice.emit(
          (error as any)?.error?.message ||
            (error as any)?.message ||
            'No se pudieron guardar los textos. Intenta nuevamente.',
        );
        return;
      }
      this.notice.emit('Textos de marca guardados correctamente');
    }
  }

  // ===== ACCIONES DE QR =====
  protected seleccionarMetodoQr(metodo: MetodoQr): void {
    this.qrMetodo.set(metodo);
    this.notice.emit(
      metodo === 'yape'
        ? 'Billetera Yape Móvil seleccionada'
        : 'Billetera Plin Transfer seleccionada',
    );
  }

  protected reSubirImagenQr(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (evt) => {
          const result = evt.target?.result as string;
          this.customQrRasterUrl.set(result);
          this.customQrUploaded.set(true);
          this.notice.emit('Imagen de billetera digital cargada con éxito');
        };
        reader.readAsDataURL(file);
      }
    };
    input.click();
  }

  protected vectorizarQr(): void {
    this.descargarSvgQr();
  }

  protected descargarSvgQr(): void {
    const s = this.sede();
    const nombreSede = (s?.nombre ?? 'canchero').toLowerCase().replace(/\s+/g, '-');
    const svg = this.qrSvgContent();

    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `qr-vectorial-${nombreSede}.svg`;
    a.click();
    URL.revokeObjectURL(url);

    this.notice.emit('SVG QR Vectorial descargado con éxito');
  }

  protected descargarPdfQr(): void {
    const s = this.sede();
    const nombreSede = s?.nombre ?? 'Sede Deportiva';
    const contenido = [
      '======================================================================',
      '        KIT QR OFICIAL PARA IMPRENTA - CANCHERO.PE                   ',
      '======================================================================',
      `Sede Deportiva:    ${nombreSede}`,
      `Dirección:         ${s?.direccion || this.venueAddress() || 'Sin dirección registrada'}`,
      `Teléfono Oficial:  ${s?.telefono || this.venuePhone() || '987 654 321'}`,
      `Razón Social:      ${this.totemMerchant()}`,
      `Color de Acento:   ${this.colorAcentoNombre()} (${this.colorAcento()})`,
      `Enlace de Reserva: ${this.qrUrl()}`,
      '----------------------------------------------------------------------',
      'ESPECIFICACIONES TÉCNICAS PARA IMPRENTA OFFSET & DIGITAL:',
      '- Formato de impresión recomendado: A4 (210 x 297 mm) y A5 (148 x 210 mm)',
      '- Sangría técnica: 3.0 mm perimetral',
      '- Espacio de color: CMYK / Grayscale 300 DPI',
      '- Material sugerido: Papel couché 300g con laminado mate antirreflejo',
      '----------------------------------------------------------------------',
      'Código QR generado bajo la norma ISO/IEC 18004 con corrección de error.',
      '======================================================================',
    ].join('\n');

    const blob = new Blob([contenido], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kit-qr-imprenta-${nombreSede.toLowerCase().replace(/\s+/g, '-')}.txt`;
    a.click();
    URL.revokeObjectURL(url);

    this.notice.emit('Kit de impresión QR descargado');
  }

  // ===== PUBLICACIÓN GENERAL =====
  protected async publicarCambiosSede(): Promise<void> {
    const s = this.sede();
    if (!s || this.saving()) return;
    this.feedback.set('');
    this.saving.set(true);
    let walletSaved = false;
    try {
      await this.db.saveVenuePreferences(Number(s.id), {
        walletHolder: this.totemMerchant(),
        walletPhone: this.totemPhone(),
      });
      walletSaved = true;
      await this.db.saveOrUpdateSede(this.currentDuenoId(), {
        ...s,
        descripcion: this.liveVenueStory(),
      });
      this.venueUpdated.emit({ ...s, descripcion: this.liveVenueStory() });
      this.feedback.set(
        'Textos y datos de billetera guardados para esta sede. El receptor de Mercado Pago no cambia.',
      );
    } catch (e: any) {
      this.feedback.set(
        walletSaved
          ? 'Los datos de billetera se guardaron, pero no los textos. Reintenta guardar.'
          : e?.error?.message || 'No se pudieron guardar los datos.',
      );
    } finally {
      this.saving.set(false);
    }
  }
}
