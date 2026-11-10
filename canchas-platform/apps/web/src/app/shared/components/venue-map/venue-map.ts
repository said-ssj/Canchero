import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  input,
} from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-venue-map',
  template: `
    <div
      #mapEl
      class="canchero-venue-map"
      [style.height]="height()"
      aria-label="Ubicación de la sede en el mapa"
    ></div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .canchero-venue-map {
      width: 100%;
      min-height: 220px;
      display: block;
      z-index: 1;
    }
  `,
})
export class VenueMap implements AfterViewInit, OnDestroy {
  readonly lat = input.required<number>();
  readonly lng = input.required<number>();
  readonly zoom = input<number>(16);
  readonly height = input<string>('260px');

  @ViewChild('mapEl', { static: true })
  private readonly mapEl!: ElementRef<HTMLElement>;

  private leafletMap: any = null;
  private leafletMarker: any = null;
  private resizeTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  constructor() {
    effect(() => {
      const lat = this.lat();
      const lng = this.lng();
      const zoom = this.zoom();
      if (this.leafletMap && this.leafletMarker && Number.isFinite(lat) && Number.isFinite(lng)) {
        this.leafletMarker.setLatLng([lat, lng]);
        this.leafletMap.setView([lat, lng], zoom);
      }
    });
  }

  async ngAfterViewInit(): Promise<void> {
    if (typeof window === 'undefined') return;
    try {
      const L = (await import('leaflet')).default || (await import('leaflet'));
      if (this.destroyed) return;
      const container = this.mapEl?.nativeElement;
      if (!container) return;

      const initialLat = Number.isFinite(this.lat()) ? this.lat() : -12.1192;
      const initialLng = Number.isFinite(this.lng()) ? this.lng() : -77.029;

      this.leafletMap = L.map(container, {
        center: [initialLat, initialLng],
        zoom: this.zoom(),
        zoomControl: true,
      });

      L.tileLayer('https://{s}.google.com/vt/lyrs=s,h&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        maxNativeZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '© Google Maps',
      }).addTo(this.leafletMap);

      const pinIcon = L.divIcon({
        className: 'canchero-map-marker',
        html: `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center;">
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
        draggable: false,
        icon: pinIcon,
      }).addTo(this.leafletMap);

      this.leafletMap.invalidateSize();
      this.resizeTimer = setTimeout(() => {
        this.resizeTimer = null;
        if (!this.destroyed) {
          this.leafletMap?.invalidateSize();
        }
      }, 250);
    } catch (err) {
      console.warn('Leaflet map init error:', err);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.resizeTimer) {
      clearTimeout(this.resizeTimer);
      this.resizeTimer = null;
    }
    if (this.leafletMap) {
      this.leafletMap.remove();
      this.leafletMap = null;
      this.leafletMarker = null;
    }
  }
}
