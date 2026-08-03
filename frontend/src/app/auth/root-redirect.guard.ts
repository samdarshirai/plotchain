import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { SetupService } from '../setup/setup.service';
import { postAuthLandingPath } from './post-auth-redirect';
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';

// Always redirects -- this route never renders anything of its own (see the root route's
// `children: []` in app.routes.ts). It just resolves '/' to postAuthLandingPath's answer for the
// current role and (for admin-family roles) setup-launch state.
//
// GET /api/company/setup-state is admin-family-only server-side (SecurityConfig), and
// authInterceptor only recovers from 401s, not 403s -- so a non-admin-family role must never
// call setupService.getState() here. Mirrors the same short-circuit login.component.ts already
// uses for its post-login routing.
export const rootRedirectGuard: CanActivateFn = (): Observable<UrlTree> | UrlTree => {
  const authService = inject(AuthService);
  const setupService = inject(SetupService);
  const router = inject(Router);
  const role = authService.getRole() ?? '';
  if (!ADMIN_FAMILY_ROLES.has(role)) {
    return router.parseUrl('/dashboard');
  }
  return setupService.getState().pipe(
    map(state => router.parseUrl(postAuthLandingPath(role, state, setupService.firstIncompleteStepPath(state))))
  );
};
