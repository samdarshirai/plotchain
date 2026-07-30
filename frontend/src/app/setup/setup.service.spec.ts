import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { SetupService } from './setup.service';
import { SetupStateResponse, StepStatus } from './models/setup-state.model';

describe('SetupService', () => {
  let service: SetupService;
  let httpMock: HttpTestingController;

  function step(overrides: Partial<StepStatus>): StepStatus {
    return { number: 1, key: 'companyProfile', complete: false, required: true, percentComplete: 0, ...overrides };
  }

  const response: SetupStateResponse = {
    steps: [
      step({ number: 1, key: 'companyProfile', required: true, complete: false }),
      step({ number: 2, key: 'branding', required: false, complete: false }),
      step({ number: 3, key: 'compensation', required: true, complete: true, percentComplete: 100 })
    ],
    canGoLive: false,
    launchedAt: null
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [SetupService]
    });
    service = TestBed.inject(SetupService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('fetches the setup state', () => {
    let result: SetupStateResponse | undefined;
    service.getState().subscribe(r => (result = r));

    const req = httpMock.expectOne('/api/company/setup-state');
    expect(req.request.method).toBe('GET');
    req.flush(response);

    expect(result).toEqual(response);
  });

  it('caches the response across subscribers without a second request', () => {
    let first: SetupStateResponse | undefined;
    let second: SetupStateResponse | undefined;
    service.getState().subscribe(r => (first = r));
    service.getState().subscribe(r => (second = r));

    httpMock.expectOne('/api/company/setup-state').flush(response);

    expect(first).toEqual(response);
    expect(second).toEqual(response);
  });

  it('refetches after refresh()', () => {
    let latest: SetupStateResponse | undefined;
    service.getState().subscribe(r => (latest = r));
    httpMock.expectOne('/api/company/setup-state').flush(response);

    const relaunched: SetupStateResponse = { ...response, canGoLive: true, launchedAt: '2026-01-01T00:00:00Z' };
    service.refresh();
    service.getState().subscribe(r => (latest = r));
    httpMock.expectOne('/api/company/setup-state').flush(relaunched);

    expect(latest).toEqual(relaunched);
  });

  it('returns the first incomplete required step key', () => {
    expect(service.firstIncompleteStepKey(response)).toBe('companyProfile');
  });

  it('falls back to the first step when every required step is complete', () => {
    const allRequiredComplete: SetupStateResponse = {
      ...response,
      steps: response.steps.map(s => (s.required ? { ...s, complete: true } : s))
    };
    expect(service.firstIncompleteStepKey(allRequiredComplete)).toBe('companyProfile');
  });

  it('maps the first incomplete step key to its route path', () => {
    expect(service.firstIncompleteStepPath(response)).toBe('company-profile');
  });

  it('returns the next step path for a middle step', () => {
    expect(service.nextStepPath('branding')).toBe('compensation');
  });

  it('returns null for the next step path after the last step', () => {
    expect(service.nextStepPath('reviewLaunch')).toBeNull();
  });

  it('returns the previous step path for a middle step', () => {
    expect(service.previousStepPath('branding')).toBe('company-profile');
  });

  it('returns null for the previous step path before the first step', () => {
    expect(service.previousStepPath('companyProfile')).toBeNull();
  });
});
