import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { appConfig } from './app.config';
import { AuthService } from './auth/auth.service';

// Neither this spec nor any other installs authInterceptor itself — every other spec that
// exercises it (auth.interceptor.spec.ts) wires it into its own TestBed directly. That means
// deleting `withInterceptors([authInterceptor])` from app.config.ts's provider array would not
// turn a single existing test red. This spec boots appConfig's actual providers (plus a testing
// HTTP backend) and proves end-to-end that a request issued through it carries the bearer
// token, so the wiring itself is under test.
describe('appConfig', () => {
  it('registers authInterceptor via appConfig.providers so requests carry the bearer token', () => {
    TestBed.configureTestingModule({
      providers: [...appConfig.providers, provideHttpClientTesting()]
    });

    const authService = TestBed.inject(AuthService);
    spyOn(authService, 'getToken').and.returnValue('abc.def.ghi');

    const httpClient = TestBed.inject(HttpClient);
    const httpMock = TestBed.inject(HttpTestingController);

    httpClient.get('/api/associates/me/dashboard').subscribe();

    const req = httpMock.expectOne('/api/associates/me/dashboard');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc.def.ghi');
    req.flush({});

    // appConfig.providers now also registers APP_INITIALIZER (BrandingBootstrapService). TestBed's
    // finalize() runs ApplicationInitStatus.runInitializers() the moment anything is injected above,
    // which fires a real http.get('/api/company/branding/public') against this spec's testing
    // backend. Without flushing it here, httpMock.verify() below throws on the unflushed request.
    httpMock.expectOne('/api/company/branding/public').flush(null, { status: 404, statusText: 'Not Found' });

    httpMock.verify();
  });
});
