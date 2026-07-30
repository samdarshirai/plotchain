import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BrandingBootstrapService } from './branding-bootstrap.service';
import { ThemeService } from './theme.service';

describe('BrandingBootstrapService', () => {
  let service: BrandingBootstrapService;
  let httpMock: HttpTestingController;
  let theme: ThemeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [BrandingBootstrapService]
    });
    service = TestBed.inject(BrandingBootstrapService);
    httpMock = TestBed.inject(HttpTestingController);
    theme = TestBed.inject(ThemeService);
  });

  afterEach(() => httpMock.verify());

  it('applies the fetched brand colors to ThemeService', async () => {
    spyOn(theme, 'apply');

    const promise = service.initialize();

    const req = httpMock.expectOne('/api/company/branding/public');
    expect(req.request.method).toBe('GET');
    req.flush({ primaryColor: '#1A1A2E', secondaryColor: '#FF00FF' });

    await promise;

    expect(theme.apply).toHaveBeenCalledWith('#1A1A2E', '#FF00FF');
  });

  it('caches the full fetched payload for getLast()', async () => {
    spyOn(theme, 'apply');

    const promise = service.initialize();

    const req = httpMock.expectOne('/api/company/branding/public');
    req.flush({
      displayName: 'Plotchain Estates',
      tagline: 'Land you can trust',
      primaryColor: '#1A1A2E',
      secondaryColor: '#FF00FF',
      hasSquareLogo: true,
      hasWideLogo: false
    });

    await promise;

    expect(service.getLast()).toEqual({
      displayName: 'Plotchain Estates',
      tagline: 'Land you can trust',
      primaryColor: '#1A1A2E',
      secondaryColor: '#FF00FF',
      hasSquareLogo: true,
      hasWideLogo: false
    });
  });

  it('resolves without applying a theme when the endpoint 404s', async () => {
    spyOn(theme, 'apply');

    const promise = service.initialize();

    const req = httpMock.expectOne('/api/company/branding/public');
    req.flush(null, { status: 404, statusText: 'Not Found' });

    await expectAsync(promise).toBeResolved();
    expect(theme.apply).not.toHaveBeenCalled();
  });

  it('resolves cleanly rather than rejecting on a network error', async () => {
    spyOn(theme, 'apply');

    const promise = service.initialize();

    const req = httpMock.expectOne('/api/company/branding/public');
    req.error(new ProgressEvent('network error'));

    await expectAsync(promise).toBeResolved();
    expect(theme.apply).not.toHaveBeenCalled();
  });

  it('resolves without applying a theme when the request hangs past the timeout', fakeAsync(() => {
    spyOn(theme, 'apply');

    let resolved = false;
    service.initialize().then(() => (resolved = true));

    httpMock.expectOne('/api/company/branding/public');

    // Deliberately never flush a response - simulates a backend that accepts the
    // connection but never responds.
    tick(3000);

    expect(resolved).toBe(true);
    expect(theme.apply).not.toHaveBeenCalled();
  }));
});
