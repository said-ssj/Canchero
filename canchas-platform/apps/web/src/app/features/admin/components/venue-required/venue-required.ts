import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AdminContext } from '../../admin-context.service';
import { DatabaseService } from '@core/supabase/database.service';

@Component({
  selector: 'app-admin-venue-required',
  standalone: true,
  imports: [RouterLink, MatButtonModule, MatIconModule],
  templateUrl: './venue-required.html',
  styleUrl: './venue-required.css',
})
export class AdminVenueRequired {
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly icon = input('domain_disabled');
  protected readonly context = inject(AdminContext);
  protected readonly db = inject(DatabaseService);
}
