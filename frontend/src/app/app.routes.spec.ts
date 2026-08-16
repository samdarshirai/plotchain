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

  it('guards the sales-history route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'sales-history');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });

  it('guards the my-tree route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'my-tree');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });

  it('guards the plot-bookings route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'plot-bookings');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });

  it('guards the profile route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'profile');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });

  it('guards the rewards route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'rewards');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });

  it('guards the digital-id-card route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'digital-id-card');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });

  it('guards the income-statement route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'income-statement');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
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

  it('guards the admin record-sale route with both authGuard and adminGuard', () => {
    const route = routes.find(r => r.path === 'admin/sales/new');
    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(adminGuard);
  });

  it('guards the admin submit-withdrawal route with both authGuard and adminGuard', () => {
    const route = routes.find(r => r.path === 'admin/withdrawals/new');
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

    it('has all 6 wizard-step children plus the default redirect', () => {
      const childPaths = setupRoute!.children!.map(c => c.path);
      expect(childPaths).toEqual([
        'company-profile',
        'branding',
        'compensation',
        'projects',
        'payments-kyc',
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

    it('has a sales-register child stamped with sectionKey salesRegister', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const salesRegisterChild = settingsRoute!.children!.find(c => c.path === 'sales-register');
      expect(salesRegisterChild).toBeTruthy();
      expect(salesRegisterChild!.data).toEqual({ sectionKey: 'salesRegister' });
    });

    it('has a cycle-management child stamped with sectionKey cycleManagement', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const cycleManagementChild = settingsRoute!.children!.find(c => c.path === 'cycle-management');
      expect(cycleManagementChild).toBeTruthy();
      expect(cycleManagementChild!.data).toEqual({ sectionKey: 'cycleManagement' });
    });

    it('has a ledger-register child stamped with sectionKey ledgerRegister', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const ledgerRegisterChild = settingsRoute!.children!.find(c => c.path === 'ledger-register');
      expect(ledgerRegisterChild).toBeTruthy();
      expect(ledgerRegisterChild!.data).toEqual({ sectionKey: 'ledgerRegister' });
    });

    it('has a payout-approval child stamped with sectionKey payoutApproval', () => {
      const settingsRoute = routes.find(r => r.path === 'settings');
      const payoutApprovalChild = settingsRoute!.children!.find(c => c.path === 'payout-approval');
      expect(payoutApprovalChild).toBeTruthy();
      expect(payoutApprovalChild!.data).toEqual({ sectionKey: 'payoutApproval' });
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
