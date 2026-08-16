import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { SetupService } from '../setup/setup.service';
import { postAuthLandingPath } from './post-auth-redirect';
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';

// Redirects an already-authenticated user away from /login instead of letting the login form
// render underneath the authenticated header -- app.component.html shows the header via
// `*ngIf="authService.isAuthenticated() && !isChromelessRoute"`, and /login isn't a chromeless
// route, so without this guard an authenticated visit to /login stacks both.
//
// Unlike rootRedirectGuard ('/'), /login has no authGuard in its canActivate array -- it must
// stay reachable for unauthenticated visitors, since that's the only way to log in -- so this
// guard does its own isAuthenticated() check before falling through to the same
// role/setup-state redirect logic rootRedirectGuard and login.component.ts's post-login routing
// already use.
export const loginRedirectGuard: CanActivateFn = (): Observable<UrlTree> | UrlTree | true => {
  const authService = inject(AuthService);
  const setupService = inject(SetupService);
  const router = inject(Router);
  if (!authService.isAuthenticated()) {
    return true;
  }
  const role = authService.getRole() ?? '';
  if (!ADMIN_FAMILY_ROLES.has(role)) {
    return router.parseUrl('/dashboard');
  }
  return setupService.getState().pipe(
    map(state => router.parseUrl(postAuthLandingPath(role, state, () => setupService.firstIncompleteStepPath(state))))
  );
};
