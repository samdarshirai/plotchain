# Admin Dashboard — Mockup Implementation Design

**Date:** 2026-08-23
**Status:** Approved by user (scope confirmed 2026-08-23, no items remain unresolved)
**Source:** Same visual template as `docs/superpowers/specs/2026-08-22-associate-dashboard-mockup-design.md` (the "Viraj Acres Dashboard.dc.html" option 1a layout) — no separate admin mockup exists; this spec adapts that layout to admin-scoped data rather than porting a literal second mockup file.

## 1. Problem

`/admin/dashboard` (`AdminDashboardComponent`) still uses its pre-mockup structure: a plain page title, a 4-tile KPI row, a "Current Cycle" section (Seal Card + 5 tiles), a KYC breakdown row, a pending-withdrawals tile, and a quick-actions row — each in its own full-width section, stacked vertically, no two-column layout.

This supersedes **D6** of `docs/superpowers/specs/2026-08-22-settings-design-parity.md`, which deliberately kept this structure and added only one Seal Card for current-cycle income ("a positive requirement to add one, not permission to replace the rest of the console with it"). The user was shown this conflict directly and confirmed reversing it — full structural rebuild around the same layout the associate dashboard just got, not just the one-Seal-Card patch. D6's actual substance (exactly one Seal Card per screen, current-cycle income, `DESIGN.md` §5) is preserved; only the surrounding layout changes.

Three concrete differences from the associate rebuild, resolved with the user before this design was written:

- **Quick Actions stay real links, not inert spans.** The associate dashboard's Record Sale / Provision Associate buttons are inert because no associate-facing backend route exists. Admin's equivalent buttons already route to real, working pages (`/admin/sales/new`, `/admin/associates/new`) — `AdminDashboardComponent` already has them as `routerLink`s today. The rebuild keeps them as real `<a>` links styled to match the mockup's two-button block; only the associate side's "no backend route" reasoning for inertness does not apply here.
- **Recent Sales needs an Associate column the associate version doesn't.** The associate dashboard's Recent Sales table is implicitly "your own sales" — no associate column needed. Admin's version is network-wide, so each row needs to say *whose* sale it is. `SaleResponse` doesn't carry that today (only `associateId`, a bare UUID) — resolved by adding `associateUserId`/`associateName` fields, the same naming and batch-resolution pattern `AdminLedgerEntryResponse`/`AdminWithdrawalResponse` already use (`LedgerService.associatesById`).
- **Network Growth has no per-caller downline to chart.** The associate version charts the caller's own downline growth (`AssociateRepository.countDownlineJoinedBefore`, scoped to one associate's subtree). Admin has no such scope — the org-wide equivalent is total associate count over time. Resolved: a new org-wide `AssociateRepository.countByRoleAndJoinedBefore` query, unscoped by parent/sponsor.

Also fixed in passing, since it's a real existing gap the rebuild's KPI tiles create room for: `AdminStatsResponse` already carries `activePlots`, `totalSalesRecorded`, and `cyclesCompleted`, but `AdminDashboardComponent`'s current template never renders any of the three. The rebuild surfaces them as hint text on the KPI tiles that already exist, rather than growing the tile count past four: Total Associates → "{cyclesCompleted} cycles completed"; Sales This Cycle → "{totalSalesRecorded} ever recorded"; Revenue This Cycle → "{activePlots} plots still available". Total Wallet Balance keeps no hint, matching the associate dashboard's own pattern of not every tile needing one.

## 2. Scope Decisions

- **In scope:** full mockup-style layout for `/admin/dashboard`; new backend fields for income trend/delta (network-wide) and associate-count growth history; extending `SaleResponse` with associate display fields; a new admin-scoped Recent Sales list; three new frontend widgets (mirroring the associate ones, admin-scoped); restyling the KPI tiles and quick-actions row; deleting the old section-by-section markup.
- **Not touched: `AdminStatsResponse`'s existing consumers.** `totalAssociates`, `totalWalletBalance`, `pendingWithdrawals`, `kycBreakdown`, and `currentCycle`'s existing fields keep their current meaning — only new fields are added, nothing renamed or removed, so no other consumer of `GET /api/admin/stats` breaks. (Currently the only consumer is `AdminDashboardComponent` itself, but the response shape is treated as a stable contract regardless.)
- **Not touched: `SalesRegisterComponent` (`/settings/sales-register`).** It has the same "no associate column" gap `SaleResponse`'s extension fixes, but that screen is out of scope here — it isn't part of the admin dashboard, and the fix (wiring the new `associateUserId`/`associateName` fields into its existing `EditableTableComponent` columns) is a separate, smaller follow-up, not bundled into this plan.
- **Out of scope: global chrome.** The Ink top bar is shared app-wide and already matches `DESIGN.md` — untouched.
- **Out of scope: self-service actions beyond what already exists.** Record Sale / Provision Associate already route to real pages; no new endpoints, no new routes.
- **Out of scope: the four operational screens' own design-parity fix list** (items 1–20+ in `2026-08-22-settings-design-parity.md`) — separate work, unrelated to this screen.

## 3. Architecture

No new microservice or table. Extends `stats` and `sales` in place; no migration (every new field is a derived aggregate over existing columns).

### 3.1 Backend

`AdminStatsResponse` (`backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java`):

| Change | Type | Source |
|---|---|---|
| `CurrentCycleStats.previousCycleTotalIncome` (new field) | `BigDecimal` | `ledgerEntryRepository.sumNetAmountByCycle(latestClosedCycle.id)` — `AdminStatsService` doesn't currently fetch the latest closed cycle at all; this is a new `cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)` read, same call `DashboardService` already makes on the associate side |
| `CurrentCycleStats.incomeTrend` (new field) | `List<BigDecimal>` | one `ledgerEntryRepository.sumNetAmountByCycle(cycleId)` call per cycle (already used, unscoped — no per-associate version needed here) over the last 8 cycles from `cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 8))` reversed to chronological order, same pattern `DashboardService` uses |
| `networkGrowth` (new top-level field) | `List<NetworkGrowthPoint(String cycleLabel, long associateCount)>` | new `AssociateRepository.countByRoleAndJoinedBefore(AssociateRole role, Instant cutoffExclusive)` — org-wide, unscoped by parent/sponsor, same `WHERE a.role = :role AND a.joinedAt < :cutoffExclusive` shape as the existing `countByRoleAndJoinedBetween`. Called once per cycle over the same last-8-cycles list as `incomeTrend`, cutoff = each cycle's `periodEnd + 1 day` (exclusive-upper-bound convention, matching `countByRoleAndJoinedBetween`'s own `end`). `cycleLabel` uses the same month-of-`periodStart` format `DashboardService.CYCLE_LABEL_FORMAT` already established (`"MMM"`, e.g. `"Aug"`) — no new formatting convention. |
| `recentSales` (new top-level field) | `List<SaleResponse>` | `saleService.list(null, null, null, null, 0, 5)` (all filters null = unfiltered, admin-wide, `searchRegister`'s existing `ORDER BY recordedAt DESC`), `.sales()` — `AdminStatsService` gains a `SaleService` dependency for this one call |

`SaleResponse` (`backend/src/main/java/com/plotchain/sales/SaleResponse.java`) gains `associateUserId` and `associateName`, resolved the same way `LedgerService.associatesById` already resolves them for `AdminLedgerEntryResponse` — a batch `associateRepository.findAllById(distinctAssociateIds)` in `SaleService.toResponses`'s existing batch-lookup path (same shape as the existing `plotsById`/`projectNamesByProjectId` maps). `SaleService.toResponse(sale, plot)` (the single-sale path `recordSale`/`voidSale` use) resolves the associate directly: `recordSale` already has `associate` loaded in scope (reused, no new query); `voidSale` doesn't load an `Associate` today and gains one `associateRepository.findById(sale.getAssociateId())` read — a single lookup, not a batch, so no N+1 concern.

`AdminStatsController`'s existing `GET /api/admin/stats` route is reused as-is — no new endpoint, no route change.

### 3.2 Frontend

`admin-dashboard.model.ts` mirrors the above: add `previousCycleTotalIncome`, `incomeTrend` to `CurrentCycleStats`; add `NetworkGrowthPoint[]`, `recentSales: Sale[]` (reusing the existing `Sale` model from `admin/models/sale.model.ts`, now carrying `associateUserId`/`associateName`) to `AdminStatsResponse`.

`admin-dashboard.component.ts` template, top to bottom:

1. **Page-header row** (new markup in the component itself) — Fraunces "Dashboard" title + subtitle, matching the associate page-header's shape but without a per-user name/rank block (admin has no personal rank/ID to show here) — just the title/subtitle pair.
2. **Seal Card** (existing `app-seal-card`, current-cycle Total Income) — add the delta caption and trend sparkline, same markup/logic `cycle-income-card` uses on the associate side.
3. **KPI tile row** — same 4 `app-stat-tile`s that exist today (Total Associates, Total Wallet Balance, Sales This Cycle, Revenue This Cycle), with `activePlots`/`totalSalesRecorded`/`cyclesCompleted` folded in as hint text per §1.
4. **Two-column panel row:**
   - Left: new `AdminRecentSalesTableComponent` (`admin-dashboard/widgets/recent-sales-table/`) — renders off `s.recentSales` (already on the single `GET /api/admin/stats` response, no separate HTTP call — unlike the associate side's isolated-fetch design, see §4), columns Plot / Project / **Associate** / Value / Date / Status.
   - Right, stacked: new `AdminNetworkGrowthChartComponent` (`admin-dashboard/widgets/network-growth-chart/`) — bar chart off `s.networkGrowth`, same inline-SVG technique as the associate side's `NetworkGrowthChartComponent`. KYC breakdown — reuse the associate side's `KycNetworkSummaryComponent` directly (its `KycBreakdown` `@Input` shape is `{verified, pending, rejected}` by field name; `AdminStatsResponse.KycBreakdown`'s JSON serializes with the same three field names regardless of the Java record's constructor argument order, so no adapter is needed) restyled into the same 3-pill treatment. Quick Actions — restyle the existing Record Sale / Provision Associate `routerLink`s into the mockup's two-button block, kept as real links per §1.
5. **Deleted:** the old `.admin-dashboard__cycle` section (title + Period/Days Remaining/Direct Income/Matching Income/New Associates tiles) and the old standalone KYC-breakdown/pending-withdrawals section wrappers. Period/Days Remaining fold into the Seal Card's caption text (mirroring the associate page-header's "closes in N days" subtitle); Direct Income/Matching Income/New Associates have no home in the new layout and are dropped — they duplicate the Seal Card's own income figure and the KPI row's Total Associates/Sales tiles closely enough that carrying all three forward would just be three more numbers restating what's already on screen. Pending Withdrawals folds into the panel row as a `stat-tile` inside the Quick Actions block, linking to `/settings/payout-approval` exactly as it does today.

`_admin.scss`'s existing `.admin-dashboard*` block (`_admin.scss:3535`–`3596`, ~60 lines) is replaced in place with the new layout's rules — kept inline in `_admin.scss` (not extracted to a separate partial, unlike the associate side's new `_dashboard.scss`), since `_admin.scss` already houses every other admin screen's styles together and this block is small enough not to warrant its own file.

## 4. Error Handling

Unchanged top-level pattern: single `loadError` boolean + i18n banner on `AdminStatsService.getStats()`. Recent Sales does **not** get the associate side's isolated separate-HTTP-call treatment — it rides on the same single `GET /api/admin/stats` response as everything else on this screen, so a Recent Sales data problem is a whole-dashboard data problem here (there's no meaningful "rest of the admin dashboard loaded fine" state when the one API call it all comes from failed). This is a deliberate difference from the associate design, not an oversight.

## 5. Testing

- Backend: extend `AdminStatsServiceTest`/`AdminStatsControllerTest` for every new field (including the zero-associates-this-cycle, no-previous-closed-cycle-yet, and empty-recent-sales cases). New `AssociateRepository.countByRoleAndJoinedBefore` gets a unit test, same pattern as the existing `countByRoleAndJoinedBetween` test. Extend `SaleServiceTest`/`SaleControllerTest`/`AssociateSaleControllerTest` for the new `associateUserId`/`associateName` fields (including `recordSale`'s reused-associate path and `voidSale`'s new lookup path).
- Frontend: new specs for `AdminRecentSalesTableComponent`, `AdminNetworkGrowthChartComponent` (or, if reused directly, extended specs for the associate versions' now-shared component). Update `admin-dashboard.component.spec.ts` for the new layout and the deleted section markup.
- No Playwright e2e — deferred per standing project decision, same as the associate spec. Styling verified by manual run-through per the `run` skill.

## 6. Migration Note

None. Every new field is a derived aggregate over existing columns (`ledger_entry`, `associate.role`/`joined_at`, `sale.*`). No migration file is touched.
