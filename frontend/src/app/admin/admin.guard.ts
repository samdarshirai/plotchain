import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

// Mirrors AssociateRole.isAdminFamily() on the backend: every role except ASSOCIATE may
// reach admin routes. Kept as a literal set (not imported) since the frontend has no shared
// enum with the backend; SecurityConfigTest is the source of truth this must stay in sync with.
// Exported so login.component.ts can reuse it for post-login routing instead of duplicating it.
export const ADMIN_FAMILY_ROLES = new Set(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPPORT']);

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
