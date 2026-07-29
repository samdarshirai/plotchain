import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { LoginRequest } from './models/login-request.model';
import { LoginResponse } from './models/login-response.model';

const TOKEN_KEY = 'plotchain.auth.token';
const MUST_CHANGE_KEY = 'plotchain.auth.mustChangePassword';
const ROLE_KEY = 'plotchain.auth.role';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient) {}

  login(email: string, password: string): Observable<LoginResponse> {
    const request: LoginRequest = { email, password };
    return this.http.post<LoginResponse>('/api/auth/login', request).pipe(
      tap(response => {
        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(MUST_CHANGE_KEY, String(response.mustChangePassword));
        localStorage.setItem(ROLE_KEY, response.role);
      })
    );
  }

  logout(): void {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(MUST_CHANGE_KEY);
    localStorage.removeItem(ROLE_KEY);
  }

  getToken(): string | null {
    return localStorage.getItem(TOKEN_KEY);
  }

  getRole(): string | null {
    return localStorage.getItem(ROLE_KEY);
  }

  isAuthenticated(): boolean {
    const payload = this.decodePayload(this.getToken());
    if (!payload || typeof payload['exp'] !== 'number') {
      return false;
    }
    return payload['exp'] * 1000 > Date.now();
  }

  mustChangePassword(): boolean {
    return localStorage.getItem(MUST_CHANGE_KEY) === 'true';
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>('/api/associates/me/password', { currentPassword, newPassword }).pipe(
      tap(() => localStorage.setItem(MUST_CHANGE_KEY, 'false'))
    );
  }

  // Reads the JWT payload for client-side routing decisions only. The signature is NOT
  // verified here and cannot be — the backend is the only authority on token validity. This
  // exists so an expired token routes to /login without a round-trip, not as a security check.
  private decodePayload(token: string | null): Record<string, unknown> | null {
    if (!token) {
      return null;
    }
    const segments = token.split('.');
    if (segments.length !== 3) {
      return null;
    }
    try {
      const base64 = segments[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(base64)) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
