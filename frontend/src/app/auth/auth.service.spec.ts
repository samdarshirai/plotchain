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

  it('logs in and stores the returned token', () => {
    const mockResponse: LoginResponse = { token: 'abc.def.ghi', associateId: 'assoc-1', role: 'ASSOCIATE' };

    service.login('jane@plotchain.test', 'Password123!').subscribe(res => {
      expect(res.token).toBe('abc.def.ghi');
    });

    const req = httpMock.expectOne('/api/auth/login');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'jane@plotchain.test', password: 'Password123!' });
    req.flush(mockResponse);

    expect(service.getToken()).toBe('abc.def.ghi');
    expect(service.isAuthenticated()).toBeTrue();
  });

  it('reports not authenticated when no token is stored', () => {
    expect(service.isAuthenticated()).toBeFalse();
  });

  it('clears the token on logout', () => {
    localStorage.setItem('plotchain.auth.token', 'some-token');
    service.logout();
    expect(service.getToken()).toBeNull();
  });
});
