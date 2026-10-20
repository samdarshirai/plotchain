import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { AuthService } from './auth.service';
import { LoginResponse } from './models/login-response.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, RouterTestingModule],
      providers: [AuthService]
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  function tokenExpiringAt(secondsFromNow: number): string {
    const payload = { sub: 'assoc-1', role: 'ASSOCIATE', exp: Math.floor(Date.now() / 1000) + secondsFromNow };
    const b64 = (o: object) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.signature-not-verified-client-side`;
  }

  it('logs in and stores the returned token', () => {
    const token = tokenExpiringAt(3600);
    const mockResponse: LoginResponse = { token, associateId: 'assoc-1', role: 'ASSOCIATE', mustChangePassword: false };

    service.login('jane', 'Password123!').subscribe(res => {
      expect(res.token).toBe(token);
    });

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ userId: 'jane', password: 'Password123!' });
    req.flush(mockResponse);

    expect(service.getToken()).toBe(token);
    expect(service.isAuthenticated()).toBeTrue();
    expect(service.getRole()).toBe('ASSOCIATE');
  });

  it('reports not authenticated when no token is stored', () => {
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('reports no stored role when none has been set', () => {
    expect(service.getRole()).toBeNull();
  });

  it('clears the token and role on logout', () => {
    localStorage.setItem('plotchain.auth.token', 'some-token');
    localStorage.setItem('plotchain.auth.role', 'ADMIN');
    service.logout();
    expect(service.getToken()).toBeNull();
    expect(service.getRole()).toBeNull();
  });

  it('changes the password and clears the mustChangePassword flag', () => {
    localStorage.setItem('plotchain.auth.mustChangePassword', 'true');

    service.changePassword('Temp1234!', 'NewPassword123!').subscribe();

    const req = httpMock.expectOne('/api/associates/me/password');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    req.flush(null);

    expect(localStorage.getItem('plotchain.auth.mustChangePassword')).toBe('false');
    expect(service.mustChangePassword()).toBeFalse();
  });

  it('reports not authenticated when the stored token has expired', () => {
    localStorage.setItem('plotchain.auth.token', tokenExpiringAt(-60));
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('reports authenticated when the stored token is still valid', () => {
    localStorage.setItem('plotchain.auth.token', tokenExpiringAt(3600));
    expect(service.isAuthenticated()).toBeTrue();
  });

  describe('realms', () => {
    const adminLogin = { token: 'admin-token', associateId: 'x', role: 'ADMIN', mustChangePassword: false } as LoginResponse;
    const assocLogin = { token: 'assoc-token', associateId: 'y', role: 'ASSOCIATE', mustChangePassword: false } as LoginResponse;

    function login(realm: 'admin' | 'associate', response: LoginResponse) {
      let error: unknown;
      service.login('u', 'p', realm).subscribe({ error: e => (error = e) });
      httpMock.expectOne('/api/auth/login').flush(response);
      return error;
    }

    it('keeps admin and associate sessions side by side', () => {
      login('admin', adminLogin);
      login('associate', assocLogin);
      expect(service.getToken('admin')).toBe('admin-token');
      expect(service.getToken('associate')).toBe('assoc-token');
      expect(service.getRole('admin')).toBe('ADMIN');
      expect(service.getRole('associate')).toBe('ASSOCIATE');
    });

    it('logging out of one realm leaves the other signed in', () => {
      login('admin', adminLogin);
      login('associate', assocLogin);
      service.logout('admin');
      expect(service.getToken('admin')).toBeNull();
      expect(service.getToken('associate')).toBe('assoc-token');
    });

    it('rejects an admin account on the associate login without storing anything', () => {
      expect(login('associate', adminLogin)).toBeTruthy();
      expect(localStorage.length).toBe(0);
    });

    it('rejects an associate account on the admin login without storing anything', () => {
      expect(login('admin', assocLogin)).toBeTruthy();
      expect(localStorage.length).toBe(0);
    });

    it('picks the realm from the URL prefix', () => {
      const router = TestBed.inject(Router);
      spyOnProperty(router, 'url').and.returnValue('/admin/settings/news');
      (router as { navigated: boolean }).navigated = true;
      expect(service.currentRealm()).toBe('admin');
    });

    it('treats other URLs as the associate realm', () => {
      const router = TestBed.inject(Router);
      spyOnProperty(router, 'url').and.returnValue('/dashboard');
      (router as { navigated: boolean }).navigated = true;
      expect(service.currentRealm()).toBe('associate');
    });
  });

  describe('impersonation', () => {
    function startImpersonation(id: string, name: string, token: string) {
      service.impersonate(id, name).subscribe();
      const req = httpMock.expectOne(`/api/admin/associates/${id}/impersonate`);
      expect(req.request.method).toBe('POST');
      req.flush({ token, associateId: id, role: 'ASSOCIATE', mustChangePassword: false } as LoginResponse);
    }

    beforeEach(() => {
      localStorage.setItem('plotchain.auth.admin.token', 'admin-token');
      localStorage.setItem('plotchain.auth.admin.role', 'ADMIN');
    });

    it('writes the associate session and leaves the admin session untouched', () => {
      startImpersonation('a-1', 'Jane Doe', 'imp-token');
      expect(service.getToken('associate')).toBe('imp-token');
      expect(service.getRole('associate')).toBe('ASSOCIATE');
      expect(service.getToken('admin')).toBe('admin-token');
      expect(service.getRole('admin')).toBe('ADMIN');
      expect(service.getImpersonatedName()).toBe('Jane Doe');
      expect(service.isImpersonating()).toBeTrue();
    });

    it('exitImpersonation clears only the associate session', () => {
      startImpersonation('a-1', 'Jane Doe', 'imp-token');
      service.exitImpersonation();
      expect(service.getToken('associate')).toBeNull();
      expect(service.getImpersonatedName()).toBeNull();
      expect(service.getToken('admin')).toBe('admin-token');
    });

    it('a normal associate login clears a leftover impersonation flag', () => {
      startImpersonation('a-1', 'Jane Doe', 'imp-token');
      service.login('u', 'p', 'associate').subscribe();
      httpMock.expectOne('/api/auth/login').flush({ token: 'new-token', associateId: 'x', role: 'ASSOCIATE', mustChangePassword: false } as LoginResponse);
      expect(service.isImpersonating()).toBeFalse();
      expect(service.getToken('associate')).toBe('new-token');
    });
  });

  it('reports not authenticated when the stored token is malformed', () => {
    localStorage.setItem('plotchain.auth.token', 'not-a-jwt');
    expect(service.isAuthenticated()).toBeFalse();
  });
});
