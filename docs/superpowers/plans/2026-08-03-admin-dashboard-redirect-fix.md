# Admin-family dashboard redirect fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop admin-family associates (ADMIN, SUPER_ADMIN, FINANCE, KYC_REVIEWER, SUPPORT) from being auto-routed to `/dashboard`, which 409s for any associate with `rank_id = NULL`.

**Architecture:** One new pure function (`postAuthLandingPath`) encodes the role+launched-state landing-page decision. Three existing call sites (`login.component.ts`, `change-password.component.ts`, and a new `rootRedirectGuard` replacing the static root-path redirect in `app.routes.ts`) all delegate to it instead of each carrying their own copy of the branch.

**Tech Stack:** Angular 18, RxJS, Jasmine/Karma.

## Global Constraints

- `ADMIN_FAMILY_ROLES` (from `frontend/src/app/admin/admin.guard.ts`) is the exhaustive set of non-ASSOCIATE roles: `ADMIN`, `SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`. Never hardcode a shorter list.
- Landing destinations, exactly: ASSOCIATE always → `/dashboard`. Any admin-family role, unlaunched → `/setup/<first incomplete step>`. `ADMIN`, launched → `/admin/associates/new`. Any other admin-family role, launched → `/settings`.
- `DashboardComponent` and the backend `DashboardService`/`DashboardExceptionHandler` are explicitly out of scope — no changes there.
- No e2e/Playwright tests — deferred per the project's e2e-testing-plan memory until all 12 setup-onboarding phases land.
- Run frontend tests with: `npx ng test --watch=false --browsers=ChromeHeadless --include=<glob>` (scoped per task below).

---

### Task 1: Shared `postAuthLandingPath` decision function

**Files:**
- Create: `frontend/src/app/auth/post-auth-redirect.ts`
- Test: `frontend/src/app/auth/post-auth-redirect.spec.ts`

**Interfaces:**
- Consumes: `ADMIN_FAMILY_ROLES: Set<string>` from `frontend/src/app/admin/admin.guard.ts`; `SetupStateResponse` type (`{ steps: StepStatus[]; canGoLive: boolean; launchedAt: string | null }`) from `frontend/src/app/setup/models/setup-state.model.ts`.
- Produces: `postAuthLandingPath(role: string, state: SetupStateResponse, incompleteStepPath: string): string` — returns one of `/dashboard`, `/setup/<incompleteStepPath>`, `/admin/associates/new`, `/settings`. Tasks 2, 3, and 4 all call this exact signature.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/app/auth/post-auth-redirect.spec.ts
import { postAuthLandingPath } from './post-auth-redirect';
import { SetupStateResponse } from '../setup/models/setup-state.model';

describe('postAuthLandingPath', () => {
  const unlaunchedState: SetupStateResponse = { steps: [], canGoLive: false, launchedAt: null };
  const launchedState: SetupStateResponse = { steps: [], canGoLive: true, launchedAt: '2026-01-01T00:00:00Z' };

  it('sends ASSOCIATE to /dashboard regardless of setup state', () => {
    expect(postAuthLandingPath('ASSOCIATE', unlaunchedState, 'company-profile')).toBe('/dashboard');
    expect(postAuthLandingPath('ASSOCIATE', launchedState, 'company-profile')).toBe('/dashboard');
  });

  it('sends every admin-family role to the first incomplete setup step while unlaunched', () => {
    for (const role of ['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPPORT']) {
      expect(postAuthLandingPath(role, unlaunchedState, 'company-profile')).toBe('/setup/company-profile');
    }
  });

  it('sends ADMIN to /admin/associates/new once launched', () => {
    expect(postAuthLandingPath('ADMIN', launchedState, 'company-profile')).toBe('/admin/associates/new');
  });

  it('sends every other admin-family role to /settings once launched', () => {
    for (const role of ['SUPER_ADMIN', 'FINANCE', 'KYC_REVIEWER', 'SUPPORT']) {
      expect(postAuthLandingPath(role, launchedState, 'company-profile')).toBe('/settings');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include=frontend/src/app/auth/post-auth-redirect.spec.ts`
Expected: FAIL — `post-auth-redirect.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/app/auth/post-auth-redirect.ts
import { ADMIN_FAMILY_ROLES } from '../admin/admin.guard';
import { SetupStateResponse } from '../setup/models/setup-state.model';

// Single source of truth for "where does this role land once authenticated" -- login,
// change-password, and the '/' root route all delegate here so the ADMIN-vs-rest-of-admin-family
// split (and the launched/unlaunched split) only has to be right in one place.
export function postAuthLandingPath(role: string, state: SetupStateResponse, incompleteStepPath: string): string {
  if (!ADMIN_FAMILY_ROLES.has(role)) {
    return '/dashboard';
  }
  if (!state.launchedAt) {
    return `/setup/${incompleteStepPath}`;
  }
  return role === 'ADMIN' ? '/admin/associates/new' : '/settings';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include=frontend/src/app/auth/post-auth-redirect.spec.ts`
Expected: PASS (4 specs, 0 failures)

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/auth/post-auth-redirect.ts frontend/src/app/auth/post-auth-redirect.spec.ts
git commit -m "feat(auth): add shared post-auth landing-path decision function"
```

---

### Task 2: Role-aware root path redirect

**Files:**
- Create: `frontend/src/app/auth/root-redirect.guard.ts`
- Test: `frontend/src/app/auth/root-redirect.guard.spec.ts`
- Modify: `frontend/src/app/app.routes.ts` (root path route, currently `{ path: '', redirectTo: '/dashboard', pathMatch: 'full' }` at the end of the `routes` array)
- Modify: `frontend/src/app/app.routes.spec.ts` (add coverage for the new root route)

**Interfaces:**
- Consumes: `postAuthLandingPath` from Task 1 (`frontend/src/app/auth/post-auth-redirect.ts`); `AuthService.getRole(): string | null` (`frontend/src/app/auth/auth.service.ts`); `SetupService.getState(): Observable<SetupStateResponse>` and `SetupService.firstIncompleteStepPath(state): string` (`frontend/src/app/setup/setup.service.ts`); `authGuard` (`frontend/src/app/auth/auth.guard.ts`).
- Produces: `rootRedirectGuard: CanActivateFn` — exported for use in `app.routes.ts`'s root route `canActivate` array.

- [ ] **Step 1: Write the failing test**

```typescript
// frontend/src/app/auth/root-redirect.guard.spec.ts
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

  it('redirects an ASSOCIATE to /dashboard without checking setup state', done => {
    authService.getRole.and.returnValue('ASSOCIATE');
    setupService.getState.and.returnValue(of(unlaunchedState));

    const result$ = TestBed.runInInjectionContext(() => rootRedirectGuard({} as any, {} as any)) as any;
    result$.subscribe((result: UrlTree) => {
      expect(result.toString()).toBe(router.parseUrl('/dashboard').toString());
      done();
    });
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

  it('redirects ADMIN to /admin/associates/new once launched', done => {
    authService.getRole.and.returnValue('ADMIN');
    setupService.getState.and.returnValue(of(launchedState));

    const result$ = TestBed.runInInjectionContext(() => rootRedirectGuard({} as any, {} as any)) as any;
    result$.subscribe((result: UrlTree) => {
      expect(result.toString()).toBe(router.parseUrl('/admin/associates/new').toString());
      done();
    });
  });

  it('redirects a non-ADMIN admin-family role to /settings once launched', done => {
    authService.getRole.and.returnValue('FINANCE');
    setupService.getState.and.returnValue(of(launchedState));

    const result$ = TestBed.runInInjectionContext(() => rootRedirectGuard({} as any, {} as any)) as any;
    result$.subscribe((result: UrlTree) => {
      expect(result.toString()).toBe(router.parseUrl('/settings').toString());
      done();
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include=frontend/src/app/auth/root-redirect.guard.spec.ts`
Expected: FAIL — `root-redirect.guard.ts` does not exist yet (module not found).

- [ ] **Step 3: Write the implementation**

```typescript
// frontend/src/app/auth/root-redirect.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { map, Observable } from 'rxjs';
import { AuthService } from './auth.service';
import { SetupService } from '../setup/setup.service';
import { postAuthLandingPath } from './post-auth-redirect';

// Always redirects -- this route never renders anything of its own (see the root route's
// `children: []` in app.routes.ts). It just resolves '/' to postAuthLandingPath's answer for the
// current role and (for admin-family roles) setup-launch state.
export const rootRedirectGuard: CanActivateFn = (): Observable<UrlTree> => {
  const authService = inject(AuthService);
  const setupService = inject(SetupService);
  const router = inject(Router);
  const role = authService.getRole() ?? '';
  return setupService.getState().pipe(
    map(state => router.parseUrl(postAuthLandingPath(role, state, setupService.firstIncompleteStepPath(state))))
  );
};
```

Now wire it into the root route. Read the end of `frontend/src/app/app.routes.ts` first — the last line is:

```typescript
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
```

Replace it with:

```typescript
  { path: '', pathMatch: 'full', canActivate: [authGuard, rootRedirectGuard], children: [] }
```

And add the import near the top, next to the existing `authGuard` import:

```typescript
import { rootRedirectGuard } from './auth/root-redirect.guard';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include=frontend/src/app/auth/root-redirect.guard.spec.ts`
Expected: PASS (4 specs, 0 failures)

- [ ] **Step 5: Add route-wiring coverage to app.routes.spec.ts**

Add this import at the top of `frontend/src/app/app.routes.spec.ts`:

```typescript
import { rootRedirectGuard } from './auth/root-redirect.guard';
```

Add this new `describe` block at the end of the file, just inside the closing `});` of the outer `describe('routes', ...)`:

```typescript
  describe('root route', () => {
    it('redirects via authGuard and rootRedirectGuard, rendering nothing itself', () => {
      const rootRoute = routes.find(r => r.path === '');
      expect(rootRoute).toBeTruthy();
      expect(rootRoute!.canActivate).toContain(authGuard);
      expect(rootRoute!.canActivate).toContain(rootRedirectGuard);
      expect(rootRoute!.children).toEqual([]);
    });
  });
```

- [ ] **Step 6: Run the full routes spec to verify it passes**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include=frontend/src/app/app.routes.spec.ts`
Expected: PASS, all specs including the new one green.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/app/auth/root-redirect.guard.ts frontend/src/app/auth/root-redirect.guard.spec.ts frontend/src/app/app.routes.ts frontend/src/app/app.routes.spec.ts
git commit -m "fix(routing): resolve root path by role instead of always redirecting to /dashboard"
```

---

### Task 3: Fix login.component.ts's post-login redirect

**Files:**
- Modify: `frontend/src/app/auth/login.component.ts:96-104` (the `ADMIN_FAMILY_ROLES.has(response.role)` branch inside `onSubmit`)
- Modify: `frontend/src/app/auth/login.component.spec.ts:44-58` (setup-step-path assertion) and `frontend/src/app/auth/login.component.spec.ts:76-90` (non-ADMIN admin-family test)

**Interfaces:**
- Consumes: `postAuthLandingPath` from Task 1.

- [ ] **Step 1: Update the two affected specs first (red)**

In `frontend/src/app/auth/login.component.spec.ts`, change line 57 from:

```typescript
    expect(router.navigate).toHaveBeenCalledWith(['/setup', 'company-profile']);
```

to:

```typescript
    expect(router.navigate).toHaveBeenCalledWith(['/setup/company-profile']);
```

Then replace the whole test at lines 76-90:

```typescript
  it('navigates to /dashboard on a non-ADMIN admin-family login once launched', () => {
    fixture.componentInstance.form.setValue({ userId: 'finance01', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/auth/login')
      .flush({ token: 'abc.def.ghi', associateId: 'finance-1', role: 'FINANCE', mustChangePassword: false });

    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
```

with:

```typescript
  it('navigates to /settings on a non-ADMIN admin-family login once launched', () => {
    fixture.componentInstance.form.setValue({ userId: 'finance01', password: 'Password123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/auth/login')
      .flush({ token: 'abc.def.ghi', associateId: 'finance-1', role: 'FINANCE', mustChangePassword: false });

    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/settings']);
  });
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include=frontend/src/app/auth/login.component.spec.ts`
Expected: FAIL — the two updated assertions don't match the component's current (unfixed) navigation calls.

- [ ] **Step 3: Fix the component**

In `frontend/src/app/auth/login.component.ts`, add this import alongside the existing `ADMIN_FAMILY_ROLES` import:

```typescript
import { postAuthLandingPath } from './post-auth-redirect';
```

Replace this block inside `onSubmit`'s `next` handler:

```typescript
        if (ADMIN_FAMILY_ROLES.has(response.role)) {
          this.setupService.getState().pipe(take(1)).subscribe(state => {
            if (!state.launchedAt) {
              this.router.navigate(['/setup', this.setupService.firstIncompleteStepPath(state)]);
            } else {
              this.router.navigate([response.role === 'ADMIN' ? '/admin/associates/new' : '/dashboard']);
            }
          });
          return;
        }
```

with:

```typescript
        if (ADMIN_FAMILY_ROLES.has(response.role)) {
          this.setupService.getState().pipe(take(1)).subscribe(state => {
            this.router.navigate([postAuthLandingPath(response.role, state, this.setupService.firstIncompleteStepPath(state))]);
          });
          return;
        }
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include=frontend/src/app/auth/login.component.spec.ts`
Expected: PASS, all specs in the file green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/auth/login.component.ts frontend/src/app/auth/login.component.spec.ts
git commit -m "fix(auth): send non-ADMIN admin-family logins to /settings instead of /dashboard"
```

---

### Task 4: Fix change-password.component.ts's post-change redirect

**Files:**
- Modify: `frontend/src/app/auth/change-password.component.ts:47-56` (the `ADMIN_FAMILY_ROLES.has(role)` branch inside `onSubmit`)
- Modify: `frontend/src/app/auth/change-password.component.spec.ts:43-57` (setup-step-path assertion) and `frontend/src/app/auth/change-password.component.spec.ts:75-89` (non-ADMIN admin-family test)

**Interfaces:**
- Consumes: `postAuthLandingPath` from Task 1.

- [ ] **Step 1: Update the two affected specs first (red)**

In `frontend/src/app/auth/change-password.component.spec.ts`, change line 56 from:

```typescript
    expect(router.navigate).toHaveBeenCalledWith(['/setup', 'company-profile']);
```

to:

```typescript
    expect(router.navigate).toHaveBeenCalledWith(['/setup/company-profile']);
```

Then replace the whole test at lines 75-89:

```typescript
  it('navigates to /dashboard when a non-ADMIN admin-family role completes a forced password change once launched', () => {
    localStorage.setItem('plotchain.auth.role', 'FINANCE');

    fixture.componentInstance.form.setValue({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/password').flush(null);
    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/dashboard']);
  });
```

with:

```typescript
  it('navigates to /settings when a non-ADMIN admin-family role completes a forced password change once launched', () => {
    localStorage.setItem('plotchain.auth.role', 'FINANCE');

    fixture.componentInstance.form.setValue({ currentPassword: 'Temp1234!', newPassword: 'NewPassword123!' });
    fixture.componentInstance.onSubmit();

    httpMock.expectOne('/api/associates/me/password').flush(null);
    httpMock.expectOne('/api/company/setup-state').flush({
      steps: [],
      canGoLive: true,
      launchedAt: '2026-01-01T00:00:00Z'
    });

    expect(router.navigate).toHaveBeenCalledWith(['/settings']);
  });
```

- [ ] **Step 2: Run the spec to verify it fails**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include=frontend/src/app/auth/change-password.component.spec.ts`
Expected: FAIL — the two updated assertions don't match the component's current (unfixed) navigation calls.

- [ ] **Step 3: Fix the component**

In `frontend/src/app/auth/change-password.component.ts`, add this import alongside the existing `ADMIN_FAMILY_ROLES` import:

```typescript
import { postAuthLandingPath } from './post-auth-redirect';
```

Replace this block inside `onSubmit`'s `next` handler:

```typescript
        if (role && ADMIN_FAMILY_ROLES.has(role)) {
          this.setupService.getState().pipe(take(1)).subscribe(state => {
            if (!state.launchedAt) {
              this.router.navigate(['/setup', this.setupService.firstIncompleteStepPath(state)]);
            } else {
              this.router.navigate([role === 'ADMIN' ? '/admin/associates/new' : '/dashboard']);
            }
          });
          return;
        }
```

with:

```typescript
        if (role && ADMIN_FAMILY_ROLES.has(role)) {
          this.setupService.getState().pipe(take(1)).subscribe(state => {
            this.router.navigate([postAuthLandingPath(role, state, this.setupService.firstIncompleteStepPath(state))]);
          });
          return;
        }
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `npx ng test --watch=false --browsers=ChromeHeadless --include=frontend/src/app/auth/change-password.component.spec.ts`
Expected: PASS, all specs in the file green.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/auth/change-password.component.ts frontend/src/app/auth/change-password.component.spec.ts
git commit -m "fix(auth): send non-ADMIN admin-family forced-password-change flow to /settings"
```

---

### Task 5: Full frontend suite + follow-up doc cleanup

**Files:**
- Modify: `docs/follow-ups/2026-08-03-admin-dashboard-dead-end-no-rank.md` (mark resolved)

**Interfaces:**
- None — this task only verifies and closes the loop.

- [ ] **Step 1: Run the full frontend test suite**

Run: `npx ng test --watch=false --browsers=ChromeHeadless`
Expected: PASS, 0 failures, including all specs touched in Tasks 1-4 plus every pre-existing spec (regression check).

- [ ] **Step 2: Mark the follow-up doc resolved**

In `docs/follow-ups/2026-08-03-admin-dashboard-dead-end-no-rank.md`, change:

```markdown
**Status:** Open
```

to:

```markdown
**Status:** Resolved — see docs/superpowers/specs/2026-08-03-admin-dashboard-redirect-fix-design.md
```

- [ ] **Step 3: Commit**

```bash
git add docs/follow-ups/2026-08-03-admin-dashboard-dead-end-no-rank.md
git commit -m "docs: mark admin-dashboard-dead-end follow-up resolved"
```
