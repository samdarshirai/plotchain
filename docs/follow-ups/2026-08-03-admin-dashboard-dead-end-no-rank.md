# Follow-up: Admin lands on a broken, nav-less Dashboard with no way back into Settings

**Filed:** 2026-08-03
**Source:** Manual admin walkaround of the running app (login as `admin` / `Password123!`, headless Playwright driving `http://localhost:4200`), requested to see the app from a user's perspective.
**Status:** Open

## What's wrong

`{ path: '', redirectTo: '/dashboard', pathMatch: 'full' }` (`frontend/src/app/app.routes.ts`) sends any authenticated user hitting `/` to `DashboardComponent`, with no role check. For an ADMIN-role user (e.g. the seeded `admin` account, `associate.rank_id = NULL`, no rank/downline/wallet data — admins aren't MLM participants), this always fails:

`DashboardService.getDashboard` (`backend/src/main/java/com/plotchain/dashboard/DashboardService.java:68-70`) throws `NoRankAssignedException` when the associate's `rank_id` is null, which `DashboardExceptionHandler` maps to `409 Conflict`. `DashboardComponent.ngOnInit` (`frontend/src/app/dashboard/dashboard.component.ts:45-49`) treats *any* error identically — sets `error = true` — and renders a single generic line: "Something went wrong loading your dashboard. Please try again." (`dashboard.loadError` i18n key).

The page has no header, sidebar, or breadcrumb — just that error banner and a "Log Out" button. An admin who lands here (fresh login, or just navigating to `/`) has no in-app way to reach `/settings` or anything else short of manually editing the URL.

## Why this matters

This isn't a rare edge case — it's the default post-login destination for the seeded admin account, and there's no role-based redirect guarding it. Every admin session is one `/` visit away from a dead end.

## Suggested fix

Pick one (not mutually exclusive):
1. **Redirect by role.** In `authGuard`/`adminGuard` or a new root resolver, send ADMIN-role users to `/settings` (or `/admin/associates/new`) instead of `/dashboard`; reserve `/dashboard` for ASSOCIATE-role users who actually have rank/wallet/downline data.
2. **Give Dashboard a real shell.** Add the same persistent nav other settings screens get, so even a broken widget load leaves a way out.
3. **Have the backend return something dashboard-renderable for admins** (e.g. `204`/empty payload) instead of `409`, if admins are meant to ever see this page — but combined with (1) this may be unnecessary.

## Suggested scope

Small: likely just a guard/redirect change (option 1) plus maybe wrapping `DashboardComponent`'s template in the settings shell for defense-in-depth. No backend change needed if (1) is taken alone.
