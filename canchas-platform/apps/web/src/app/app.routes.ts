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
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/layout/admin-layout').then(m => m.AdminLayout),
    canActivate: [authGuard],
    canActivateChild: [authGuard],
    children: [
      { path: '', redirectTo: 'sedes', pathMatch: 'full' },
      { path: 'sedes', loadComponent: () => import('./features/admin/sedes/admin-sedes').then(m => m.AdminSedes) },
      { path: 'canchas', loadComponent: () => import('./features/admin/canchas/admin-canchas').then(m => m.AdminCanchas) },
      { path: 'reservas', loadComponent: () => import('./features/admin/reservas/admin-reservas').then(m => m.AdminReservas) },
      { path: 'caja', loadComponent: () => import('./features/admin/caja/admin-caja').then(m => m.AdminCaja) },
      { path: 'pos', loadComponent: () => import('./features/admin/pos/admin-pos').then(m => m.AdminPos) },
      { path: 'finanzas', loadComponent: () => import('./features/admin/finanzas/admin-finanzas').then(m => m.AdminFinanzas) },
      { path: 'personalizacion', loadComponent: () => import('./features/admin/personalizacion/admin-personalizacion').then(m => m.AdminPersonalizacion) },
      { path: 'configuracion', loadComponent: () => import('./features/admin/configuracion/admin-configuracion').then(m => m.AdminConfiguracion) },
    ],
  },
  { path: '**', redirectTo: '' },
];
