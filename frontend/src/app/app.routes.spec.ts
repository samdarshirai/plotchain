import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';
import { associateOnlyGuard } from './auth/associate-only.guard';
import { rootRedirectGuard } from './auth/root-redirect.guard';
import { adminGuard } from './admin/admin.guard';
import { setupModeGuard, launchedModeGuard } from './setup/setup.guard';
import { ADMIN_NAV_CATEGORIES, ADMIN_USERS_NAV_ITEM } from './admin-nav-categories.model';

describe('routes', () => {
  it('guards the dashboard route with authGuard and associateOnlyGuard', () => {
    const dashboardRoute = routes.find(route => route.path === 'dashboard');

    expect(dashboardRoute).toBeTruthy();
    expect(dashboardRoute!.canActivate).toContain(authGuard);
    expect(dashboardRoute!.canActivate).toContain(associateOnlyGuard);
  });

  it('guards the my-sales route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'plot-bookings/my-sales');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });

  it('guards the my-bookings route with authGuard and associateOnlyGuard, lazily', () => {
    const route = routes.find(r => r.path === 'plot-bookings/mine');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
    expect(route!.loadComponent).toBeDefined();
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
    expect(route!.loadComponent).toBeDefined(); // lazy: keeps the initial bundle under budget
  });

  it('redirects the legacy support-tickets route to messages', () => {
    expect(routes.find(r => r.path === 'support-tickets')!.redirectTo).toBe('messages');
  });

  it('guards the messages/new route with authGuard and associateOnlyGuard and lazy-loads it', () => {
    const route = routes.find(r => r.path === 'messages/new');
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
    expect(route!.loadComponent).toBeDefined();
  });

  it('guards the messages route with authGuard and associateOnlyGuard and lazy-loads it', () => {
    const route = routes.find(r => r.path === 'messages');
    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
    expect(route!.loadComponent).toBeDefined();
    expect(route!.component).toBeUndefined();
  });

  it('guards the profile route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'profile');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });

  it('redirects the old rewards route to profile (merged into My Account)', () => {
    const route = routes.find(r => r.path === 'rewards');

    expect(route).toBeTruthy();
    expect(route!.redirectTo).toBe('profile');
  });

  it('redirects the old digital-id-card route to profile (merged into My Account)', () => {
    const route = routes.find(r => r.path === 'digital-id-card');

    expect(route).toBeTruthy();
    expect(route!.redirectTo).toBe('profile');
  });

  it('guards every income-statement route with authGuard and associateOnlyGuard and tags its incomeType', () => {
    const paths = ['', '/direct', '/matching', '/sponsor-matching', '/royalty', '/reward', '/perk'].map(s => 'income-statement' + s);
    for (const path of paths) {
      const route = routes.find(r => r.path === path);
      expect(route).withContext(path).toBeTruthy();
      expect(route!.canActivate).toContain(authGuard);
      expect(route!.canActivate).toContain(associateOnlyGuard);
      expect(route!.data?.['incomeType']).withContext(path).toBeTruthy();
    }
  });

  it('guards the report routes with authGuard and associateOnlyGuard', () => {
    for (const path of ['reports/my-business', 'reports/emi']) {
      const route = routes.find(r => r.path === path);
      expect(route).withContext(path).toBeTruthy();
      expect(route!.canActivate).toContain(authGuard);
      expect(route!.canActivate).toContain(associateOnlyGuard);
    }
  });

  it('guards the payout-history route with authGuard and associateOnlyGuard', () => {
    const route = routes.find(r => r.path === 'payout-history');

    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
    expect(route!.canActivate).toContain(associateOnlyGuard);
  });

  it('exposes a change-password route behind the auth guard', () => {
    const route = routes.find(r => r.path === 'change-password');
    expect(route).toBeTruthy();
    expect(route!.canActivate).toContain(authGuard);
  });

  describe('setup route', () => {
    const setupRoute = routes.find(r => r.path === 'admin/setup');

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
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      expect(settingsRoute).toBeTruthy();
      expect(settingsRoute!.canActivate).toContain(authGuard);
      expect(settingsRoute!.canActivate).toContain(adminGuard);
      expect(settingsRoute!.canActivate).toContain(launchedModeGuard);
    });

    it('redirects bare /settings to Setup\'s first item, with no hub screen left', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const emptyChild = settingsRoute!.children!.find(c => c.path === '');
      expect(emptyChild).toBeTruthy();
      expect(emptyChild!.component).toBeUndefined();
      expect(emptyChild!.redirectTo).toBe('company-profile');
      expect(emptyChild!.redirectTo).toBe(ADMIN_NAV_CATEGORIES.find(c => c.key === 'setup')!.items[0].path.replace('/admin/settings/', ''));
    });

    it('has a child route behind every nav item in every category', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const childPaths = settingsRoute!.children!.map(c => c.path);

      const items = [ADMIN_USERS_NAV_ITEM, ...ADMIN_NAV_CATEGORIES.flatMap(c => c.items)];
      for (const item of items) {
        expect(childPaths).toContain(item.path.replace('/admin/settings/', ''));
      }
    });

    it('has a sales-register child stamped with sectionKey salesRegister', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const salesRegisterChild = settingsRoute!.children!.find(c => c.path === 'sales-register');
      expect(salesRegisterChild).toBeTruthy();
      expect(salesRegisterChild!.data).toEqual({ sectionKey: 'salesRegister' });
    });

    it('has a cycle-management child stamped with sectionKey cycleManagement', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const cycleManagementChild = settingsRoute!.children!.find(c => c.path === 'cycle-management');
      expect(cycleManagementChild).toBeTruthy();
      expect(cycleManagementChild!.data).toEqual({ sectionKey: 'cycleManagement' });
    });

    it('has a ledger-register child stamped with sectionKey ledgerRegister', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const ledgerRegisterChild = settingsRoute!.children!.find(c => c.path === 'ledger-register');
      expect(ledgerRegisterChild).toBeTruthy();
      expect(ledgerRegisterChild!.data).toEqual({ sectionKey: 'ledgerRegister' });
    });

    it('has a payout-approval child stamped with sectionKey payoutApproval', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const payoutApprovalChild = settingsRoute!.children!.find(c => c.path === 'payout-approval');
      expect(payoutApprovalChild).toBeTruthy();
      expect(payoutApprovalChild!.data).toEqual({ sectionKey: 'payoutApproval' });
    });

    it('has a plots child stamped with sectionKey projectsPlots', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const child = settingsRoute!.children!.find(c => c.path === 'plots');
      expect(child).toBeTruthy();
      expect(child!.data).toEqual({ sectionKey: 'projectsPlots' });
    });

    it('has a lazy support-tickets child stamped with sectionKey supportTickets', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const child = settingsRoute!.children!.find(c => c.path === 'support-tickets');
      expect(child).toBeDefined();
      expect(child!.component).toBeUndefined();
      expect(child!.loadComponent).toBeDefined();
      expect(child!.data).toEqual({ sectionKey: 'supportTickets' });
    });

    it('has a lazy expense-types child stamped with sectionKey expenseTypes', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const child = settingsRoute!.children!.find(c => c.path === 'expense-types');
      expect(child).toBeDefined();
      expect(child!.loadComponent).toBeDefined();
      expect(child!.data).toEqual({ sectionKey: 'expenseTypes' });
    });

    it('has a lazy payment-details child stamped with sectionKey paymentDetails', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const child = settingsRoute!.children!.find(c => c.path === 'payment-details');
      expect(child).toBeDefined();
      expect(child!.loadComponent).toBeDefined();
      expect(child!.data).toEqual({ sectionKey: 'paymentDetails' });
    });

    it('has a lazy invoice-expenses child stamped with sectionKey invoiceExpenses', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const child = settingsRoute!.children!.find(c => c.path === 'invoice-expenses');
      expect(child).toBeDefined();
      expect(child!.loadComponent).toBeDefined();
      expect(child!.data).toEqual({ sectionKey: 'invoiceExpenses' });
    });

    it('has a lazy advance-loans child stamped with sectionKey advanceLoans', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const child = settingsRoute!.children!.find(c => c.path === 'advance-loans');
      expect(child).toBeDefined();
      expect(child!.loadComponent).toBeDefined();
      expect(child!.data).toEqual({ sectionKey: 'advanceLoans' });
    });

    it('has a lazy payment-details/receipt/:id child stamped with sectionKey paymentDetails', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const child = settingsRoute!.children!.find(c => c.path === 'payment-details/receipt/:id');
      expect(child).toBeDefined();
      expect(child!.loadComponent).toBeDefined();
      expect(child!.data).toEqual({ sectionKey: 'paymentDetails' });
    });

    it('has a lazy news child stamped with sectionKey news', () => {
      const settingsRoute = routes.find(r => r.path === 'admin/settings');
      const child = settingsRoute!.children!.find(c => c.path === 'news');
      expect(child).toBeDefined();
      expect(child!.loadComponent).toBeDefined();
      expect(child!.data).toEqual({ sectionKey: 'news' });
    });
  });

  describe('root route', () => {
    it('redirects via rootRedirectGuard, rendering nothing itself', () => {
      const rootRoute = routes.find(r => r.path === '');
      expect(rootRoute).toBeTruthy();
      expect(rootRoute!.canActivate).toEqual([rootRedirectGuard]);
      expect(rootRoute!.children).toEqual([]);
    });
  });
});
