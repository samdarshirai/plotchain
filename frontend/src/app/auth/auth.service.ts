import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, tap } from 'rxjs';
import { LoginRequest } from './models/login-request.model';
import { LoginResponse } from './models/login-response.model';

const TOKEN_KEY = 'plotchain.auth.token';
const MUST_CHANGE_KEY = 'plotchain.auth.mustChangePassword';
const ROLE_KEY = 'plotchain.auth.role';
const ADMIN_TOKEN_KEY = 'plotchain.auth.admin.token';
const ADMIN_ROLE_KEY = 'plotchain.auth.admin.role';
const ADMIN_MUST_CHANGE_KEY = 'plotchain.auth.admin.mustChange';
const IMPERSONATING_KEY = 'plotchain.auth.impersonating';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient) {}

  login(userId: string, password: string): Observable<LoginResponse> {
    const request: LoginRequest = { userId, password };
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
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_ROLE_KEY);
    localStorage.removeItem(ADMIN_MUST_CHANGE_KEY);
    localStorage.removeItem(IMPERSONATING_KEY);
  }

  impersonate(associateId: string, displayName: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`/api/admin/associates/${associateId}/impersonate`, {}).pipe(
      tap(response => {
        if (!this.isImpersonating()) {
          this.stash(ADMIN_TOKEN_KEY, TOKEN_KEY);
          this.stash(ADMIN_ROLE_KEY, ROLE_KEY);
          this.stash(ADMIN_MUST_CHANGE_KEY, MUST_CHANGE_KEY);
        }
        localStorage.setItem(TOKEN_KEY, response.token);
        localStorage.setItem(MUST_CHANGE_KEY, String(response.mustChangePassword));
        localStorage.setItem(ROLE_KEY, response.role);
        localStorage.setItem(IMPERSONATING_KEY, displayName);
      })
    );
  }

  isImpersonating(): boolean {
    return localStorage.getItem(IMPERSONATING_KEY) !== null;
  }

  getImpersonatedName(): string | null {
    return localStorage.getItem(IMPERSONATING_KEY);
  }

  exitImpersonation(): void {
    this.stash(TOKEN_KEY, ADMIN_TOKEN_KEY);
    this.stash(ROLE_KEY, ADMIN_ROLE_KEY);
    this.stash(MUST_CHANGE_KEY, ADMIN_MUST_CHANGE_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_ROLE_KEY);
    localStorage.removeItem(ADMIN_MUST_CHANGE_KEY);
    localStorage.removeItem(IMPERSONATING_KEY);
  }

  private stash(toKey: string, fromKey: string): void {
    const value = localStorage.getItem(fromKey);
    if (value !== null) {
      localStorage.setItem(toKey, value);
    }
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
