import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { epinUnlockGuard } from './epin-unlock.guard';
import { EPinRegisterService } from './epin-register.service';

describe('epinUnlockGuard', () => {
  beforeEach(() => TestBed.configureTestingModule({
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()]
  }));

  const run = () => TestBed.runInInjectionContext(() => epinUnlockGuard({} as never, { url: '/e-pins/view-used' } as never));

  it('redirects to the unlock screen, keeping the return url, when locked', () => {
    const r = run() as UrlTree;
    expect(TestBed.inject(Router).serializeUrl(r)).toBe('/e-pins/unlock?returnUrl=%2Fe-pins%2Fview-used');
  });

  it('lets the route through once unlocked, and re-locks on lock()', () => {
    const svc = TestBed.inject(EPinRegisterService);
    svc.unlock('pw').subscribe();
    TestBed.inject(HttpTestingController).expectOne('/api/associates/me/epins/unlock')
      .flush({ token: 't', expiresAt: new Date(Date.now() + 60_000).toISOString() });
    expect(run()).toBeTrue();
    svc.lock();
    expect(run()).not.toBeTrue();
  });
});
