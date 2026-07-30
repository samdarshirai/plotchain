import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { LoginResponse } from './models/login-response.model';

describe('AuthService', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
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

  it('reports not authenticated when the stored token is malformed', () => {
    localStorage.setItem('plotchain.auth.token', 'not-a-jwt');
    expect(service.isAuthenticated()).toBeFalse();
  });
});
