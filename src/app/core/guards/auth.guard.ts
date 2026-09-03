import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

const requireAuthentication = (_route: unknown, state: { url: string }) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (state.url.startsWith('/quick-trial')) return true;
  return auth.isAuthenticated()
    ? true
    : router.createUrlTree(['/quick-trial'], {
        queryParams: { login: '1', redirect: state.url },
      });
};

export const authGuard: CanActivateFn = requireAuthentication;
export const authChildGuard: CanActivateChildFn = requireAuthentication;
