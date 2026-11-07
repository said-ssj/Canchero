import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatabaseService } from '@core/supabase/database.service';
import type { Venue } from '@shared/models/venue.model';

@Component({
  imports: [RouterLink],
  selector: 'app-home',
  styleUrl: './home.css',
  templateUrl: './home.html',
})
export class Home {
  private readonly db = inject(DatabaseService);

  protected readonly featuredVenue = computed<Venue | undefined>(() => {
    const venues = this.db.getVenuesPublicos();
    return venues.find((v) => v.fotos.length > 0) ?? venues[0];
  });

  protected readonly fallbackImage = '/images/IMAGEN_FUTBOL.webp';
  protected readonly heroImage = computed(
    () => this.featuredVenue()?.fotos[0]?.trim() || this.fallbackImage,
  );

  protected onImageError(event: Event): void {
    const image = event.target as HTMLImageElement;
    if (image.getAttribute('src') !== this.fallbackImage) image.src = this.fallbackImage;
  }
}
