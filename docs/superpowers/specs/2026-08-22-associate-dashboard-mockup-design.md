# Associate Dashboard — Mockup Implementation Design

**Date:** 2026-08-22
**Status:** Approved by user (three scope questions resolved 2026-08-22, no items remain unresolved)
**Source:** Claude Design project `f23f1fd3-0361-4c08-b5b2-7133f17e1fac`, `Viraj Acres Dashboard.dc.html`, option 1a ("Associate — seal-led hierarchy, roomy")

## 1. Problem

The mockup redraws `/dashboard` as one no-scroll screen: a page-header row, a Seal Card hero for current-cycle income, a 4-tile KPI row, and a two-column panel row (Recent Sales table left; Network Growth chart, KYC network summary, and quick actions stacked right). It explicitly collapses "12 equal tiles from the current build" into this shape.

This supersedes `docs/superpowers/specs/2026-08-17-associate-dashboard-parity-design.md`, which built the current 9-widget, 12-tile stack on purpose to match a competitor reference recording (Samvardhani `member/dashboard.php`) — leg volume (new/carried-forward/lifetime per leg), per-leg L/R associate counts, team snapshot, rank progress, announcements. That data has no home elsewhere in the app once removed here (confirmed: `/my-tree` shows only visible-tree-node stats, not team-wide snapshot numbers or carried-forward volume; `/rewards` duplicates rank-progress only). The user was shown this conflict directly and confirmed dropping the parity-spec content anyway, in favor of matching the mockup exactly. This is a deliberate reversal of that spec's intent, not an oversight.

Three concrete mismatches between the mockup and the real data model were also resolved with the user before this design was written:

- The mockup's Recent Sales status pills (Registered / EMI active / Booking) don't correspond to any field — `Sale.status` is only `RECORDED`/`VOIDED`. **Resolved:** show `RECORDED`/`VOIDED` as the pill (2-state, not 3-state).
- The Seal Card's "TARGET ₹2.5L / 75%" column has no backing metric anywhere (not `RankProgress.volumeToNextRank`, a different unit and meaning). **Resolved:** drop the column.
- The mockup's Withdraw / +Record Sale / +Provision Associate buttons have no associate-facing backend route — those are admin-only actions today (`wallet-card`/`quick-actions` already say "contact admin", per `issues.md` M3, `2026-08-17` spec §2). **Resolved:** keep them inert, restyled only.

## 2. Scope Decisions

- **In scope:** full mockup layout for `/dashboard`; new backend fields for income trend/delta, sales-this-cycle, revenue-booked, network growth history, downline KYC breakdown; extending `SaleResponse` with plot/project display fields; three new frontend widgets; restyling the widgets that survive; deleting the widgets that don't.
- **Removed from `/dashboard` entirely, no replacement:** `leg-volume-gauge`, `team-snapshot`, `announcements-strip`, the standalone `cycle-countdown` widget (its content is absorbed into the page-header subtitle, not dropped), and the dashboard's own `rank-progress` instance (still lives at `/rewards`). Confirmed with the user against the §1 parity-spec conflict.
- **`DashboardResponse.legVolume` / `.teamSnapshot` fields removed** — no frontend consumer left after the widget removals above. `LegVolumeSummary`/`TeamSnapshot` types and their backing `DashboardService` computations (lifetime left/right business, carried-forward, per-leg counts, `newBookedAreaSqft`) are deleted, not just unrendered.
- **Out of scope: global chrome.** The Ink top bar (logo, nav, logout) is shared app-wide (`app.component.html`/`_app-shell.scss`) and already matches DESIGN.md — untouched. The mockup's user-avatar-in-header is not adopted; associate identity (avatar, name, rank badge, ID) renders in the Parchment page-header row instead, same as it does today via `associate-identity-header`, just restyled into a compact right-aligned block rather than a left-column detail list.
- **Out of scope: self-service actions.** No new record-sale, provision-associate, or withdraw-request endpoints. Matches the 2026-08-17 spec's existing resolution of this exact question.
- **Out of scope: Sale deal-stage lifecycle.** No `sale_stage` column/migration. Matches the RECORDED/VOIDED resolution above.

## 3. Architecture

No new microservice or table. Extends `dashboard`, `sales`, and `associate` in place; no migration (every new field is a derived aggregate over existing columns).

### 3.1 Backend

`DashboardResponse` (`backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java`):

| Change | Type | Source |
|---|---|---|
| Remove `legVolume`, `teamSnapshot` | — | no consumer after §2 |
| `CycleIncome.previousCycleTotalIncome` (new field) | `BigDecimal` | `ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, latestClosedCycle.id)` — `DashboardService` already fetches `latestClosedCycle` for the (now-removed) leg-volume read, so this is a reused lookup, not a new query |
| `CycleIncome.incomeTrend` (new field) | `List<BigDecimal>` | one `sumNetAmountByAssociateAndCycle` call per cycle, over the last 8 cycles from `cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 8))` reversed to chronological order |
| `SalesSummary` (new top-level record: `int salesThisCycle, BigDecimal revenueBookedThisCycle, BigDecimal revenueBookedChangePct`) | — | two new `SaleRepository` methods mirroring the existing `sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus` shape: `countByAssociateIdAndCycleIdAndStatus`, `sumAmountByAssociateIdAndCycleIdAndStatus`. Change-% computed the same `latestClosedCycle` vs current-`cycle` comparison as the income delta above, `RECORDED` sales only |
| `networkGrowth` (new top-level field) | `List<NetworkGrowthPoint(String cycleLabel, long downlineCount)>` | new `AssociateRepository.countDownlineJoinedBefore(associateId, Instant cutoffExclusive)`, same recursive-CTE shape as `countDownlineByPosition` with `a2.joined_at < :cutoffExclusive` added — called once per cycle over the same last-8-cycles list as `incomeTrend`, cutoff = each cycle's `periodEnd + 1 day` (exclusive-upper-bound convention, matching `countJoinedBetween`) |
| `kycBreakdown` (new top-level field) | `KycBreakdown(long verified, long pending, long rejected)` | new `AssociateRepository.countDownlineByKycStatus(associateId, KycStatus)`, same CTE shape joined to `a2.kyc_status = :kycStatus`, called 3x |

`SaleResponse` (`backend/src/main/java/com/plotchain/sales/SaleResponse.java`) gains `plotNo` and `projectName`, resolved in `SaleService` by joining `Plot` (already has `plotNo`) → `Project` (`name`) off `sale.plot_id`. `AssociateSaleController`'s existing `GET /api/associates/me/sales?size=5` route is reused as-is for Recent Sales — no new endpoint.

### 3.2 Frontend

`dashboard-response.model.ts` mirrors the above: drop `LegVolumeSummary`/`TeamSnapshot`; add `previousCycleTotalIncome`, `incomeTrend` to `CycleIncome`; add `SalesSummary`, `NetworkGrowthPoint[]`, `KycBreakdown` to `DashboardResponse`.

`dashboard.component.ts` template, top to bottom:

1. **Page-header row** (new markup in the component itself, no new widget) — Fraunces "Dashboard" title + `Cycle {id} · closes in N days` subtitle, left; rank badge + `ID {associateId}` caption, right. Reads `d.associate`/`d.cycleCountdown` directly.
2. **`kyc-banner`** — unchanged behavior, restyled only.
3. **`cycle-income-card`** (the existing Seal Card, per DESIGN.md §5) — add the delta caption and trend sparkline described in §3.1; existing direct/matching/sponsor-matching/self-performance/royalty breakdown and animated hairline draw stay exactly as they are.
4. **KPI tile row** — 4× `app-stat-tile` (`shared/components/stat-tile`, same component `admin-dashboard` uses): Wallet Balance (folds in `wallet-card`'s figure, "Withdraw" stays inert caption text), Network (`d.teamSnapshot`'s replacement figure: `networkGrowth` last point, or a lighter live `totalDownline` figure — see open question below), Sales This Cycle, Revenue Booked This Cycle (+ change-% hint).
5. **Two-column panel row:**
   - Left: new `RecentSalesTableComponent` (`dashboard/widgets/recent-sales-table/`) — calls `GET /api/associates/me/sales?size=5` directly (own service call, not threaded through `DashboardResponse`), renders plot/project/amount/date/status.
   - Right, stacked: new `NetworkGrowthChartComponent` (`dashboard/widgets/network-growth-chart/`) — bar chart off `d.networkGrowth`, same inline-SVG technique `cycle-income-card`'s sparkline and admin's charts already use, no charting library. New `KycNetworkSummaryComponent` (`dashboard/widgets/kyc-network-summary/`) — inert 3-figure bar off `d.kycBreakdown`. `quick-actions` — restyled to the mockup's two-button row, content unchanged (still inert).
6. **Deleted components:** `leg-volume-gauge`, `rank-progress` (dashboard instance), `team-snapshot`, `announcements-strip`, `cycle-countdown` (folded into the page-header, per above — the component file itself is deleted, not just unused).

New `frontend/src/styles/_dashboard.scss` partial for the grid/table/bar-chart rules this layout needs; no changes to `_tokens.scss` or the shared `.seal-card`/`.stat-tile` primitives.

**Open question for the implementer to resolve against the mockup, not blocking this spec:** the mockup's "NETWORK" KPI tile shows a live total (`42 · 8 direct · 34 downline`), while `networkGrowth` above is an 8-point historical series for the chart. The KPI tile should use a fresh live `totalDownline`/`directCount` figure (a cheap `countDownline`/`countByParentId`-style call, both already exist), not the chart's last historical point — call this out explicitly in the implementation plan rather than reusing `networkGrowth[7]`, since the two only usually agree if the chart cutoff computation rounds to "now."

## 4. Error Handling

Unchanged pattern: single `loadError` boolean + i18n banner on the main `DashboardService.getDashboard()` call. `RecentSalesTableComponent`'s own `GET /api/associates/me/sales` call gets its own small inline error/empty state (page-scoped 5-item component, not resurfaced against the dashboard's top-level error banner) — same isolation `announcements-strip` used to have as a separate widget.

## 5. Testing

- Backend: extend `DashboardServiceTest`/`DashboardControllerTest` for every new field (including the zero-sales-this-cycle, zero-downline, no-previous-closed-cycle-yet cases) and delete the now-gone leg-volume/team-snapshot assertions. New `AssociateRepository`/`SaleRepository` query methods each get a unit test, same pattern as the existing `countDownlineByPosition`/`sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus` tests. Extend `SaleServiceTest`/`AssociateSaleControllerTest` for the new `plotNo`/`projectName` fields.
- Frontend: new specs for `RecentSalesTableComponent`, `NetworkGrowthChartComponent`, `KycNetworkSummaryComponent`. Update specs for `cycle-income-card` (delta/sparkline), `dashboard.component.spec.ts` (new layout, removed widgets). Delete specs for the five removed components.
- No Playwright e2e — deferred per standing project decision (all 12 setup-onboarding phases first, unrelated to this spec). Styling verified by manual run-through per the `run` skill.

## 6. Migration Note

None. Every new field is a derived aggregate over existing columns (`associate.joined_at`, `associate.kyc_status`, `sale.amount`/`status`/`cycle_id`, `ledger_entry`, `plot.plot_no`, `project.name`). `V1__create_dashboard_tables.sql` and later sale/plot migrations are untouched.
