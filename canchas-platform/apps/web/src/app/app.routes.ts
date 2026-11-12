import { Routes } from '@angular/router';
import { MainLayout } from './shared/components/main-layout/main-layout';
import { authGuard } from './core/guards/auth.guard';
import { profileCompletionGuard } from './core/guards/profile-completion.guard';

export const routes: Routes = [
  {
    path: '',
    component: MainLayout,
    canActivateChild: [profileCompletionGuard],
    children: [
      {
        path: 'mensajes',
        loadComponent: () => import('./features/jugador/mensajes/mensajes').then((m) => m.Mensajes),
      },
      { path: '', loadComponent: () => import('./features/jugador/home/home').then((m) => m.Home) },
      {
        path: 'buscar',
        loadComponent: () => import('./features/jugador/buscar/buscar').then((m) => m.Buscar),
      },
      {
        path: 'sedes',
        loadComponent: () => import('./features/jugador/sedes/sedes').then((m) => m.Sedes),
      },
      {
        path: 'sedes/:id',
        loadComponent: () => import('./features/jugador/detalle/detalle').then((m) => m.Detalle),
      },
      {
        path: 'accesos',
        loadComponent: () =>
          import('./features/admin/reservas/access-check').then((m) => m.AccessCheck),
      },
      {
        path: 'pago/resultado',
        loadComponent: () =>
          import('./features/jugador/checkout/payment-result').then((m) => m.PaymentResult),
      },
      {
        path: 'checkout',
        loadComponent: () => import('./features/jugador/checkout/checkout').then((m) => m.Checkout),
      },
      {
        path: 'historial-pagos',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./features/jugador/historial-pagos/historial-pagos').then(
            (m) => m.PaymentHistory,
          ),
      },
      {
        path: 'itinerario',
        loadComponent: () =>
          import('./features/jugador/itinerario/itinerario').then((m) => m.Itinerario),
      },
      {
        path: 'login',
        loadComponent: () => import('./features/jugador/auth/login/login').then((m) => m.Login),
      },
      {
        path: 'recuperar',
        loadComponent: () =>
          import('./features/jugador/auth/recuperar/recuperar').then((m) => m.Recuperar),
      },
      {
        path: 'auth/google/callback',
        loadComponent: () =>
          import('./features/jugador/auth/google-callback').then((m) => m.GoogleCallback),
      },
      {
        path: 'perfil',
        loadComponent: () =>
          import('./features/jugador/auth/player-profile').then((m) => m.PlayerProfilePage),
      },
      {
        path: 'perfiles/:id',
        loadComponent: () =>
          import('./features/jugador/auth/community-profile').then((m) => m.CommunityProfilePage),
      },
      {
        path: 'registro',
        loadComponent: () =>
          import('./features/jugador/auth/registro/registro').then((m) => m.Registro),
      },
      {
        path: 'cuenta',
        loadComponent: () =>
          import('./features/jugador/cuenta/cuenta').then((m) => m.AccountSettingsPage),
      },
      {
        path: 'ayuda',
        loadComponent: () => import('./features/jugador/ayuda/ayuda').then((m) => m.HelpCenterPage),
      },
      {
        path: 'terminos',
        loadComponent: () => import('./features/jugador/legal/terminos').then((m) => m.TermsPage),
      },
      {
        path: 'privacidad',
        loadComponent: () =>
          import('./features/jugador/legal/privacidad').then((m) => m.PrivacyPage),
      },
    ],
  },
  {
    path: 'admin',
    loadComponent: () => import('./features/admin/layout/admin-layout').then((m) => m.AdminLayout),
    canActivate: [authGuard, profileCompletionGuard],
    canActivateChild: [authGuard, profileCompletionGuard],
    children: [
      { path: '', redirectTo: 'sedes', pathMatch: 'full' },
      {
        path: 'moderacion',
        loadComponent: () =>
          import('./features/admin/moderacion/moderacion').then((m) => m.Moderacion),
      },
      {
        path: 'accesos',
        loadComponent: () =>
          import('./features/admin/reservas/access-check').then((m) => m.AccessCheck),
      },
      {
        path: 'sedes',
        loadComponent: () => import('./features/admin/sedes/admin-sedes').then((m) => m.AdminSedes),
      },
      {
        path: 'canchas',
        loadComponent: () =>
          import('./features/admin/canchas/admin-canchas').then((m) => m.AdminCanchas),
      },
      {
        path: 'reservas',
        loadComponent: () =>
          import('./features/admin/reservas/admin-reservas').then((m) => m.AdminReservas),
      },
      {
        path: 'caja',
        loadComponent: () => import('./features/admin/caja/admin-caja').then((m) => m.AdminCaja),
      },
      {
        path: 'pos',
        loadComponent: () => import('./features/admin/pos/admin-pos').then((m) => m.AdminPos),
      },
      {
        path: 'catalogo',
        loadComponent: () =>
          import('./features/admin/catalogo/admin-catalogo').then((m) => m.AdminCatalogo),
      },
      {
        path: 'inventario',
        loadComponent: () =>
          import('./features/admin/inventario/admin-inventario').then((m) => m.AdminInventario),
      },
      {
        path: 'compras',
        loadComponent: () =>
          import('./features/admin/compras/admin-compras').then((m) => m.AdminCompras),
      },
      {
        path: 'creditos',
        loadComponent: () =>
          import('./features/admin/creditos/admin-creditos').then((m) => m.AdminCreditos),
      },
      {
        path: 'finanzas',
        loadComponent: () =>
          import('./features/admin/finanzas/admin-finanzas').then((m) => m.AdminFinanzas),
      },
      {
        path: 'personalizacion',
        loadComponent: () =>
          import('./features/admin/personalizacion/admin-personalizacion').then(
            (m) => m.AdminPersonalizacion,
          ),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./features/admin/configuracion/admin-configuracion').then(
            (m) => m.AdminConfiguracion,
          ),
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./features/admin/reportes/admin-reportes').then((m) => m.AdminReportes),
      },
      {
        path: 'personal',
        loadComponent: () =>
          import('./features/admin/personal/admin-personal').then((m) => m.AdminPersonal),
      },
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./features/admin/usuarios/admin-usuarios').then((m) => m.AdminUsuarios),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
