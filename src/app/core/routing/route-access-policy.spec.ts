import { platformRoutePolicies, routeData } from './route-access-policy';

describe('platform route access policy', () => {
  it('uses the same registry for a public route and its locked guest navigation', () => {
    expect(routeData('quickTrial').data).toMatchObject({ access: 'public' });
    expect(platformRoutePolicies.workflows).toMatchObject({
      access: 'authenticated',
      permission: 'workflow:read',
      guestNavigation: 'locked',
    });
  });
});
