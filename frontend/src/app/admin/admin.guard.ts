import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';

// UX convenience only, NOT a security boundary: this hides the admin route from a browser
// tab whose stored role isn't ADMIN. The real enforcement is server-side — SecurityConfig's
// hasAuthority("ADMIN") rule on every POST /api/**, already covered by SecurityConfigTest. A
// stale, missing, or forged client-side role can never grant access the backend would refuse.
export const adminGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  return authService.getRole() === 'ADMIN' ? true : router.parseUrl('/dashboard');
};
