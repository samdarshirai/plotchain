# Admin-family dashboard dead-end: role-aware post-auth redirect

**Date:** 2026-08-03
**Source follow-up:** [docs/follow-ups/2026-08-03-admin-dashboard-dead-end-no-rank.md](../../follow-ups/2026-08-03-admin-dashboard-dead-end-no-rank.md)
**Status:** Approved, ready for implementation plan

## Problem

Three call sites route an authenticated user toward `/dashboard` without checking whether that role has rank/wallet/downline data to render:

- `app.routes.ts` root path (`{ path: '', redirectTo: '/dashboard', pathMatch: 'full' }`) — no role check at all.
- `login.component.ts` post-login — checks role via `ADMIN_FAMILY_ROLES`, but only special-cases `ADMIN` (→ `/admin/associates/new`); every other admin-family role falls through to `/dashboard`.
- `change-password.component.ts` post-change — identical duplicated branch, same gap.

`DashboardService.getDashboard` (`DashboardService.java:68-70`) throws `NoRankAssignedException` (mapped to `409`) whenever `associate.rank_id` is null. Per `chk_associate_rank_required` (`V4__user_id_login_and_admin_roles.sql:33`), only `ASSOCIATE` role is required to have a `rank_id` — so this isn't ADMIN-only, it's every admin-family role (`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`) that hasn't been assigned one. Any of them hitting `/dashboard` through these three paths 409s into `DashboardComponent`'s generic error banner.

Global nav (already shipped in `f4ff1e6`) means this is no longer a total dead end — the header's Dashboard/Provision Associate/Settings links give a way out even from the error state. This spec fixes the redirect logic itself so admin-family users don't land on a broken page to begin with.

## Decisions

1. **Fix all three call sites**, not just the root path, via one shared function — the bug is identical in shape at each site, so a single fix point prevents the fourth copy-paste recurrence.
2. **Non-ADMIN admin-family landing page: `/settings`.** `ADMIN` keeps its existing `/admin/associates/new` destination; `/settings` is reachable by every admin-family role (`adminGuard` + `launchedModeGuard`) and is the generic admin home, unlike a provisioning-specific route.
3. **`DashboardComponent`'s error banner is untouched.** With the redirect fixed, admin-family only reaches `/dashboard` by manually editing the URL — an edge case not worth special-casing the 409 response for.
4. **Root path becomes guard-driven, not a static redirect**, since the destination now depends on role and (for admin-family) setup-launch state — the same two things `login.component.ts` already branches on.

## Design

> The shipped code evolved during implementation per fix-round and final-review findings (notably: `rootRedirectGuard` gained an `ADMIN_FAMILY_ROLES` short-circuit before touching setup state, and `postAuthLandingPath`'s `incompleteStepPath` parameter became a lazy thunk) — the code blocks below are illustrative of the original design intent, not the literal final diff.

### Shared decision function

New file `frontend/src/app/auth/post-auth-redirect.ts`:

```ts
export function postAuthLandingPath(role: string, state: SetupStateResponse, incompleteStepPath: string): string {
  if (!ADMIN_FAMILY_ROLES.has(role)) return '/dashboard';
  if (!state.launchedAt) return `/setup/${incompleteStepPath}`;
  return role === 'ADMIN' ? '/admin/associates/new' : '/settings';
}
```

Pure function, no DI — callers resolve `role`, `state` (from `setupService.getState()`), and `incompleteStepPath` (from `setupService.firstIncompleteStepPath(state)`) themselves, matching how each call site already sources these values.

### Call site changes

- `login.component.ts`: inside the existing `ADMIN_FAMILY_ROLES.has(response.role)` branch, replace the `if (!state.launchedAt) {...} else {...role === 'ADMIN' ? ... : '/dashboard'}` block with `this.router.navigate([postAuthLandingPath(response.role, state, this.setupService.firstIncompleteStepPath(state))])`.
- `change-password.component.ts`: same replacement, same shape, using `role` from `authService.getRole()`.
- `app.routes.ts`: root path changes from
  ```ts
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' }
  ```
  to
  ```ts
  { path: '', pathMatch: 'full', canActivate: [authGuard, rootRedirectGuard], children: [] }
  ```
  New `frontend/src/app/auth/root-redirect.guard.ts`, following the existing `setupModeGuard`/`launchedModeGuard` Observable pattern (`setup.guard.ts`):
  ```ts
  export const rootRedirectGuard: CanActivateFn = (): Observable<UrlTree> => {
    const authService = inject(AuthService);
    const setupService = inject(SetupService);
    const router = inject(Router);
    const role = authService.getRole()!;
    return setupService.getState().pipe(
      map(state => router.parseUrl(postAuthLandingPath(role, state, setupService.firstIncompleteStepPath(state))))
    );
  };
  ```
  This guard always returns a `UrlTree` — it never renders the route itself, so `children: []` (rather than a component) satisfies Angular's route-config validation. Guards in a `canActivate` array do not run in sequence: Angular's router (`runCanActivateChecks`/`prioritizedGuardValue` in `@angular/router`) runs every guard concurrently via `combineLatest`, and only the *final decision* respects array order (the first non-`true` result wins). So an unauthenticated visit to `/` still bounces to `/login` exactly as it does today, but because `rootRedirectGuard` is safe to execute even when unauthenticated (its own `ADMIN_FAMILY_ROLES` check short-circuits before touching setup state) and `authGuard`'s `/login` redirect wins priority over whatever `rootRedirectGuard` would have returned — not because `authGuard` runs "first."

### Data flow

For a plain `ASSOCIATE`, behavior is unchanged: root path (and login/change-password) still lands on `/dashboard`, no setup-state check performed (`postAuthLandingPath` short-circuits on the `!ADMIN_FAMILY_ROLES.has(role)` check). For admin-family, the destination is now consistently: `/setup/<first incomplete step>` if not launched, else `/admin/associates/new` for `ADMIN` or `/settings` for every other admin-family role.

## Explicitly out of scope

- `DashboardComponent` / backend `DashboardService` error handling — no changes.
- Any change to what `/dashboard` itself renders or who can `canActivate` it directly — a manually-typed `/dashboard` URL by an admin-family user still 409s exactly as today; only the *automatic* redirect entry points are fixed.

## Testing

- Unit-test `postAuthLandingPath` directly: all 4 admin-family roles × launched/not-launched, plus the `ASSOCIATE` short-circuit.
- Update `login.component.spec.ts` and `change-password.component.spec.ts` for the corrected non-ADMIN admin-family destination (`/settings` instead of `/dashboard`).
- New `root-redirect.guard.spec.ts`, mirroring `setup.guard.spec.ts`'s style (mock `SetupService.getState()`, assert the resolved `UrlTree` per role/state combination).
- No e2e — per the project's e2e-testing-plan memory, Playwright stays deferred until all 12 setup-onboarding phases land.
