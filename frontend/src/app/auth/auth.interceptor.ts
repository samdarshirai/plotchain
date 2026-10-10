import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { apiUrl } from '../core/api/api-url';

// Endpoint+method pairs where a 401 is an expected, in-form validation failure (bad
// credentials, or -- profile screen redesign -- a missing/incorrect transaction password)
// rather than an expired session. A blanket logout here would wipe a valid session and
// navigate the user away before they can see the error. Keyed by method, not just path: GET
// /api/associates/me/profile (for example) still logs out on a real 401, since a plain read
// never fails a form check -- only its PUT (transaction-password-gated) and the analogous
// nominee PUT and transaction-password POST do.
const EXPECTED_401_ROUTES: { method: string; path: string | RegExp }[] = [
  { method: 'POST', path: '/api/auth/login' },
  { method: 'POST', path: '/api/associates/me/password' },
  { method: 'PUT', path: '/api/associates/me/profile' },
  { method: 'PUT', path: '/api/associates/me/nominee' },
  { method: 'POST', path: '/api/associates/me/transaction-password' },
  { method: 'POST', path: /\/api\/associates\/me\/epins\/[^/]+\/(redeem|transfer)$/ }
];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  const absoluteReq = req.clone({ url: apiUrl(req.url) });
  const authorizedReq = token
    ? absoluteReq.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : absoluteReq;

  return next(authorizedReq).pipe(
    catchError(error => {
      const isExpected401Route = EXPECTED_401_ROUTES.some(
        route => route.method === req.method &&
          (typeof route.path === 'string' ? req.url.includes(route.path) : route.path.test(req.url))
      );
      if (error.status === 401 && !isExpected401Route) {
        authService.logout();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
