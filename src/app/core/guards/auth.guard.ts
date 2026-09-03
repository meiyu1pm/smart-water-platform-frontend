import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateChildFn, CanActivateFn, Router } from '@angular/router';

import { policyForRoute } from '../routing/route-access-policy';
import { AuthService } from '../services/auth.service';

const requireAuthentication = (route: ActivatedRouteSnapshot, state: { url: string }) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const policy = policyForRoute(route);
  if (policy.access === 'public') return true;
  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/quick-trial'], {
      queryParams: { login: '1', redirect: state.url },
    });
  }
  return !policy.permission || auth.hasPermission(policy.permission)
    ? true
    : router.createUrlTree(['/dashboard'], { queryParams: { forbidden: '1' } });
};

export const authGuard: CanActivateFn = requireAuthentication;
export const authChildGuard: CanActivateChildFn = requireAuthentication;
