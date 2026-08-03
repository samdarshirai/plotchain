import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { SetupService } from '../setup/setup.service';
import { postAuthLandingPath } from './post-auth-redirect';
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';

// The associate dashboard has no meaning for admin-family roles (they have no MLM rank --
// see NoRankAssignedException / DashboardService on the backend), so GET /api/associates/me/dashboard
// 400s for them. Login and rootRedirectGuard already steer admin-family roles away from here on
// sign-in, but neither stops a direct nav, deep link, or stale bookmark from reaching /dashboard.
// This guard closes that gap the same way, delegating to postAuthLandingPath so both stay in sync.
export const associateOnlyGuard: CanActivateFn = (): true | Observable<UrlTree> => {
  const authService = inject(AuthService);
  const setupService = inject(SetupService);
  const router = inject(Router);
  const role = authService.getRole() ?? '';
  if (!ADMIN_FAMILY_ROLES.has(role)) {
    return true;
  }
  return setupService.getState().pipe(
    map(state => router.parseUrl(postAuthLandingPath(role, state, () => setupService.firstIncompleteStepPath(state))))
  );
};
