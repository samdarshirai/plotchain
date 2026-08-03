import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';
import { associateOnlyGuard } from './auth/associate-only.guard';
import { rootRedirectGuard } from './auth/root-redirect.guard';
import { adminGuard } from './admin/admin.guard';
import { setupModeGuard, launchedModeGuard } from './setup/setup.guard';

describe('routes', () => {
  it('guards the dashboard route with authGuard and associateOnlyGuard', () => {
    const dashboardRoute = routes.find(route => route.path === 'dashboard');

    expect(dashboardRoute).toBeTruthy();
    expect(dashboardRoute!.canActivate).toContain(authGuard);
    expect(dashboardRoute!.canActivate).toContain(associateOnlyGuard);
  });

  it('exposes a change-password route behind the auth guard', () => {
    const route = routes.find(r => r.path === 'change-password');
    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
  });

  it('guards the admin create-associate route with both authGuard and adminGuard', () => {
    const route = routes.find(r => r.path === 'admin/associates/new');
    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(adminGuard);
  });

  describe('setup route', () => {
    const setupRoute = routes.find(r => r.path === 'setup');

    it('is guarded by authGuard, adminGuard and setupModeGuard', () => {
      expect(setupRoute).toBeTruthy();
      expect(setupRoute!.canActivate).toContain(authGuard);
      expect(setupRoute!.canActivate).toContain(adminGuard);
      expect(setupRoute!.canActivate).toContain(setupModeGuard);
    });

    it('has all 8 wizard-step children plus the default redirect', () => {
      const childPaths = setupRoute!.children!.map(c => c.path);
      expect(childPaths).toEqual([
        'company-profile',
        'branding',
        'compensation',
        'projects',
        'payments-kyc',
        'admin-team',
        'root-associates',
        'review-launch',
        ''
      ]);
    });

    it('redirects the empty child path to company-profile', () => {
      const emptyChild = setupRoute!.children!.find(c => c.path === '');
      expect(emptyChild!.redirectTo).toBe('company-profile');
    });

    it('stamps each step child with its stepKey via route data', () => {
      const brandingChild = setupRoute!.children!.find(c => c.path === 'branding');
      expect(brandingChild!.data).toEqual({ stepKey: 'branding' });
    });
  });

  describe('settings route', () => {
    it('is guarded by authGuard, adminGuard and launchedModeGuard', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      expect(settingsRoute).toBeTruthy();
      expect(settingsRoute!.canActivate).toContain(authGuard);
      expect(settingsRoute!.canActivate).toContain(adminGuard);
      expect(settingsRoute!.canActivate).toContain(launchedModeGuard);
    });
  });

  describe('root route', () => {
    it('redirects via authGuard and rootRedirectGuard, rendering nothing itself', () => {
      const rootRoute = routes.find(r => r.path === '');
      expect(rootRoute).toBeTruthy();
      expect(rootRoute!.canActivate).toEqual([authGuard, rootRedirectGuard]);
      expect(rootRoute!.children).toEqual([]);
    });
  });
});
