import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { environment } from '@env/environment';

@Component({
  imports: [RouterLink],
  selector: 'app-footer',
  styleUrl: './footer.css',
  templateUrl: './footer.html',
})
export class Footer {
  protected readonly year = signal(new Date().getFullYear());
  protected readonly business = signal(environment.business);
}
