import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { rootRedirectGuard } from './root-redirect.guard';
import { AuthService } from './auth.service';
import { SetupService } from '../setup/setup.service';
import { SetupStateResponse } from '../setup/models/setup-state.model';

describe('rootRedirectGuard', () => {
  let authService: jasmine.SpyObj<AuthService>;
  let setupService: jasmine.SpyObj<SetupService>;
  let router: Router;

  const launchedState: SetupStateResponse = { steps: [], canGoLive: true, launchedAt: '2026-01-01T00:00:00Z' };
  const unlaunchedState: SetupStateResponse = { steps: [], canGoLive: false, launchedAt: null };

  beforeEach(() => {
    authService = jasmine.createSpyObj('AuthService', ['getRole']);
    setupService = jasmine.createSpyObj('SetupService', ['getState', 'firstIncompleteStepPath']);
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: SetupService, useValue: setupService }
      ]
    });
    router = TestBed.inject(Router);
  });

  it('redirects an ASSOCIATE to /dashboard without checking setup state', () => {
    authService.getRole.and.returnValue('ASSOCIATE');
    setupService.getState.and.returnValue(of(unlaunchedState));

    const result = TestBed.runInInjectionContext(() => rootRedirectGuard({} as any, {} as any)) as UrlTree;
    expect(result.toString()).toBe(router.parseUrl('/dashboard').toString());
    expect(setupService.getState).not.toHaveBeenCalled();
  });

  it('redirects ADMIN to the first incomplete setup step while unlaunched', done => {
    authService.getRole.and.returnValue('ADMIN');
    setupService.getState.and.returnValue(of(unlaunchedState));
    setupService.firstIncompleteStepPath.and.returnValue('company-profile');

    const result$ = TestBed.runInInjectionContext(() => rootRedirectGuard({} as any, {} as any)) as any;
    result$.subscribe((result: UrlTree) => {
      expect(result.toString()).toBe(router.parseUrl('/setup/company-profile').toString());
      done();
    });
  });

  it('redirects ADMIN to /admin/dashboard once launched', done => {
    authService.getRole.and.returnValue('ADMIN');
    setupService.getState.and.returnValue(of(launchedState));

    const result$ = TestBed.runInInjectionContext(() => rootRedirectGuard({} as any, {} as any)) as any;
    result$.subscribe((result: UrlTree) => {
      expect(result.toString()).toBe(router.parseUrl('/admin/dashboard').toString());
      done();
    });
  });

});
