import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { EPinRegisterService } from './epin-register.service';

export const epinUnlockGuard: CanActivateFn = (_route, state) => {
  if (inject(EPinRegisterService).isUnlocked()) { return true; }
  return inject(Router).createUrlTree(['/e-pins/unlock'], { queryParams: { returnUrl: state.url } });
};
