import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { SetupService } from './setup.service';

// Guards the /setup route tree: once the instance has launched, the wizard is done and
// further visits go to /settings instead.
export const setupModeGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const setupService = inject(SetupService);
  const router = inject(Router);
  return setupService.getState().pipe(
    map(state => (state.launchedAt ? router.parseUrl('/settings') : true))
  );
};

// The reverse guard for /settings: it only exists once the instance has launched. Visiting it
// beforehand resumes the wizard at its first incomplete required step.
export const launchedModeGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const setupService = inject(SetupService);
  const router = inject(Router);
  return setupService.getState().pipe(
    map(state => (state.launchedAt ? true : router.parseUrl(`/setup/${setupService.firstIncompleteStepPath(state)}`)))
  );
};
