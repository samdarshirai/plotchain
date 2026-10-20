import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { SetupService } from '../setup/setup.service';
import { postAuthLandingPath } from './post-auth-redirect';

// Always redirects -- this route never renders anything of its own (see the root route's
// `children: []` in app.routes.ts). '/' belongs to the associate app: a live associate session
// goes to /dashboard, otherwise a live admin session goes to its landing page, otherwise /login.
//
// GET /api/company/setup-state is admin-only server-side, so setupService.getState() is only
// called once an admin session is confirmed. Guards in a canActivate array run concurrently, so
// this guard also runs when authGuard is rejecting the visit; the checks below keep that safe.
export const rootRedirectGuard: CanActivateFn = (): Observable<UrlTree> | UrlTree => {
  const authService = inject(AuthService);
  const setupService = inject(SetupService);
  const router = inject(Router);
  if (authService.isAuthenticated('associate') || !authService.isAuthenticated('admin')) {
    return router.parseUrl('/dashboard');
  }
  const role = authService.getRole('admin') ?? '';
  return setupService.getState().pipe(
    map(state => router.parseUrl(postAuthLandingPath(role, state, () => setupService.firstIncompleteStepPath(state))))
  );
};
