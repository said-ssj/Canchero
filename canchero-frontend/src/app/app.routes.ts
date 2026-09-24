import { Routes } from '@angular/router';
import { MainLayout } from './main-layout/main-layout';
import { Home } from './pages/home/home';
import { Sedes } from './pages/sedes/sedes';
import { Detalle } from './pages/detalle/detalle';
import { Checkout } from './pages/checkout/checkout';
import { Itinerario } from './pages/itinerario/itinerario';
import { Login } from './pages/login/login';
import { Registro } from './pages/registro/registro';
import { Admin } from './pages/admin/admin';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    component: MainLayout,
    children: [
      { path: '', component: Home },
      { path: 'sedes', component: Sedes },
      { path: 'sedes/:id', component: Detalle },
      { path: 'checkout', component: Checkout },
      { path: 'itinerario', component: Itinerario },
      { path: 'login', component: Login },
      { path: 'registro', component: Registro },
    ],
  },
  { path: 'admin', component: Admin, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];