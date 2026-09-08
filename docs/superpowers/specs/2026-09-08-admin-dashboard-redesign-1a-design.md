# Admin Dashboard Redesign — Direction 1a ("The Ledger")

**Date:** 2026-09-08
**Status:** Approved by user (direction and scope confirmed 2026-09-08)
**Source:** Claude Design canvas project `727a7963-48fd-4153-a79b-4719aaefb999`, file `Admin Dashboard Redesign.dc.html`, option `1a` of a three-direction admin/finance dashboard redesign. The project's `support.js` is the Claude Design canvas-editor runtime, not a product file — nothing implemented from it.

## 1. Problem

`/admin/dashboard` (rebuilt per `2026-08-23-admin-dashboard-mockup-design.md`) shows 4 loose stat tiles, a growth chart, a KYC summary widget, and separate quick-action links. It surfaces data but asks nothing of the admin — there is no single place answering "what needs my attention right now."

The redesign canvas proposed three directions. **1a "The Ledger"** was chosen: a consolidated "NEEDS A DECISION" queue plus a payout-liability seal figure with its supporting numbers folded into one hairline-ruled block, network health, and inventory. Considered and rejected:
- **1b "Close the Cycle"** — single-purpose "can this cycle close" screen, essentially 1a's own empty-data state pulled out on its own; under-serves once the network has real volume (this platform runs 6-month cycles, so the dense-data case is the normal one, not the exception).
- **1c "The Plaque"** — brand-forward analytics screen (revenue-vs-payout bars, commission split, rank distribution) with no action surface at all — wrong tool for an operator's daily screen.

## 2. Scope Decisions (confirmed with the user)

- **Content region only.** No app-shell, global nav, or sidebar changes. 1a's 212px Ink sidebar is **not** built — the existing global top header and settings sub-nav stay exactly as they are. Only the `<router-outlet>` content of `/admin/dashboard` changes.
- **Pixel-faithful to 1a** for the content region — spacing, the Ink seal-with-hairline-strip, the decision-queue card, dotted-leader lists, the inventory grid — bespoke CSS where it diverges from the pre-existing shared components.
- **Decision queue: two real rows only.** 1a's mockup shows four rows (withdrawals, KYC, sales pending verification, commission disputes). `SaleStatus` is only `RECORDED`/`VOIDED` — there is no verification gate — and no commission-dispute domain exists anywhere in the codebase. Building either would be new domain behavior, not a dashboard change, so the queue ships with **Withdrawals awaiting release** and **KYC submissions to review** only.
- **Recent-sales pills: real statuses.** `RECORDED` / `VOIDED`, styled with 1a's outlined-pill treatment (border, mitred corners) instead of the previous filled-pill style. Existing i18n keys (`saleStatusRecorded`/`saleStatusVoided`) kept.
- **Backend extended fully** for the new figures — every one is derivable from existing tables, no Flyway migration.
- **Network Health simplified.** 1a's mockup shows a `dormant / recruiting-only / selling` three-way split with per-associate sale/downline-growth attribution. That distinction isn't tracked anywhere in the domain today (no "recruiting only" concept exists), so the shipped Network Health card uses a two-way **active this cycle vs. inactive** split (active = distinct associates with a ledger entry in the open cycle) plus joined-this-cycle and deepest-leg figures — same information shape (a dotted-leader list + a segmented bar), scoped to what the domain actually models.

## 3. Backend

`backend/src/main/java/com/plotchain/stats/AdminStatsResponse.java` — new top-level fields:

| Field | Type | Source |
|---|---|---|
| `pendingWithdrawalsValue` | `BigDecimal` | `WithdrawalRequestRepository.sumAmountByStatus(REQUESTED)` (new — `COALESCE(SUM...),0)`, same shape as `SaleRepository.sumAmountByCycleIdAndStatus`) |
| `oldestPendingWithdrawalAgeDays` | `Long` (nullable) | `WithdrawalRequestRepository.findFirstByStatusOrderByRequestedAtAsc(REQUESTED)` (new), age = `DAYS.between(requestedAt, now)`; `null` when the queue is empty |
| `plotsSold` | `long` | `PlotRepository.countByStatus(SOLD)` (new — pairs with the existing `countByStatusNot(SOLD)` = `activePlots`) |
| `plotsTotal` | `long` | `PlotRepository.count()` |
| `networkHealth` | `NetworkHealth` | see below |

New nested record `AdminStatsResponse.NetworkHealth(activeThisCycle, joinedThisCycle, deepestLeg)`:
- `activeThisCycle` — `LedgerEntryRepository.countDistinctAssociatesByCycle(cycleId)` (new `COUNT(DISTINCT associateId)` query), `0` when no cycle is open.
- `joinedThisCycle` — mirrors `currentCycle.newAssociatesThisCycle`, `0` when no cycle is open.
- `deepestLeg` — `AssociateRepository.findDeepestLegDepth()` (new whole-tree recursive CTE, same `WITH RECURSIVE` style as the file's existing `countDownline`/`findAncestorChainIds`; walks every root `parent_id IS NULL` row down to `MAX(depth)`, `COALESCE(..., 0)` so an empty tree returns `0` rather than `null`).

`AdminStatsService.getStats()` computes all of the above alongside the existing aggregates; none of the existing fields' meaning changes.

## 4. Frontend

- `admin-dashboard.model.ts` — mirrors the new response fields, plus a `NetworkHealth` interface.
- `seal-card.component.ts` — gained an optional `[seal-card-strip]` projected slot rendered between the delta/trend and the bottom hairline, so 1a's 3-column "Revenue booked / Sales / Active associates" strip lives inside the one `app-seal-card` per screen without adding a second Seal Card variant (keeps D6's "exactly one Seal Card" rule).
- `admin-dashboard.component.ts` — full template rebuild: header (title + cycle caption + Provision/Record actions), row 1 (`1.45fr 1fr`: Ink seal card with strip, decision queue), row 2 (`1.45fr 1fr`: recent sales table, Network Health + Inventory cards). `AdminNetworkGrowthChartComponent` and `KycNetworkSummaryComponent` are no longer imported here (the growth-chart widget is now unused dashboard-wide — left in place, not deleted, since nothing else references it and removing dead files wasn't in scope of this change).
- `_admin.scss` — `.admin-dashboard__tiles`/`__panels`/`__quick-actions` rules replaced with 1a's layout (`.admin-dashboard__row`, `__seal-strip`, `__decision-*`, `__leaders` dotted-leader list, `__split-bar`, `__inventory-grid`), reusing `--ink`, `--brand-primary`, `--brand-secondary`, `--surface-card`, `--border-subtle`, `--status-*`, `--font-display`, `--radius-sm` tokens. Responsive: the two content rows collapse to one column at 960px.
- i18n — new `adminDashboard.*` keys in `en.json`/`hi.json` for the header, seal strip, decision queue, network health, and inventory copy; existing keys (`heading`/`subtitle`/tile labels/`networkGrowthEyebrow`/etc.) are left in the files even though the current template no longer renders all of them, consistent with how the repo treats i18n keys as an additive dictionary rather than pruning on every UI change.

## 5. Out of Scope

- Global app shell / top header / nav categories — untouched.
- 1a's Ink left sidebar — not built; navigation stays in the global shell.
- Sale-verification workflow and commission-dispute domain — neither exists; not added here.
- Directions 1b and 1c.
- Per-tenant theming of the new surfaces — rides the existing `--ink`/brand custom properties, so `ThemeService`'s per-tenant overrides apply automatically.

## 6. Testing

- `AdminStatsServiceTest` / `AssociateRepositoryTest` (new `findDeepestLegDepth` case) / `AdminStatsControllerTest` — backend aggregation and wire-format coverage for every new field.
- `admin-dashboard.component.spec.ts` — rewritten for the new template: seal card + strip, decision-queue rows and their empty state, recent-sales/network-health/inventory panels, quick-action links.
- `admin-dashboard.service.spec.ts` / `admin-stats.component.spec.ts` (separate `/settings/admin-stats` screen, same `AdminStatsResponse` type) — fixtures extended with the new required fields.
