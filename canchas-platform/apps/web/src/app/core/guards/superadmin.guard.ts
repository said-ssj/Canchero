import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '@core/auth/auth.service';

export const superadminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  try {
    if (!(await auth.validateSession())) return router.createUrlTree(['/login']);
  } catch {
    return router.createUrlTree(['/login']);
  }

  return auth.isSuperAdmin() ? true : router.createUrlTree(['/']);
};
