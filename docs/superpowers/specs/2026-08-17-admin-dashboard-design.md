# Admin Dashboard — Landing Screen Design

**Date:** 2026-08-17
**Status:** Approved by user, pending implementation planning

## 1. Problem

The platform has no admin-facing dashboard. `/dashboard` (`frontend/src/app/dashboard/dashboard.component.ts`) is associate-only — `DashboardService.getDashboard` (`backend/src/main/java/com/plotchain/dashboard/DashboardService.java:69-71`) throws `NoRankAssignedException` (mapped to `409`) whenever `associate.rank_id` is null, which is true for every admin-family account (only `ASSOCIATE` role is required to have a rank, per `chk_associate_rank_required`). This was already diagnosed in `docs/follow-ups/2026-08-03-admin-dashboard-dead-end-no-rank.md` and partially fixed in `docs/superpowers/specs/2026-08-03-admin-dashboard-redirect-fix-design.md`: admin-family users no longer 409 into a dead end, but they land on two different, dashboard-less screens instead —

- `ADMIN` role → `/admin/associates/new` (a form, not a home screen)
- every other admin-family role (`SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`) → `/settings` (a list of config cards: Company Profile, Branding, Compensation, etc.)

Neither destination answers the owner/admin's first question on login: *how is the business doing right now, and what needs my attention?* A `AdminStatsComponent` already exists (`frontend/src/app/settings/admin-stats/`) with basic KPI tiles (total associates, wallet balance, KYC breakdown, current-cycle income), but it's buried as a sub-tab at `/settings/admin-stats`, reachable only by clicking into the Settings nav rail — never the landing page.

Research basis: reviewed against the existing associate-dashboard design (`docs/superpowers/specs/2026-07-29-mlm-land-platform-gaps-dashboard-design.md` §8) and the same binary-MLM software patterns it cites (Epixel/GenSoftech admin panels typically lead with business-health KPIs, with actionable queues as a secondary strip). The project's own screen recording (`Screen Recording 2026-07-29 at 10.26.32.mov`) was checked for reference material and contains only the associate-side login/dashboard of a real competitor product (samvardhani.com) — no admin screen — so it informed the associate dashboard already built, not this design.

## 2. Scope Decisions

- **One shared dashboard for all admin-family roles** (`ADMIN`, `SUPER_ADMIN`, `FINANCE`, `KYC_REVIEWER`, `SUPPORT`) — not role-tailored widget sets. The team is small enough that role-based widget configuration is premature; every admin-family role gets the same landing page and navigates from there via the existing global nav.
- **Business stats lead, action queues follow.** KPI tiles and cycle health sit at the top; pending-approval counts (KYC, withdrawals) are a secondary strip below, each linking out to its existing queue screen rather than duplicating queue UI on the dashboard itself.
- **Sales/revenue volume is in scope**, not just compensation payout. The existing `AdminStatsResponse` only reports money paid out (direct/matching income); an owner's first question is usually "how much did we sell," so sales count and revenue for the current cycle are added.
- **New dedicated route, `/admin/dashboard`**, not a reuse of `/settings` or `/admin/associates/new`. Both post-auth redirect call sites (`login.component.ts`, `change-password.component.ts`) and the root guard (`rootRedirectGuard` / `postAuthLandingPath`) are updated so every admin-family role lands here — collapsing the current ADMIN-vs-rest split.
- **`/settings/admin-stats` is removed**, not kept as a duplicate. Its content moves to the new dashboard; the settings nav-rail entry for it goes away.

Explicitly out of scope:
- e-PIN, Support Ticket, and Announcements widgets — those domain specs are not yet built (per project tracking: epin/support-tickets/announcements are still not-started). Adding dashboard surface for subsystems that don't exist yet is scope creep; revisit once those specs land.
- Role-tailored dashboard variants — see scope decision above.
- Any change to the associate-side `/dashboard` or its backend `DashboardService` — untouched by this design.
- Leaderboards/gamification — consistent with the base dashboard design's existing stance (§3 of the 2026-07-29 doc).

## 3. Architecture

No new microservice or domain — this extends the existing `stats` and `dashboard` slices.

### 3.1 Backend

Extend `AdminStatsResponse` (`backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java`) with three new fields, populated by `AdminStatsService.getStats()`:

| Field | Source | Notes |
|---|---|---|
| `salesThisCycle` | `SaleRepository`, count of `status = RECORDED` sales where `cycleId` = current OPEN cycle | New repository query, same shape as existing `countBy*` methods |
| `revenueThisCycle` | `SaleRepository`, `SUM(amount)` over the same filter | New repository query, `COALESCE(..., 0)` like `WalletRepository.sumAllBalances()` |
| `pendingWithdrawals` | `WithdrawalRequestRepository`, count where `status = REQUESTED` | New repository query |

When there's no OPEN cycle, `salesThisCycle`/`revenueThisCycle` follow the same null/zero convention `currentCycle` already uses elsewhere in this response — `AdminStatsService.getStats()` does not throw in that case today and this addition must not change that.

No migration needed — `Sale.amount`/`cycleId`/`status` and `WithdrawalRequest.status` already exist as columns.

### 3.2 Frontend

New `AdminDashboardComponent` at `frontend/src/app/admin-dashboard/`, structured like the associate `DashboardComponent`: a thin container calling `AdminStatsService.getStats()` (relocated/reused from `settings/admin-stats/`), rendering widget child components. Reuses `StatTileComponent` (`shared/components/stat-tile/`), same as the current `AdminStatsComponent`.

Widget order, top to bottom:

1. **KPI tile row** — Total Associates · Total Wallet Balance · Sales This Cycle (count) · Revenue This Cycle (₹)
2. **Current cycle card** — period dates, days remaining, Direct/Matching/Total income paid out, new associates this cycle; empty-state ("no open cycle") when `currentCycle` is null, matching the existing `AdminStatsComponent` template's `noCycle` branch
3. **KYC breakdown strip** — Pending/Verified/Rejected tiles; Pending tile is a `routerLink` to `/settings/kyc-queue`
4. **Pending withdrawals tile** — count, `routerLink` to `/admin/withdrawals`
5. **Quick actions row** — "+ Record Sale" → `/admin/sales/new`, "+ Provision Associate" → `/admin/associates/new`; real `routerLink`s from the start (issues.md's M3 — dead quick-action buttons on the associate dashboard — is the cautionary precedent here, not a pattern to repeat)

### 3.3 Routing

- `frontend/src/app/auth/post-auth-redirect.ts`: `postAuthLandingPath` drops its `role === 'ADMIN' ? '/admin/associates/new' : '/settings'` branch in favor of a single `/admin/dashboard` for every admin-family role once `state.launchedAt` is true. The not-yet-launched branch (`/setup/<incomplete step>`) is unchanged.
- New route `{ path: 'admin/dashboard', component: AdminDashboardComponent, canActivate: [authGuard, adminGuard] }` in `app.routes.ts`, alongside the other `admin/*` routes.
- `frontend/src/app/settings/settings-nav-rail.component.ts`: remove the `adminStats` nav item. `frontend/src/app/app.routes.ts`: remove the `admin-stats` child route under `/settings`. `settings-section.model.ts`'s `SECTION_PATHS` loses the `adminStats` entry.

### 3.4 Data flow

Admin-family user completes login/change-password while `launchedAt` is set → `postAuthLandingPath` resolves `/admin/dashboard` → `AdminDashboardComponent.ngOnInit` calls the stats endpoint once → widgets render from the single `AdminStatsResponse` payload. No polling, no websockets — same one-shot-fetch pattern as every other screen in the app.

## 4. Error Handling

Same pattern as the current `AdminStatsComponent`: a `loadError` boolean set on fetch failure, rendering a generic i18n error banner (`settings.adminStats.loadError`, reused or renamed to an `adminDashboard.*` key). No 409/dead-end case exists for this screen — `AdminStatsService.getStats()` already tolerates the no-open-cycle state by returning `currentCycle: null` rather than throwing, and this design's new `salesThisCycle`/`revenueThisCycle` fields must follow that same no-throw convention.

## 5. Testing

- Backend: extend `AdminStatsServiceTest` and `AdminStatsControllerTest` for the three new response fields (with-open-cycle and no-open-cycle cases); new repository query methods get their own unit coverage.
- Frontend: new `AdminDashboardComponent` spec covering loading, error, and no-open-cycle states; update `post-auth-redirect.ts`'s spec for the collapsed admin-family landing path (all 4 roles × launched/not-launched); update `root-redirect.guard.spec.ts` accordingly; delete/relocate `AdminStatsComponent`'s existing spec coverage into the new component's spec rather than leaving it duplicated.
- No e2e — Playwright stays deferred until all 12 setup-onboarding phases land (standing project decision).

## 6. Migration Note

This removes a currently-shipped screen (`/settings/admin-stats`) and two currently-shipped redirect destinations (`/admin/associates/new` and `/settings` as landing pages). No data migration involved — purely routing and one settings sub-page removal.
