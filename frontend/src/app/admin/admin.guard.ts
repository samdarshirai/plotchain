import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

// Only one admin-family role exists now (ADMIN). Kept as a Set (not a direct string ===
// comparison) so login.component.ts/post-auth-redirect.ts/associate-only.guard.ts, which all
// import and check against this same set, don't each need their own follow-up edit if a second
// admin-family role is ever reintroduced.
export const ADMIN_FAMILY_ROLES = new Set(['ADMIN']);

// UX convenience only, NOT a security boundary: this hides the admin route from a browser
// tab whose stored role isn't admin-family. The real enforcement is server-side --
// SecurityConfig's hasAnyAuthority(...) rule on every POST /api/**, already covered by
// SecurityConfigTest. A stale, missing, or forged client-side role can never grant access the
// backend would refuse.
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const role = authService.getRole();
  return role !== null && ADMIN_FAMILY_ROLES.has(role) ? true : router.parseUrl('/dashboard');
};
