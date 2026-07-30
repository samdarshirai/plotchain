import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { of } from 'rxjs';
import { setupModeGuard, launchedModeGuard } from './setup.guard';
import { SetupService } from './setup.service';
import { SetupStateResponse } from './models/setup-state.model';

describe('setup guards', () => {
  let setupService: jasmine.SpyObj<SetupService>;
  let router: Router;

  const launchedState: SetupStateResponse = { steps: [], canGoLive: true, launchedAt: '2026-01-01T00:00:00Z' };
  const unlaunchedState: SetupStateResponse = { steps: [], canGoLive: false, launchedAt: null };

  beforeEach(() => {
    setupService = jasmine.createSpyObj('SetupService', ['getState', 'firstIncompleteStepPath']);
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: SetupService, useValue: setupService }]
    });
    router = TestBed.inject(Router);
  });

  describe('setupModeGuard', () => {
    it('allows navigation while not launched', done => {
      setupService.getState.and.returnValue(of(unlaunchedState));
      const result$ = TestBed.runInInjectionContext(() => setupModeGuard({} as any, {} as any)) as any;
      result$.subscribe((result: boolean | UrlTree) => {
        expect(result).toBeTrue();
        done();
      });
    });

    it('redirects to /settings once launched', done => {
      setupService.getState.and.returnValue(of(launchedState));
      const result$ = TestBed.runInInjectionContext(() => setupModeGuard({} as any, {} as any)) as any;
      result$.subscribe((result: UrlTree) => {
        expect(result.toString()).toBe(router.parseUrl('/settings').toString());
        done();
      });
    });
  });

  describe('launchedModeGuard', () => {
    it('allows navigation once launched', done => {
      setupService.getState.and.returnValue(of(launchedState));
      const result$ = TestBed.runInInjectionContext(() => launchedModeGuard({} as any, {} as any)) as any;
      result$.subscribe((result: boolean | UrlTree) => {
        expect(result).toBeTrue();
        done();
      });
    });

    it('redirects to the first incomplete step while not launched', done => {
      setupService.getState.and.returnValue(of(unlaunchedState));
      setupService.firstIncompleteStepPath.and.returnValue('company-profile');
      const result$ = TestBed.runInInjectionContext(() => launchedModeGuard({} as any, {} as any)) as any;
      result$.subscribe((result: UrlTree) => {
        expect(result.toString()).toBe(router.parseUrl('/setup/company-profile').toString());
        done();
      });
    });
  });
});
