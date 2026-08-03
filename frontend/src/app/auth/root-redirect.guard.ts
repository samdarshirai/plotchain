import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { SetupService } from '../setup/setup.service';
import { postAuthLandingPath } from './post-auth-redirect';

// Always redirects -- this route never renders anything of its own (see the root route's
// `children: []` in app.routes.ts). It just resolves '/' to postAuthLandingPath's answer for the
// current role and (for admin-family roles) setup-launch state.
export const rootRedirectGuard: CanActivateFn = (): Observable<UrlTree> => {
  const authService = inject(AuthService);
  const setupService = inject(SetupService);
  const router = inject(Router);
  const role = authService.getRole() ?? '';
  return setupService.getState().pipe(
    map(state => router.parseUrl(postAuthLandingPath(role, state, setupService.firstIncompleteStepPath(state))))
  );
};
