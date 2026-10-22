import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';

export interface AdminSedeCardData {
  nombre: string;
  imagen_url?: string | null;
  logo_url?: string | null;
  descripcion?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  telefono?: string | null;
}

@Component({
  selector: 'app-admin-sede-card',
  standalone: true,
  imports: [MatButtonModule, MatCardModule, MatChipsModule, MatIconModule, MatTooltipModule],
  templateUrl: './sede-card.html',
  styleUrl: './sede-card.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AdminSedeCard {
  readonly sede = input.required<AdminSedeCardData>();
  readonly viewCourts = output<void>();
  readonly edit = output<void>();
  readonly hours = output<void>();

  protected readonly fallbackVenueImg = 'https://images.unsplash.com/photo-1529900241929-58a47400d705?q=80&w=800&auto=format&fit=crop';

  protected onImgError(event: Event): void {
    const el = event.target as HTMLImageElement;
    if (el && el.src !== this.fallbackVenueImg) {
      el.src = this.fallbackVenueImg;
    }
  }
}
