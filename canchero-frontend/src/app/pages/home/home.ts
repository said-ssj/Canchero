import { Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatabaseService } from '../../services/database.service';
import type { Venue } from '../../models/venue.model';

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
    return venues.find(v => v.fotos.length > 0) ?? venues[0];
  });

  protected readonly heroImage = computed(() => 
    this.featuredVenue()?.fotos[0] ?? 'https://images.unsplash.com/photo-1551958219-acbc608c6377?q=80&w=800&auto=format&fit=crop'
  );
}