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
    httpClient.post('/api/auth/login', { email: 'x@y.z', password: 'wrong' })
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

  it('sends no Authorization header when no token is stored', () => {
    spyOn(authService, 'getToken').and.returnValue(null);

    httpClient.get('/api/associates/me/dashboard').subscribe();

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    expect(req.request.headers.has('Authorization')).toBeFalse();
    req.flush({});
  });
});
