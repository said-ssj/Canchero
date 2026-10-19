import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

declare global {
  interface Window {
    google?: any;
    __cancheroGoogleMapsSdkPromise?: Promise<any>;
  }
}

export interface GeoLocationCoordinates {
  lat: number;
  lng: number;
}

export interface GeocodedPlace {
  lat: number;
  lng: number;
  displayName: string;
}

export interface ReverseGeocodeResult {
  direccion: string;
  ciudad: string;
  displayName: string;
  fuente?: 'google' | 'google-places' | 'nominatim' | 'overpass';
  precision?: 'exacta' | 'aproximada';
}

@Injectable({
  providedIn: 'root',
})
export class MapsService {
  // Coordenadas por defecto (Ica, Perú - Plaza de Armas / Centro)
  readonly DEFAULT_LAT = -14.06778;
  readonly DEFAULT_LNG = -75.72861;

  /**
   * Obtiene la posición geográfica actual del usuario vía navigator.geolocation.
   */
  getCurrentPosition(): Promise<GeoLocationCoordinates> {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('La geolocalización no está soportada en tu navegador.'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: Number(position.coords.latitude.toFixed(6)),
            lng: Number(position.coords.longitude.toFixed(6)),
          });
        },
        (error) => {
          let msg = 'No se pudo obtener tu ubicación actual.';
          if (error.code === error.PERMISSION_DENIED) {
            msg = 'Permiso denegado para acceder a la ubicación. Habilita el GPS o permisos en tu navegador.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            msg = 'La información de ubicación no está disponible en este momento.';
          } else if (error.code === error.TIMEOUT) {
            msg = 'Se agotó el tiempo de espera al consultar la ubicación.';
          }
          reject(new Error(msg));
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        },
      );
    });
  }

  /**
   * Genera el enlace directo para navegación en Google Maps.
   */
  getGoogleMapsDirectionsUrl(lat: number, lng: number): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  /**
   * Genera la URL recomendada según el dispositivo para el botón "¿Cómo llegar?".
   */
  getBestDirectionsUrl(lat: number, lng: number): string {
    return this.getGoogleMapsDirectionsUrl(lat, lng);
  }

  /**
   * Búsqueda de lugares / direcciones en Perú vía servicio de geocodificación.
   */
  async searchPlaces(query: string): Promise<GeocodedPlace[]> {
    if (!query || query.trim().length < 3) return [];
    try {
      const q = encodeURIComponent(`${query.trim()}, Perú`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${q}&countrycodes=pe&limit=5`, {
        headers: { 'Accept-Language': 'es' },
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data || []).map((item: any) => ({
        lat: Number(parseFloat(item.lat).toFixed(6)),
        lng: Number(parseFloat(item.lon).toFixed(6)),
        displayName: item.display_name,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Genera la URL para iframe de mapa interactivo centrado en las coordenadas.
   */
  getEmbedMapUrl(lat: number, lng: number, zoom = 16, type: 'roadmap' | 'satellite' = 'satellite'): string {
    // Si es satélite, agregamos t=k para Google Maps satellite tiles
    const tParam = type === 'satellite' ? '&t=k' : '';
    return `https://maps.google.com/maps?q=${lat},${lng}&z=${zoom}${tParam}&output=embed`;
  }

  /**
   * Geocodificación inversa: Convierte coordenadas (lat, lng) a dirección física y distrito en Perú.
   */
  async reverseGeocode(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    const googleResult = await this.reverseGeocodeGoogle(lat, lng);
    if (googleResult) {
      return googleResult;
    }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
        {
          headers: {
            'Accept-Language': 'es',
            'User-Agent': 'CancheroApp/1.0',
          },
        },
      );
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.address) return null;

      const addr = data.address;
      const road = this.normalizarVia(addr.road || addr.pedestrian || addr.footway || addr.street || addr.residential || '');
      const num = addr.house_number || '';
      const barrio = addr.neighbourhood || addr.suburb || '';

      let direccion = '';
      if (road) {
        direccion = num ? `${road} ${num}` : road;
      } else if (barrio) {
        direccion = barrio;
      } else if (data.name) {
        direccion = data.name;
      } else {
        direccion = (data.display_name || '').split(',')[0] || '';
      }

      const ciudad =
        addr.suburb ||
        addr.city_district ||
        addr.district ||
        addr.city ||
        addr.town ||
        addr.village ||
        addr.state ||
        '';

      const baseResult: ReverseGeocodeResult = {
        direccion: direccion.trim(),
        ciudad: ciudad.trim(),
        displayName: data.display_name || '',
        fuente: 'nominatim',
        precision: num ? 'exacta' : 'aproximada',
      };

      const nearby = await this.buscarDireccionCercanaOverpass(lat, lng, road, ciudad);
      if (nearby) {
        return nearby;
      }

      return baseResult;
    } catch {
      return null;
    }
  }

  private async reverseGeocodeGoogle(lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    try {
      const googleMaps = await this.withTimeout(this.loadGoogleMapsSdk(), 4500, null);
      if (!googleMaps?.Geocoder) {
        return null;
      }

      const placeResult = await this.reverseGeocodeGooglePlaces(googleMaps, lat, lng);
      if (placeResult) {
        return placeResult;
      }

      const geocoder = new googleMaps.Geocoder();
      const results = await this.withTimeout(
        new Promise<any[]>((resolve) => {
          geocoder.geocode(
            {
              location: { lat, lng },
              region: 'PE',
            },
            (items: any[] | null, status: string) => {
              resolve(status === 'OK' && Array.isArray(items) ? items : []);
            },
          );
        }),
        4500,
        [],
      );

      if (!results.length) return null;

      const best =
        results.find((item) => item.types?.includes('street_address')) ||
        results.find((item) => item.types?.includes('premise')) ||
        results.find((item) => item.types?.includes('establishment')) ||
        results.find((item) => item.types?.includes('point_of_interest')) ||
        results.find((item) => item.types?.includes('route')) ||
        results[0];

      const components = Array.isArray(best.address_components) ? best.address_components : [];
      const route = this.getGoogleComponent(components, 'route');
      const streetNumber = this.getGoogleComponent(components, 'street_number');
      const premise = this.getGoogleComponent(components, 'premise') || this.getGoogleComponent(components, 'establishment');
      const ciudad =
        this.getGoogleComponent(components, 'locality') ||
        this.getGoogleComponent(components, 'administrative_area_level_2') ||
        this.getGoogleComponent(components, 'administrative_area_level_1') ||
        '';

      let direccion = '';
      if (route && streetNumber) {
        direccion = `${this.normalizarVia(route)} ${streetNumber}`;
      } else if (best.formatted_address) {
        direccion = this.limpiarDireccionGoogle(best.formatted_address);
      } else if (premise) {
        direccion = premise;
      } else if (route) {
        direccion = this.normalizarVia(route);
      }

      if (!direccion) return null;

      return {
        direccion,
        ciudad,
        displayName: best.formatted_address || direccion,
        fuente: 'google',
        precision: route && streetNumber ? 'exacta' : 'aproximada',
      };
    } catch {
      return null;
    }
  }

  private async reverseGeocodeGooglePlaces(googleMaps: any, lat: number, lng: number): Promise<ReverseGeocodeResult | null> {
    if (!googleMaps?.places?.PlacesService || typeof document === 'undefined') {
      return null;
    }

    try {
      const service = new googleMaps.places.PlacesService(document.createElement('div'));
      const location = new googleMaps.LatLng(lat, lng);
      const places = await this.withTimeout(
        new Promise<any[]>((resolve) => {
          service.nearbySearch(
            {
              location,
              radius: 45,
            },
            (results: any[] | null, status: string) => {
              resolve(status === googleMaps.places.PlacesServiceStatus.OK && Array.isArray(results) ? results : []);
            },
          );
        }),
        4500,
        [],
      );

      const best = places
        .filter((place) => place.place_id && !place.types?.includes('route') && !place.types?.includes('political'))
        .map((place) => ({
          place,
          distance: this.distanciaMetros(lat, lng, place.geometry?.location?.lat?.() ?? lat, place.geometry?.location?.lng?.() ?? lng),
          score: this.distanciaMetros(lat, lng, place.geometry?.location?.lat?.() ?? lat, place.geometry?.location?.lng?.() ?? lng) +
            (place.types?.includes('point_of_interest') || place.types?.includes('establishment') ? 0 : 20),
        }))
        .sort((a, b) => a.score - b.score)[0]?.place;

      if (!best?.place_id) {
        return null;
      }

      const details = await this.withTimeout(
        new Promise<any | null>((resolve) => {
          service.getDetails(
            {
              placeId: best.place_id,
              fields: ['name', 'formatted_address', 'address_components', 'geometry'],
              language: 'es',
              region: 'PE',
            },
            (place: any | null, status: string) => {
              resolve(status === googleMaps.places.PlacesServiceStatus.OK ? place : null);
            },
          );
        }),
        4500,
        null,
      );

      const formattedAddress = details?.formatted_address || best.vicinity || '';
      const direccion = this.limpiarDireccionGoogle(formattedAddress);
      if (!direccion) {
        return null;
      }

      const components = Array.isArray(details?.address_components) ? details.address_components : [];
      const ciudad =
        this.getGoogleComponent(components, 'locality') ||
        this.getGoogleComponent(components, 'administrative_area_level_2') ||
        this.getGoogleComponent(components, 'administrative_area_level_1') ||
        '';

      return {
        direccion,
        ciudad,
        displayName: details?.name ? `${details.name}, ${formattedAddress}` : formattedAddress,
        fuente: 'google-places',
        precision: /\d/.test(direccion) ? 'exacta' : 'aproximada',
      };
    } catch {
      return null;
    }
  }

  private async loadGoogleMapsSdk(): Promise<any | null> {
    const apiKey = environment.googleMapsApiKey?.trim();
    if (!apiKey || typeof window === 'undefined' || typeof document === 'undefined') {
      return null;
    }

    if (window.google?.maps?.Geocoder) {
      return window.google.maps;
    }

    if (window.__cancheroGoogleMapsSdkPromise) {
      return window.__cancheroGoogleMapsSdkPromise;
    }

    window.__cancheroGoogleMapsSdkPromise = new Promise((resolve) => {
      const finish = (maps: any | null) => {
        window.setTimeout(() => resolve(maps), 0);
      };
      const timeout = window.setTimeout(() => resolve(window.google?.maps?.Geocoder ? window.google.maps : null), 4500);
      const existing = document.getElementById('google-maps-sdk') as HTMLScriptElement | null;
      if (existing) {
        if (window.google?.maps?.Geocoder) {
          window.clearTimeout(timeout);
          finish(window.google.maps);
          return;
        }
        existing.addEventListener(
          'load',
          () => {
            window.clearTimeout(timeout);
            finish(window.google?.maps?.Geocoder ? window.google.maps : null);
          },
          { once: true },
        );
        existing.addEventListener(
          'error',
          () => {
            window.clearTimeout(timeout);
            finish(null);
          },
          { once: true },
        );
        return;
      }

      const script = document.createElement('script');
      script.id = 'google-maps-sdk';
      script.async = true;
      script.defer = true;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&language=es&region=PE&libraries=places`;
      script.onload = () => {
        window.clearTimeout(timeout);
        finish(window.google?.maps?.Geocoder ? window.google.maps : null);
      };
      script.onerror = () => {
        window.clearTimeout(timeout);
        finish(null);
      };
      document.head.appendChild(script);
    });

    return window.__cancheroGoogleMapsSdkPromise;
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timeoutId: number | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((resolve) => {
          timeoutId = window.setTimeout(() => resolve(fallback), ms);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    }
  }

  private getGoogleComponent(components: any[], type: string): string {
    return components.find((component) => component.types?.includes(type))?.long_name || '';
  }

  private limpiarDireccionGoogle(value: string): string {
    return (value || '')
      .replace(/,\s*Per[uú]$/i, '')
      .replace(/,\s*\d{5}\s*,?/g, ',')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .slice(0, 2)
      .join(', ');
  }

  private async buscarDireccionCercanaOverpass(
    lat: number,
    lng: number,
    fallbackRoad: string,
    fallbackCiudad: string,
  ): Promise<ReverseGeocodeResult | null> {
    try {
      const query = `
        [out:json][timeout:8];
        (
          node(around:80,${lat},${lng})["addr:housenumber"];
          way(around:80,${lat},${lng})["addr:housenumber"];
          relation(around:80,${lat},${lng})["addr:housenumber"];
          node(around:45,${lat},${lng})["name"];
          way(around:45,${lat},${lng})["name"];
        );
        out center tags 40;
      `;
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
      });
      if (!res.ok) return null;
      const data = await res.json();
      const elements = Array.isArray(data?.elements) ? data.elements : [];
      const candidates = elements
        .map((el: any) => {
          const tags = el.tags || {};
          const elLat = Number(el.lat ?? el.center?.lat);
          const elLng = Number(el.lon ?? el.center?.lon);
          if (!Number.isFinite(elLat) || !Number.isFinite(elLng)) return null;
          const distance = this.distanciaMetros(lat, lng, elLat, elLng);
          const street = this.normalizarVia(tags['addr:street'] || tags['addr:place'] || fallbackRoad);
          const houseNumber = tags['addr:housenumber'] || '';
          const name = tags.name || '';
          const city = tags['addr:city'] || tags['addr:district'] || tags['addr:suburb'] || fallbackCiudad;
          let direccion = '';
          let precision: ReverseGeocodeResult['precision'] = 'aproximada';

          if (street && houseNumber) {
            direccion = `${street} ${houseNumber}`;
            precision = 'exacta';
          } else if (name && street) {
            direccion = street;
          } else if (name) {
            direccion = name;
          } else if (street) {
            direccion = street;
          }

          if (!direccion) return null;

          const hasExactAddress = Boolean(street && houseNumber);
          const score = distance + (hasExactAddress ? 0 : 35) + (name && !hasExactAddress ? 15 : 0);
          return {
            direccion,
            ciudad: city || '',
            displayName: name ? `${name}, ${direccion}` : direccion,
            fuente: 'overpass' as const,
            precision,
            score,
          };
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.score - b.score);

      const best = candidates[0] as (ReverseGeocodeResult & { score: number }) | undefined;
      if (!best) return null;
      return {
        direccion: best.direccion,
        ciudad: best.ciudad,
        displayName: best.displayName,
        fuente: best.fuente,
        precision: best.precision,
      };
    } catch {
      return null;
    }
  }

  private normalizarVia(value: string): string {
    return (value || '')
      .replace(/^Avenida\b/i, 'Av.')
      .replace(/^Avenue\b/i, 'Av.')
      .replace(/^Jir[oó]n\b/i, 'Jr.')
      .replace(/^Calle\b/i, 'Calle')
      .trim();
  }

  private distanciaMetros(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const earth = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
