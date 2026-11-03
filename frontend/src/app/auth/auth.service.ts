import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { LoginRequest } from './models/login-request.model';
import { LoginResponse } from './models/login-response.model';
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';

export type AuthRealm = 'admin' | 'associate';

// Admin and associate sessions live in separate localStorage slots so both can be signed in at
// once in different tabs. Which slot a call uses follows the URL: /admin/** is the admin realm.
const KEYS = {
  associate: { token: 'plotchain.auth.token', mustChange: 'plotchain.auth.mustChangePassword', role: 'plotchain.auth.role' },
  admin: { token: 'plotchain.auth.admin.token', mustChange: 'plotchain.auth.admin.mustChange', role: 'plotchain.auth.admin.role' }
} as const;
const IMPERSONATING_KEY = 'plotchain.auth.impersonating';

// An impersonation session lives in the impersonated tab's own sessionStorage, so several can run
// side by side (and beside a real associate login in localStorage). Reads prefer the tab's slot.
function read(key: string): string | null {
  return sessionStorage.getItem(key) ?? localStorage.getItem(key);
}
function tabIsImpersonating(): boolean {
  return sessionStorage.getItem(IMPERSONATING_KEY) !== null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private http: HttpClient, private router: Router) {}

  // Uses the navigation target while one is in flight so guards see the realm of the page being
  // opened, not the page being left.
  currentRealm(): AuthRealm {
    const nav = this.router.getCurrentNavigation();
    const url = nav?.finalUrl?.toString() ?? nav?.extractedUrl?.toString()
      ?? (this.router.navigated ? this.router.url : window.location.pathname);
    return url === '/admin' || url.startsWith('/admin/') || url.startsWith('/admin?') ? 'admin' : 'associate';
  }

  login(userId: string, password: string, realm: AuthRealm = this.currentRealm()): Observable<LoginResponse> {
    const request: LoginRequest = { userId, password };
    return this.http.post<LoginResponse>('/api/auth/login', request).pipe(
      tap(response => {
        // An admin account on the associate login (or the reverse) is rejected like bad credentials.
        if (ADMIN_FAMILY_ROLES.has(response.role) !== (realm === 'admin')) {
          throw new HttpErrorResponse({ status: 401 });
        }
        if (realm === 'associate') {
          // A real login in an impersonated tab ends that tab's impersonation.
          Object.values(KEYS.associate).forEach(k => sessionStorage.removeItem(k));
          sessionStorage.removeItem(IMPERSONATING_KEY);
        }
        this.store(realm, response);
      })
    );
  }

  logout(realm: AuthRealm = this.currentRealm()): void {
    const keys = KEYS[realm];
    // Leaving an impersonation clears only this tab; other tabs' sessions stay signed in.
    const storage = realm === 'associate' && tabIsImpersonating() ? sessionStorage : localStorage;
    storage.removeItem(keys.token);
    storage.removeItem(keys.mustChange);
    storage.removeItem(keys.role);
    if (realm === 'associate') {
      storage.removeItem(IMPERSONATING_KEY);
    }
  }

  private store(realm: AuthRealm, response: LoginResponse, storage: Storage = localStorage): void {
    const keys = KEYS[realm];
    storage.setItem(keys.token, response.token);
    storage.setItem(keys.mustChange, String(response.mustChangePassword));
    storage.setItem(keys.role, response.role);
  }

  // Writes the associate session into the target tab's sessionStorage only; the admin session and
  // any other tab are left alone. The caller passes the same-origin tab it opened for the session.
  impersonate(associateId: string, displayName: string, target: Window): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`/api/admin/associates/${associateId}/impersonate`, {}).pipe(
      tap(response => {
        this.store('associate', response, target.sessionStorage);
        target.sessionStorage.setItem(IMPERSONATING_KEY, displayName);
      })
    );
  }

  isImpersonating(): boolean {
    return this.currentRealm() === 'associate' && tabIsImpersonating();
  }

  getImpersonatedName(): string | null {
    return sessionStorage.getItem(IMPERSONATING_KEY);
  }

  exitImpersonation(): void {
    this.logout('associate');
  }

  getToken(realm: AuthRealm = this.currentRealm()): string | null {
    return read(KEYS[realm].token);
  }

  getRole(realm: AuthRealm = this.currentRealm()): string | null {
    return read(KEYS[realm].role);
  }

  isAuthenticated(realm: AuthRealm = this.currentRealm()): boolean {
    const payload = this.decodePayload(this.getToken(realm));
    if (!payload || typeof payload['exp'] !== 'number') {
      return false;
    }
    return payload['exp'] * 1000 > Date.now();
  }

  mustChangePassword(): boolean {
    return read(KEYS[this.currentRealm()].mustChange) === 'true';
  }

  changePassword(currentPassword: string, newPassword: string): Observable<void> {
    return this.http.post<void>('/api/associates/me/password', { currentPassword, newPassword }).pipe(
      tap(() => (tabIsImpersonating() ? sessionStorage : localStorage).setItem(KEYS[this.currentRealm()].mustChange, 'false'))
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
