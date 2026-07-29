import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';
import { adminGuard } from './admin/admin.guard';

describe('routes', () => {
  it('guards the dashboard route with authGuard', () => {
    const dashboardRoute = routes.find(route => route.path === 'dashboard');

    expect(dashboardRoute).toBeTruthy();
    expect(dashboardRoute!.canActivate).toContain(authGuard);
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
});
