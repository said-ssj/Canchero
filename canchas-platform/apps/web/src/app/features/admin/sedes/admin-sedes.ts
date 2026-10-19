import {
  Component,
  computed,
  ElementRef,
  inject,
  output,
  signal,
  viewChild,
  type OnInit,
  type OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, ActivatedRoute } from '@angular/router';
import { DatabaseService } from '@core/supabase/database.service';
import { AuthService } from '@core/auth/auth.service';
import { MapsService, type GeocodedPlace } from '@core/services/maps.service';
import { AdminSedeCard } from '../components/sede-card/sede-card';
import { AdminAddAction } from '../components/add-action/add-action';
import type { VenueDayHours } from '@shared/models/venue-hours.model';

export interface FotoGaleriaItem {
  id: string;
  url: string;
  alt: string;
  label: string;
}

@Component({
  standalone: true,
  selector: 'app-admin-sedes',
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatIconModule,
    MatTooltipModule,
    MatChipsModule,
    MatFormFieldModule,
    MatInputModule,
    AdminSedeCard,
    AdminAddAction,
  ],
  templateUrl: './admin-sedes.html',
  styleUrl: './admin-sedes.css',
})
export class AdminSedes implements OnInit, OnDestroy {
  protected readonly db = inject(DatabaseService);
  protected readonly auth = inject(AuthService);
  private readonly mapsService = inject(MapsService);
  private readonly router = inject(Router, { optional: true });
  private readonly route = inject(ActivatedRoute, { optional: true });

  // Eventos hacia el contenedor admin o enrutador
  readonly viewCourts = output<string | number>();
  readonly venueSelected = output<string | number>();

  // Estado del Dueño y Sedes
  protected readonly duenoId = computed(() => this.auth.currentUser()?.id ?? null);

  protected readonly sedesDelDueno = computed(() => {
    const duenoId = this.duenoId();
    return duenoId ? this.db.getSedesPorDueno(duenoId) : [];
  });

  protected readonly isLoading = computed(() => this.db.catalogLoading());

  protected readonly hasError = computed(() => this.db.loadErrors().length > 0);
  protected readonly errorMessage = computed(() => this.db.loadErrors().join(', '));

  // Estado del Formulario de Sede
  protected readonly formularioSedeAbierto = signal(false);
  protected readonly sedeEnEdicion = signal<any | null>(null);

  protected readonly liveVenueName = signal('');
  protected readonly liveVenueAddress = signal('');
  protected readonly liveVenueCiudad = signal('');
  protected readonly liveVenueTelefono = signal('');
  protected readonly liveVenueStory = signal('');
  protected readonly liveVenueLogo = signal('');
  protected readonly liveVenueLat = signal(-12.1192);
  protected readonly liveVenueLng = signal(-77.029);
  protected readonly historiaContadorSede = signal(0);
  protected readonly galeriaFotos = signal<FotoGaleriaItem[]>([]);
  protected readonly uploadingPhotos = signal(false);
  private readonly logoInput = viewChild<ElementRef<HTMLInputElement>>('logoInput');
  private readonly galleryInput = viewChild<ElementRef<HTMLInputElement>>('galleryInput');
  private photoRequest = 0;

  private invalidatePhotoRequests(): void {
    ++this.photoRequest;
    this.uploadingPhotos.set(false);
  }

  // Mapa Leaflet y Geocodificación
  protected readonly mapZoom = signal(16);
  protected readonly mapType = signal<'satellite' | 'roadmap'>('satellite');
  protected readonly geocodingQuery = signal('');
  protected readonly geocodingResultados = signal<GeocodedPlace[]>([]);
  protected readonly geocodificandoReversa = signal(false);
  protected readonly buscandoUbicacionGps = signal(false);

  private leafletMap: any = null;
  private leafletMarker: any = null;
  private tileLayerSatellite: any = null;
  private tileLayerRoadmap: any = null;
  private readonly mapContainer = viewChild<ElementRef<HTMLDivElement>>('venueMap');
  private mapRequest = 0;
  private mapInitTimeout: ReturnType<typeof setTimeout> | null = null;
  private mapResizeTimeout: ReturnType<typeof setTimeout> | null = null;

  // Drawer de Horarios Semanales (VenueHoursService)
  protected readonly drawerHorariosOpen = signal(false);
  protected readonly drawerHorariosNombre = signal('');
  protected readonly horariosCargando = signal(false);
  protected readonly horariosGuardando = signal(false);
  protected readonly horariosError = signal('');
  protected readonly horariosSemana = signal<VenueDayHours[]>([]);
  private horariosSedeId: number | null = null;
  private horariosRequest = 0;

  protected readonly diasSemanaLabels: string[] = [
    'Domingo',
    'Lunes',
    'Martes',
    'Miércoles',
    'Jueves',
    'Viernes',
    'Sábado',
  ];

  // Consejos Pro Canchero rotativos
  protected readonly consejoActualIndex = signal(0);
  private consejoIntervalId: any = null;
  protected readonly consejosPro: string[] = [
    'Las sedes con fotos reales del césped y vestuarios registran 45% más reservas online.',
    'Verifica que el pin de Google Maps esté exactamente sobre el portón de ingreso.',
    'Configura las franjas nocturnas para aplicar la tarifa adecuada automáticamente.',
    'Mantén actualizado el teléfono de recepción para resolver consultas de jugadores rápidamente.',
    'Agrega una breve historia del complejo para construir confianza con clientes corporativos.',
    'Revisa semanalmente los horarios para reflejar feriados o descansos programados.',
    'Canchero protege tu inventario asociando cada producto y venta a su sede específica.',
  ];

  // Feedback y Toast
  protected readonly toastMessage = signal('');
  private toastTimeout: any = null;

  verCanchasDeSede(sedeId: string | number): void {
    if (typeof this.db?.setSedeOperativaId === 'function') {
      this.db.setSedeOperativaId(Number(sedeId));
    }
    this.viewCourts.emit(sedeId);
    if (this.router) {
      void this.router.navigate(['/admin/canchas'])?.catch(() => {});
    }
  }

  ngOnInit(): void {
    this.iniciarRotacionConsejos();
    if (this.route?.snapshot.queryParams['openHours'] === 'true') {
      setTimeout(() => {
        const activeSede = this.sedesDelDueno().find((s) => Number(s.id) === Number(this.db.sedeOperativaId())) || this.sedesDelDueno()[0];
        if (activeSede) {
          this.abrirDrawerHorarios(activeSede);
        }
      }, 100);
    }
  }

  ngOnDestroy(): void {
    this.invalidatePhotoRequests();
    if (this.consejoIntervalId) {
      clearInterval(this.consejoIntervalId);
    }
    if (this.toastTimeout) {
      clearTimeout(this.toastTimeout);
    }
    this.destruirMapa();
  }

  private destruirMapa(): void {
    ++this.mapRequest;
    if (this.mapInitTimeout !== null) clearTimeout(this.mapInitTimeout);
    if (this.mapResizeTimeout !== null) clearTimeout(this.mapResizeTimeout);
    this.mapInitTimeout = null;
    this.mapResizeTimeout = null;
    if (this.leafletMap) {
      try {
        this.leafletMap.remove();
      } catch {
        // ignore
      }
      this.leafletMap = null;
    }
    this.leafletMarker = null;
    this.tileLayerSatellite = null;
    this.tileLayerRoadmap = null;
  }

  private iniciarRotacionConsejos(): void {
    if (typeof window === 'undefined') return;
    this.consejoIntervalId = setInterval(() => {
      this.consejoActualIndex.update((i) => (i + 1) % this.consejosPro.length);
    }, 4500);
  }

  protected seleccionarConsejo(index: number): void {
    this.consejoActualIndex.set(index);
  }

  protected mostrarToast(mensaje: string): void {
    this.toastMessage.set(mensaje);
    if (this.toastTimeout) clearTimeout(this.toastTimeout);
    this.toastTimeout = setTimeout(() => this.toastMessage.set(''), 3500);
  }

  // Acciones de Apertura / Edición de Sede
  abrirFormularioNuevaSede(): void {
    this.invalidatePhotoRequests();
    this.sedeEnEdicion.set(null);
    this.liveVenueName.set('');
    this.liveVenueAddress.set('');
    this.liveVenueCiudad.set('');
    this.liveVenueTelefono.set('');
    this.liveVenueStory.set('');
    this.liveVenueLogo.set('');
    this.liveVenueLat.set(-12.1192);
    this.liveVenueLng.set(-77.029);
    this.historiaContadorSede.set(0);
    this.galeriaFotos.set([]);
    this.geocodingResultados.set([]);
    this.formularioSedeAbierto.set(true);

    void this.iniciarMapaLeaflet();
  }

  editarSede(sede: any): void {
    this.invalidatePhotoRequests();
    this.sedeEnEdicion.set(sede);
    this.liveVenueName.set(sede.nombre || '');
    this.liveVenueAddress.set(sede.direccion || '');
    this.liveVenueCiudad.set(sede.ciudad || '');
    this.liveVenueTelefono.set(sede.telefono || '');
    this.liveVenueStory.set(sede.descripcion || '');
    this.liveVenueLogo.set(sede.imagen_url || sede.logo_url || '');
    this.liveVenueLat.set(sede.latitud != null ? Number(sede.latitud) : -12.1192);
    this.liveVenueLng.set(sede.longitud != null ? Number(sede.longitud) : -77.029);
    this.historiaContadorSede.set((sede.descripcion || '').length);

    const fotos: FotoGaleriaItem[] = (sede.fotos || []).map((url: string, index: number) => ({
      id: `foto-${index}-${Date.now()}`,
      url,
      alt: `${sede.nombre} - Foto ${index + 1}`,
      label: index === 0 ? 'Portada Principal' : `Foto ${index + 1}`,
    }));
    this.galeriaFotos.set(fotos);
    this.geocodingResultados.set([]);
    this.formularioSedeAbierto.set(true);

    this.venueSelected.emit(sede.id);
    void this.iniciarMapaLeaflet();
  }

  cerrarFormularioSede(): void {
    this.invalidatePhotoRequests();
    this.destruirMapa();
    this.formularioSedeAbierto.set(false);
    this.sedeEnEdicion.set(null);
  }

  guardarCambiosSede(): void {
    const duenoId = this.duenoId();
    if (!duenoId || this.uploadingPhotos()) return;
    const nombre = this.liveVenueName().trim() || 'Mi Sede Deportiva';
    const direccion = this.liveVenueAddress().trim() || 'Sin dirección física';
    const ciudad = this.liveVenueCiudad().trim();
    const telefono = this.liveVenueTelefono().trim() || '+51 987 654 321';
    const descripcion = this.liveVenueStory().trim();
    const logo = this.liveVenueLogo();
    const fotosGaleria = this.galeriaFotos().map((f) => f.url).filter(Boolean);
    const portada = fotosGaleria[0] || logo;

    const payload: any = {
      nombre,
      direccion,
      ciudad,
      telefono,
      descripcion,
      latitud: this.liveVenueLat(),
      longitud: this.liveVenueLng(),
      fotos: fotosGaleria.length ? fotosGaleria : portada ? [portada] : [],
    };
    if (portada) {
      payload.imagen_url = portada;
    }

    if (this.sedeEnEdicion()) {
      payload.id = this.sedeEnEdicion().id;
    } else {
      payload.isNew = true;
    }

    try {
      this.db.saveOrUpdateSede(duenoId, payload);
    } catch {
      this.mostrarToast('No se pudo registrar la sede. Revisa los datos y vuelve a intentar.');
      return;
    }
    this.mostrarToast('Cambios registrados localmente; sincronización remota sin confirmar.');
    this.cerrarFormularioSede();
  }

  // Leaflet y Mapa
  protected async iniciarMapaLeaflet(): Promise<void> {
    if (typeof window === 'undefined') return;
    this.destruirMapa();
    const request = this.mapRequest;
    try {
      const L = await import('leaflet');
      if (request !== this.mapRequest) return;
      this.mapInitTimeout = setTimeout(() => {
        this.mapInitTimeout = null;
        const mapContainer = this.mapContainer()?.nativeElement;
        if (request !== this.mapRequest || !this.formularioSedeAbierto() || !mapContainer?.isConnected) return;

        const initialLat = this.liveVenueLat() || -12.1192;
        const initialLng = this.liveVenueLng() || -77.029;

        this.leafletMap = L.map(mapContainer, {
          center: [initialLat, initialLng],
          zoom: this.mapZoom(),
          zoomControl: false,
        });

        const googleTileOptions = {
          maxZoom: 20,
          maxNativeZoom: 20,
          subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
          attribution: '© Google Maps',
        };

        this.tileLayerSatellite = L.tileLayer(
          'https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}',
          googleTileOptions,
        );
        this.tileLayerRoadmap = L.tileLayer(
          'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
          googleTileOptions,
        );

        if (this.mapType() === 'satellite') {
          this.tileLayerSatellite.addTo(this.leafletMap);
        } else {
          this.tileLayerRoadmap.addTo(this.leafletMap);
        }

        const pinIcon = L.divIcon({
          className: 'canchero-map-marker',
          html: `
            <div style="position: relative; display: flex; flex-direction: column; align-items: center; cursor: grab;">
              <div style="width: 36px; height: 36px; border-radius: 50%; background: #ef4444; color: white; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 14px rgba(239,68,68,0.6); border: 2.5px solid #ffffff;">
                <span class="material-symbols-outlined" style="font-size: 20px; line-height: 1;">sports_soccer</span>
              </div>
              <div style="width: 0; height: 0; border-left: 6px solid transparent; border-right: 6px solid transparent; border-top: 8px solid #ef4444; margin-top: -1px;"></div>
              <div style="width: 12px; height: 4px; border-radius: 50%; background: rgba(0,0,0,0.35); margin-top: 2px;"></div>
            </div>
          `,
          iconSize: [36, 48],
          iconAnchor: [18, 46],
        });

        this.leafletMarker = L.marker([initialLat, initialLng], {
          draggable: true,
          icon: pinIcon,
          autoPan: true,
        }).addTo(this.leafletMap);

        this.leafletMarker.on('dragend', () => {
          const pos = this.leafletMarker.getLatLng();
          this.actualizarCoordenadasYDireccion(pos.lat, pos.lng, true);
        });

        this.leafletMap.on('click', (e: any) => {
          const lat = e.latlng.lat;
          const lng = e.latlng.lng;
          this.leafletMarker.setLatLng([lat, lng]);
          this.actualizarCoordenadasYDireccion(lat, lng, true);
        });

        this.leafletMap.invalidateSize();
        this.mapResizeTimeout = setTimeout(() => {
          this.mapResizeTimeout = null;
          if (request === this.mapRequest) this.leafletMap?.invalidateSize();
        }, 300);
      }, 100);
    } catch (err) {
      console.warn('Leaflet initialization error:', err);
    }
  }

  protected async actualizarCoordenadasYDireccion(lat: number, lng: number, reverseGeocode = true): Promise<void> {
    const fixedLat = Number(lat.toFixed(6));
    const fixedLng = Number(lng.toFixed(6));
    this.liveVenueLat.set(fixedLat);
    this.liveVenueLng.set(fixedLng);

    if (this.leafletMarker) {
      this.leafletMarker.setLatLng([fixedLat, fixedLng]);
    }

    if (reverseGeocode) {
      this.geocodificandoReversa.set(true);
      try {
        const res = await this.mapsService.reverseGeocode(fixedLat, fixedLng);
        if (res && res.direccion) {
          this.liveVenueAddress.set(res.direccion);
          if (res.ciudad) {
            this.liveVenueCiudad.set(res.ciudad);
          }
        }
      } catch {
        // ignore
      } finally {
        this.geocodificandoReversa.set(false);
      }
    }
  }

  protected cambiarTipoMapa(tipo: 'satellite' | 'roadmap'): void {
    this.mapType.set(tipo);
    if (!this.leafletMap) return;
    if (tipo === 'satellite') {
      if (this.tileLayerRoadmap) this.leafletMap.removeLayer(this.tileLayerRoadmap);
      if (this.tileLayerSatellite) this.tileLayerSatellite.addTo(this.leafletMap);
    } else {
      if (this.tileLayerSatellite) this.leafletMap.removeLayer(this.tileLayerSatellite);
      if (this.tileLayerRoadmap) this.tileLayerRoadmap.addTo(this.leafletMap);
    }
  }

  protected centrarPinEnCentroMapa(): void {
    if (!this.leafletMap) return;
    const center = this.leafletMap.getCenter();
    this.actualizarCoordenadasYDireccion(center.lat, center.lng, true);
  }

  protected async obtenerUbicacionActualGPS(): Promise<void> {
    this.buscandoUbicacionGps.set(true);
    try {
      const pos = await this.mapsService.getCurrentPosition();
      this.actualizarCoordenadasYDireccion(pos.lat, pos.lng, true);
      if (this.leafletMap) {
        this.leafletMap.setView([pos.lat, pos.lng], 17);
      }
    } catch (e: any) {
      this.mostrarToast(e.message || 'No se pudo obtener la ubicación GPS.');
    } finally {
      this.buscandoUbicacionGps.set(false);
    }
  }

  protected moverPinRelativo(deltaLat: number, deltaLng: number): void {
    const newLat = this.liveVenueLat() + deltaLat;
    const newLng = this.liveVenueLng() + deltaLng;
    this.actualizarCoordenadasYDireccion(newLat, newLng, true);
    if (this.leafletMap) {
      this.leafletMap.panTo([newLat, newLng]);
    }
  }

  protected zoomInMapa(): void {
    if (this.leafletMap) this.leafletMap.zoomIn();
  }

  protected zoomOutMapa(): void {
    if (this.leafletMap) this.leafletMap.zoomOut();
  }

  protected async buscarLugaresEnMapa(query: string): Promise<void> {
    this.geocodingQuery.set(query);
    if (!query || query.trim().length < 3) {
      this.geocodingResultados.set([]);
      return;
    }
    const results = await this.mapsService.searchPlaces(query);
    this.geocodingResultados.set(results);
  }

  protected seleccionarLugarSugerido(lugar: GeocodedPlace): void {
    this.actualizarCoordenadasYDireccion(lugar.lat, lugar.lng, false);
    this.liveVenueAddress.set(lugar.displayName.split(',')[0] || lugar.displayName);
    this.geocodingResultados.set([]);
    if (this.leafletMap) {
      this.leafletMap.setView([lugar.lat, lugar.lng], 17);
    }
  }

  protected actualizarLatitudManual(val: any): void {
    const num = parseFloat(val);
    if (!isNaN(num)) this.actualizarCoordenadasYDireccion(num, this.liveVenueLng(), false);
  }

  protected actualizarLongitudManual(val: any): void {
    const num = parseFloat(val);
    if (!isNaN(num)) this.actualizarCoordenadasYDireccion(this.liveVenueLat(), num, false);
  }

  protected verEnGoogleMapsUrl(): string {
    return this.mapsService.getGoogleMapsDirectionsUrl(this.liveVenueLat(), this.liveVenueLng());
  }

  // Fotos y Logo
  protected triggerInputLogo(): void {
    if (!this.uploadingPhotos()) this.logoInput()?.nativeElement.click();
  }

  protected async onLogoSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file || this.uploadingPhotos()) return;
    input.value = '';
    if (!file.type.startsWith('image/') || file.size > 5 * 1024 * 1024) {
      this.mostrarToast('Selecciona una imagen de hasta 5 MB.');
      return;
    }
    const request = ++this.photoRequest;
    this.uploadingPhotos.set(true);
    try {
      const url = await this.db.uploadPublicImage(file, 'sedes/logos');
      if (request === this.photoRequest) this.liveVenueLogo.set(url);
    } catch {
      if (request === this.photoRequest) this.mostrarToast('No se pudo subir el logo. Se conserva la imagen anterior.');
    } finally {
      if (request === this.photoRequest) this.uploadingPhotos.set(false);
    }
  }

  protected eliminarLogo(): void {
    if (this.uploadingPhotos()) return;
    this.liveVenueLogo.set('');
  }

  protected subirGaleria(): void {
    if (!this.uploadingPhotos()) this.galleryInput()?.nativeElement.click();
  }

  protected async onGallerySelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    if (!files.length || this.uploadingPhotos()) return;
    input.value = '';
    if (files.length + this.galeriaFotos().length > 12
      || files.some(file => !file.type.startsWith('image/') || file.size > 10 * 1024 * 1024)) {
      this.mostrarToast('La galería admite hasta 12 imágenes de hasta 10 MB cada una.');
      return;
    }
    const request = ++this.photoRequest;
    this.uploadingPhotos.set(true);
    try {
      for (const [index, file] of files.entries()) {
        const url = await this.db.uploadPublicImage(file, 'sedes/galeria');
        if (request !== this.photoRequest) return;
        this.galeriaFotos.update(prev => [...prev, {
          id: `foto-${request}-${index}`, url, alt: file.name,
          label: prev.length ? `Foto ${prev.length + 1}` : 'Portada Principal',
        }]);
      }
    } catch {
      if (request === this.photoRequest) this.mostrarToast('No se completó la subida. Se conservan las fotos ya cargadas.');
    } finally {
      if (request === this.photoRequest) this.uploadingPhotos.set(false);
    }
  }

  protected eliminarFotoGaleria(id: string): void {
    this.galeriaFotos.update((prev) => prev.filter((f) => f.id !== id));
  }

  protected hacerPortada(id: string): void {
    const items = [...this.galeriaFotos()];
    const index = items.findIndex((f) => f.id === id);
    if (index > 0) {
      const [chosen] = items.splice(index, 1);
      chosen.label = 'Portada Principal';
      items.unshift(chosen);
      items.forEach((item, idx) => {
        if (idx !== 0) item.label = `Foto ${idx + 1}`;
      });
      this.galeriaFotos.set(items);
    }
  }

  // Horarios Semanales (Drawer)
  async abrirDrawerHorarios(sede: any): Promise<void> {
    if (!sede || this.horariosGuardando()) return;
    const request = ++this.horariosRequest;
    this.horariosSedeId = Number(sede.id);
    this.drawerHorariosNombre.set(sede.nombre);
    this.drawerHorariosOpen.set(true);
    this.horariosCargando.set(true);
    this.horariosError.set('');
    this.horariosSemana.set([]);

    try {
      const saved = await this.db.cargarHorariosSede(this.horariosSedeId);
      if (request !== this.horariosRequest) return;
      this.horariosSemana.set(
        [1, 2, 3, 4, 5, 6, 0].map((diaSemana) => {
          const day = saved.find((h) => h.diaSemana === diaSemana);
          return {
            diaSemana,
            apertura: day?.apertura.slice(0, 5) ?? '06:00',
            cierre: day?.cierre.slice(0, 5) ?? '23:00',
            activo: day?.activo ?? false,
          };
        }),
      );
    } catch {
      if (request === this.horariosRequest) {
        this.horariosError.set('No se pudieron cargar los horarios. Comprueba la conexión con el servidor.');
      }
    } finally {
      if (request === this.horariosRequest) {
        this.horariosCargando.set(false);
      }
    }
  }

  cerrarDrawerHorarios(): void {
    if (this.horariosGuardando()) return;
    ++this.horariosRequest;
    this.drawerHorariosOpen.set(false);
  }

  cambiarHorario(dia: number, campo: 'apertura' | 'cierre' | 'activo', valor: string | boolean): void {
    this.horariosSemana.update((days) =>
      days.map((day) => (day.diaSemana === dia ? { ...day, [campo]: valor } : day)),
    );
    this.horariosError.set('');
  }

  async guardarHorariosDrawer(): Promise<void> {
    const sedeId = this.horariosSedeId;
    if (!sedeId || this.horariosGuardando() || this.horariosCargando()) return;
    const days = this.horariosSemana();
    if (
      days.length !== 7 ||
      days.some(
        (day) =>
          !/^\d{2}:\d{2}$/.test(day.apertura) ||
          !/^\d{2}:\d{2}$/.test(day.cierre) ||
          (day.activo && day.apertura === day.cierre),
      )
    ) {
      this.horariosError.set(
        'Completa las horas; apertura y cierre deben ser diferentes en los días abiertos.',
      );
      return;
    }

    this.horariosGuardando.set(true);
    this.horariosError.set('');
    try {
      await this.db.guardarHorariosSede(sedeId, days);
      this.drawerHorariosOpen.set(false);
      this.mostrarToast('Horarios de atención guardados');
    } catch {
      this.horariosError.set('No se guardaron los horarios. Revisa tu conexión y los permisos.');
    } finally {
      this.horariosGuardando.set(false);
    }
  }

  placeholderCover(): string {
    return 'https://images.unsplash.com/photo-1529900240041-22f114de2f11?w=800&auto=format&fit=crop&q=80';
  }

  totalLosas(sedeId?: any): number {
    const id = sedeId ?? this.sedeEnEdicion()?.id;
    if (!id) return 0;
    return this.db.canchas().filter((c) => String(c.id_sede) === String(id)).length;
  }
}
