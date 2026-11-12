import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '@core/auth/auth.service';

export const profileCompletionGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService),
    router = inject(Router);
  // OAuth, recuperación y lectura de pases/pagos deben poder terminar su propio flujo.
  if (
    /^\/(perfil|login|registro|recuperar|auth|pago|accesos|terminos|privacidad|ayuda)(?:[/?#]|$)/.test(
      state.url,
    )
  )
    return true;
  await auth.ready;
  if (!auth.user()) return true;
  const identity = auth.user()!.id;
  if (auth.playerProfile()?.completo) return true;
  try {
    const profile = await firstValueFrom(auth.loadPlayerProfile(true));
    if (auth.user()?.id !== identity) return router.createUrlTree(['/login']);
    if (profile.completo) return true;
  } catch {
    /* El formulario permite reintentar; nunca asumir datos completos ante un fallo. */
  }
  return router.createUrlTree(['/perfil'], {
    queryParams: { acceso: 'inicio', regreso: state.url },
  });
};
