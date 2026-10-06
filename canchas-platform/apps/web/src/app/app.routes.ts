import { Routes } from '@angular/router';
import { MainLayout } from './shared/components/main-layout/main-layout';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: MainLayout,
    children: [
      { path: '', loadComponent: () => import('./features/jugador/home/home').then(m => m.Home) },
      { path: 'sedes', loadComponent: () => import('./features/jugador/sedes/sedes').then(m => m.Sedes) },
      { path: 'sedes/:id', loadComponent: () => import('./features/jugador/detalle/detalle').then(m => m.Detalle) },
      { path: 'checkout', loadComponent: () => import('./features/jugador/checkout/checkout').then(m => m.Checkout) },
      { path: 'itinerario', loadComponent: () => import('./features/jugador/itinerario/itinerario').then(m => m.Itinerario) },
      { path: 'login', loadComponent: () => import('./features/jugador/auth/login/login').then(m => m.Login) },
      { path: 'registro', loadComponent: () => import('./features/jugador/auth/registro/registro').then(m => m.Registro) },
    ],
  },
  { path: 'admin', loadComponent: () => import('./features/admin/admin').then(m => m.Admin), canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];