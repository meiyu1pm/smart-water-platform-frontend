import { Route } from '@angular/router';

export type RouteAccess = 'public' | 'authenticated';

export interface PlatformRoutePolicy {
  access: RouteAccess;
  permission?: string;
  /** Public navigation is visible to all visitors. Protected items may opt into a guest lock. */
  guestNavigation?: 'locked' | 'hidden';
}

export const publicRoute = (): Pick<Route, 'data'> => ({ data: { access: 'public' } });

export const protectedRoute = (
  permission?: string,
  guestNavigation: 'locked' | 'hidden' = 'hidden',
): Pick<Route, 'data'> => ({ data: { access: 'authenticated', permission, guestNavigation } });

export function policyForRoute(route: Pick<Route, 'data'>): PlatformRoutePolicy {
  const data = route.data ?? {};
  return {
    access: data['access'] === 'public' ? 'public' : 'authenticated',
    permission: typeof data['permission'] === 'string' ? data['permission'] : undefined,
    guestNavigation: data['guestNavigation'] === 'locked' ? 'locked' : 'hidden',
  };
}
