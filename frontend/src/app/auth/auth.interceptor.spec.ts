import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';
import { Router } from '@angular/router';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  let httpClient: HttpClient;
  let httpMock: HttpTestingController;
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting()
      ]
    });
    httpClient = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => httpMock.verify());

  it('attaches the bearer token when one is present', () => {
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');

    httpClient.get('/api/associates/me/dashboard').subscribe();

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc.def.ghi');
    req.flush({});
  });

  it('logs out and redirects to /login on a 401 response', () => {
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');

    httpClient.get('/api/associates/me/dashboard').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('does not log out or redirect on a 401 from the login call itself', () => {
    spyOn(authService, 'getToken').and.returnValue(null);
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');

    let caughtError: unknown;
    httpClient.post('/api/auth/login', { userId: 'jane', password: 'wrong' })
      .subscribe({ error: err => (caughtError = err) });

    const req = httpMock.expectOne('/api/auth/login');
    req.flush({ error: 'Invalid credentials' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(caughtError).toBeTruthy();
  });

  it('does not log out or redirect on a 401 from the change-password call', () => {
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');

    let caughtError: unknown;
    httpClient.post('/api/associates/me/password', { currentPassword: 'wrong', newPassword: 'NewPassword123!' })
      .subscribe({ error: err => (caughtError = err) });

    const req = httpMock.expectOne('/api/associates/me/password');
    req.flush({ error: 'Invalid current password' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(caughtError).toBeTruthy();
  });

  it('does not log out or redirect on a 401 from the profile save (transaction password gate)', () => {
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');

    let caughtError: unknown;
    httpClient.put('/api/associates/me/profile', { name: 'Jane' })
      .subscribe({ error: err => (caughtError = err) });

    const req = httpMock.expectOne('/api/associates/me/profile');
    req.flush({ error: 'Transaction password is required to save these changes' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
    expect(caughtError).toBeTruthy();
  });

  it('does not log out or redirect on a 401 from the nominee save (transaction password gate)', () => {
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');

    httpClient.put('/api/associates/me/nominee', { nomineeName: 'Kajal' })
      .subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/associates/me/nominee');
    req.flush({ error: 'Transaction password is required to save these changes' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('does not log out or redirect on a 401 from setting the transaction password', () => {
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');

    httpClient.post('/api/associates/me/transaction-password', { newTransactionPassword: 'secret123' })
      .subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/associates/me/transaction-password');
    req.flush({ error: 'Current transaction password is incorrect' }, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  // The allowlist is method-aware, not just path-based: a real expired-session 401 on a plain
  // GET to one of these same paths must still log the associate out, since no in-form
  // validation happens on a read.
  it('still logs out and redirects on a 401 from a GET to /api/associates/me/profile', () => {
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');
    spyOn(authService, 'logout');
    spyOn(router, 'navigate');

    httpClient.get('/api/associates/me/profile').subscribe({ error: () => {} });

    const req = httpMock.expectOne('/api/associates/me/profile');
    req.flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(authService.logout).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('sends no Authorization header when no token is stored', () => {
    spyOn(authService, 'getToken').and.returnValue(null);

    httpClient.get('/api/associates/me/dashboard').subscribe();

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });
});
