import { inject } from '@angular/core';
import { HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

// Endpoints where a 401 is an expected, in-form validation failure (bad credentials)
// rather than an expired session. A blanket logout here would wipe a valid session and
// navigate the user away before they can see the error.
const EXPECTED_401_PATHS = ['/api/auth/login', '/api/associates/me/password'];

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  const authorizedReq = token
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
    : req;

  return next(authorizedReq).pipe(
    catchError(error => {
      if (error.status === 401 && !EXPECTED_401_PATHS.some(path => req.url.includes(path))) {
        authService.logout();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
