import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  try {
    if (!await authService.validateSession()) return router.createUrlTree(['/login']);
  } catch {
    return router.createUrlTree(['/login']);
  }

  if (authService.isOwner()) {
    return true;
  }

  // Si no es dueño o no está autenticado, denegar acceso a Administración
  return authService.currentUser() ? router.createUrlTree(['/']) : router.createUrlTree(['/login']);
};
