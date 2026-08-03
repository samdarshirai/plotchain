# Follow-up: No global nav — Dashboard and Provision-Associate have no way to reach Settings

**Filed:** 2026-08-03
**Source:** Manual admin walkaround of the running app (login as `admin` / `Password123!`, headless Playwright driving `http://localhost:4200`), requested to see the app from a user's perspective.
**Status:** Open

## What's wrong

`AppComponent`'s template (`frontend/src/app/app.component.html`) renders exactly one global chrome element for authenticated, non-chromeless routes:

```html
<header class="app-header" *ngIf="authService.isAuthenticated() && !isChromelessRoute">
  <button type="button" class="logout" (click)="onLogout()">{{ 'auth.logout' | translate }}</button>
</header>
```

That's it — no nav links, no menu, nothing but Log Out. Each area of the app instead owns its own scoped navigation, and none of them link to any other area:

- `/settings/*` — `SettingsNavRailComponent` gives a sidebar, but only lists the settings sections themselves (Company Profile, Branding, ... Audit Log). Nothing links back out to Dashboard or Provision Associate.
- `/setup/*` — `SetupHeaderComponent` / `setup-step-nav` gives step-by-step navigation, scoped to the 8 setup steps only.
- `/dashboard` and `/admin/associates/new` (chromeless route, no header at all per `AppComponent.isChromelessRoute`) — no navigation of any kind.

Confirmed by grep: `routerLink`/path references to `/settings` exist only inside `settings-nav-rail.component.ts`, `settings-overview.component.ts`, `setup.guard.ts`, and `setup-step-nav.component.ts` — no component outside `/settings` itself links into it.

## Why this matters

An admin who lands on `/dashboard` (the default post-login redirect, see [[2026-08-03-admin-dashboard-dead-end-no-rank]]) or on `/admin/associates/new` has no in-app affordance to get to Settings, Associate Directory, KYC Queue, or anywhere else — the only button on screen is Log Out. The Settings nav rail itself is a closed loop: once in, an admin can move between settings sections but can't get back to Dashboard or Provision Associate without typing a URL.

This is broader than the dashboard 409 bug filed separately: even with a healthy dashboard, there'd still be no way to navigate anywhere else from it.

## Suggested fix

Add real navigation to the global `app-header` (Dashboard / Provision Associate / Settings, gated by role same as the routes already are via `adminGuard`), so it functions as an actual top nav rather than just a logout bar. `/setup` and `/admin/associates/new` are deliberately chromeless/step-scoped per the comment in `app.component.ts` — worth deciding explicitly whether Provision Associate should gain a way back to Settings, or stay a deliberate one-way flow.

## Suggested scope

Small-to-medium: primarily `app.component.html`/`.ts` (add nav markup + role-gated visibility), no backend change. Decide navigation-item set and target routes before implementing — this is a UX/IA decision, not just a mechanical fix.
