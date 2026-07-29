import { routes } from './app.routes';
import { authGuard } from './auth/auth.guard';

describe('routes', () => {
  it('guards the dashboard route with authGuard', () => {
    const dashboardRoute = routes.find(route => route.path === 'dashboard');

    expect(dashboardRoute).toBeTruthy();
    expect(dashboardRoute!.canActivate).toContain(authGuard);
  });
});
