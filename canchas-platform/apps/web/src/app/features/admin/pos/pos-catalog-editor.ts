import {
  AfterViewInit,
  Component,
  ElementRef,
  ViewChild,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '@env/environment';
import {
  CategoriaProducto,
  CATEGORY_ICON_OPTIONS,
  encodeCategoryDescription,
} from '@shared/models/pos.model';

@Component({
  selector: 'app-pos-catalog-editor',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './pos-catalog-editor.html',
  styleUrl: './pos-catalog-editor.css',
})
export class PosCatalogEditor implements AfterViewInit {
  readonly sedeId = input.required<number>();
  readonly closed = output<void>();
  readonly saved = output<void>();
  @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
  private readonly http = inject(HttpClient);
  private readonly url = environment.apiUrl + '/pos/catalog';
  readonly categories = signal<CategoriaProducto[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly processingPhoto = signal(false);
  readonly error = signal('');
  readonly categoryMode = signal(false);
  readonly photoError = signal(false);
  photoMode: 'upload' | 'url' = 'upload';
  categoryName = '';
  categoryDescription = '';
  categoryIcon = 'local_drink';
  readonly iconOptions = CATEGORY_ICON_OPTIONS;
  readonly iconPopoverOpen = signal(false);

  toggleIconPopover(): void {
    this.iconPopoverOpen.update((v) => !v);
  }

  selectIcon(icon: string): void {
    this.categoryIcon = icon;
    this.iconPopoverOpen.set(false);
  }
  product = {
    nombre: '',
    codigoBarras: '',
    categoriaId: null as number | null,
    descripcion: '',
    contenido: null as number | null,
    unidadMedida: '',
    precioCompra: null as number | null,
    precioVenta: null as number | null,
    stockInicial: 0,
    stockMinimo: 0,
    fotoUrl: '',
  };
  ngAfterViewInit(): void {
    this.dialog.nativeElement.showModal();
    void this.load();
  }
  private async load(): Promise<void> {
    try {
      this.categories.set(
        await firstValueFrom(
          this.http.get<CategoriaProducto[]>(this.url + '/categories', {
            params: { sedeId: this.sedeId() },
          }),
        ),
      );
    } catch {
      this.error.set(
        'No se pudieron cargar las categorías. Cierra el formulario e inténtalo de nuevo.',
      );
    } finally {
      this.loading.set(false);
    }
  }
  close(): void {
    if (!this.busy() && !this.processingPhoto()) this.closed.emit();
  }
  changePhotoMode(mode: 'upload' | 'url'): void {
    this.photoMode = mode;
    this.product.fotoUrl = '';
    this.photoError.set(false);
  }
  async readPhoto(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this.error.set('');
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      this.error.set('Selecciona una foto JPG, PNG o WebP de hasta 5 MB.');
      input.value = '';
      return;
    }
    this.processingPhoto.set(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight));
      canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error();
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const result = canvas.toDataURL('image/jpeg', 0.78);
      if (result.length > 250000) throw new Error();
      this.product.fotoUrl = result;
      this.photoError.set(false);
    } catch {
      this.error.set('No se pudo procesar la foto. Prueba con una imagen más pequeña.');
    } finally {
      URL.revokeObjectURL(url);
      this.processingPhoto.set(false);
      input.value = '';
    }
  }
  async saveCategory(): Promise<void> {
    if (this.busy() || !this.categoryName.trim()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const finalDesc = encodeCategoryDescription(this.categoryIcon, this.categoryDescription);
      const category = await firstValueFrom(
        this.http.post<CategoriaProducto>(this.url + '/categories', {
          sedeId: this.sedeId(),
          nombre: this.categoryName.trim(),
          descripcion: finalDesc,
        }),
      );
      this.categories.update((list) =>
        [...list, category].sort((a, b) => a.nombre.localeCompare(b.nombre)),
      );
      this.product.categoriaId = category.id;
      this.categoryName = '';
      this.categoryDescription = '';
      this.categoryIcon = 'local_drink';
      this.categoryMode.set(false);
    } catch (e: any) {
      this.error.set(e?.error?.message || 'No se pudo crear la categoría.');
    } finally {
      this.busy.set(false);
    }
  }
  async saveProduct(): Promise<void> {
    if (this.busy() || this.processingPhoto() || this.loading()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      await firstValueFrom(
        this.http.post(this.url + '/products', { ...this.product, sedeId: this.sedeId() }),
      );
      this.saved.emit();
      this.closed.emit();
    } catch (e: any) {
      this.error.set(e?.error?.message || 'No se pudo guardar el producto. Revisa los campos.');
    } finally {
      this.busy.set(false);
    }
  }
}
