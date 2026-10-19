import { Component, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { Navbar } from '../navbar/navbar';
import { Footer } from '../footer/footer';

@Component({
  imports: [RouterOutlet, Navbar, Footer],
  selector: 'app-main-layout',
  styleUrl: './main-layout.css',
  templateUrl: './main-layout.html',
})
export class MainLayout {
  private readonly router = inject(Router);

  protected readonly isLoginPage = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects.startsWith('/login') || e.url.startsWith('/login'))
    ),
    { initialValue: this.router.url.startsWith('/login') }
  );
}