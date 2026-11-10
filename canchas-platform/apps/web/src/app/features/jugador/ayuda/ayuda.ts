import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '@core/auth/auth.service';
import { DatabaseService } from '@core/supabase/database.service';
import { FAQ_ITEMS, FaqItem, getSupportAvailability, buildSupportWhatsAppUrl } from './help-data';

@Component({
  selector: 'app-help-center',
  imports: [
    FormsModule,
    RouterLink,
    MatExpansionModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatTooltipModule,
  ],
  templateUrl: './ayuda.html',
  styleUrl: './ayuda.css',
})
export class HelpCenterPage {
  private readonly auth = inject(AuthService);
  private readonly db = inject(DatabaseService);

  protected searchQuery = '';
  protected readonly isOwner = computed(() => this.auth.isOwner());
  protected readonly availability = signal(getSupportAvailability());

  /**
   * Código de la reserva más reciente del usuario para prellenar en el mensaje de WhatsApp.
   */
  protected readonly recentBookingCode = signal<string | undefined>(undefined);

  constructor() {
    // Si el usuario está autenticado, intentar leer su última reserva para enriquecer el enlace de ayuda
    if (this.auth.isLoggedIn()) {
      this.db
        .fetchMyBookings()
        .then(
          (
            bookings: Array<{
              codigoPase?: string;
              id?: string | number;
              status?: string;
            }>,
          ) => {
            if (bookings && bookings.length > 0) {
              const active = bookings.find((b) => b.status === 'CONFIRMADO') || bookings[0];
              this.recentBookingCode.set(active.codigoPase || String(active.id));
            }
          },
        )
        .catch(() => undefined);
    }
  }

  protected readonly whatsAppUrl = computed(() =>
    buildSupportWhatsAppUrl(this.recentBookingCode()),
  );

  protected readonly filteredFaqs = computed<FaqItem[]>(() => {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return FAQ_ITEMS;

    return FAQ_ITEMS.filter(
      (item) =>
        item.question.toLowerCase().includes(q) ||
        item.answer.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  });
}
export { HelpCenterPage as Ayuda };
