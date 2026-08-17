# Associate Dashboard — Reference Parity Design

**Date:** 2026-08-17
**Status:** Approved by user — open items (photo, rank upgrade-date) resolved 2026-08-17, no items remain unresolved

## 1. Problem

The associate-facing `/dashboard` (`frontend/src/app/dashboard/`) was built from `docs/superpowers/specs/2026-07-29-mlm-land-platform-gaps-dashboard-design.md` §8 without a like-for-like comparison against the one piece of real reference material this project has: `Screen Recording 2026-07-29 at 10.26.32.mov`, a walkthrough of a real competitor's back office (samvardhani.com's `member/dashboard.php`). That comparison was done retroactively and published as a gap report (`https://claude.ai/code/artifact/daee098d-2558-4ae6-8157-48b5e9f53c46`); this spec turns its findings into buildable work.

Two categories of gap surfaced:

1. **Data the reference shows and the current dashboard doesn't** — an associate identity block (photo, name, ID, designation, mobile, dates) and roughly a dozen stat tiles (carry-forward business, lifetime left/right business, per-leg associate counts, booked area, sponsor's matching income, self performance bonus, royalty bonus).
2. **Zero visual styling** — `frontend/src/app/dashboard/` and all 9 of its widgets ship no `styles` block and no `styleUrl` anywhere. Every widget is an unstyled `<div>`. This is the single largest visible gap against the reference and makes the data gaps above harder to notice, since nothing on the page currently looks finished enough to compare.

Investigation while scoping this spec found most of the "missing" data is a thinner gap than it looks:

- `LegVolumeSummary.carriedForwardLeft`/`carriedForwardRight` are already computed by `DashboardService` (`backend/src/main/java/com/plotchain/dashboard/DashboardService.java:131-134`) and sent to the frontend today — `leg-volume-gauge.component.ts` just never renders them. Frontend-only fix.
- `IncomeType` already has `SPONSOR_MATCHING`, `SELF_PERFORMANCE`, and `ROYALTY` (`backend/src/main/java/com/plotchain/income/IncomeType.java`), and `LedgerEntryRepository.sumNetAmountByAssociateCycleAndType` — the exact method `DashboardService` already calls for `DIRECT`/`MATCHING` (`DashboardService.java:74-76`) — works unchanged for these three. No new query shape, just three more calls.
- The royalty-bonus percentage has a ready-made lookup: `RoyaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc`, a volume-slab match against the associate's matched volume this cycle (documented in that method as *"New Matching Business in a Single Closing," not rank-keyed* — this matches the `min(left, right)` volume `DashboardService` already computes for `projectedMatch`, `DashboardService.java:86-89`).
- Associate identity fields the reference shows (name, ID, mobile, registration date, rank/designation) are already columns on `Associate` (`name`, `phone`, `joined_at`, `user_id`) or already resolved in `DashboardService` (`currentRank`, `DashboardService.java:94-99`) — no new table.
- Per-leg associate counts (`Total Left/Right Associates`) follow the exact recursive-CTE shape `AssociateRepository.countDownline` already uses (`AssociateRepository.java:17-25`), just seeded at the left/right immediate child (`position` column, already used in `existsByParentIdAndPosition`) instead of the associate themself.
- "New Booked Area" is `SUM(plot.area_sqft)` for the associate's `RECORDED` sales this cycle — `plot.area_sqft` already exists (`V16`-adjacent plot migration), joined through `sale.plot_id`.

Two reference fields genuinely don't exist in the codebase: a profile photo (no upload/storage mechanism anywhere — the same documented gap as `AssociateIdCardResponse.photoUrl`, always `null` today, see `AssociateIdCardService`'s header comment) and a rank "Latest Upgrade Date" (no rank-change timestamp is tracked; `Associate` only has `joined_at`). Resolved with the user 2026-08-17 (see §2): the photo gets a no-upload placeholder, not the full upload infra; the upgrade date gets a small new column.

## 2. Scope Decisions

- **In scope:** a new identity header widget; extending `CycleIncome` with the three missing income lines; extending `LegVolumeSummary`/`TeamSnapshot` with lifetime and per-leg fields; a new `newBookedAreaSqft` field; wiring the already-fetched carry-forward fields into the leg-volume widget; a full CSS pass giving all 9 existing widgets plus the new header actual card chrome, spacing, and color — not a pixel clone of the reference's dark/gold theme, but this app's own visual language (the project has no shared dashboard design token set yet; this spec's frontend work introduces one scoped to `dashboard/`, reusing `shared/components/stat-tile` where it already fits rather than inventing a second tile component).
- **Profile photo, resolved:** no upload infrastructure is built. The identity header renders an initials avatar (derived client-side from `associate.name`, e.g. first letter of first/last word) instead of a photo — closes the visual gap the reference shows without touching file storage. `AssociateIdCardResponse.photoUrl` stays exactly as documented (always `null`, separate concern) — this spec doesn't touch it.
- **Rank upgrade date, resolved:** a new nullable `rank_changed_at` column on `associate`, set only when `CycleService`'s rank-progression branch actually promotes an associate (`CycleService.java:441-444`) — not on initial provisioning (`AssociateProvisioningService.java:63` assigns the starting rank, which isn't an "upgrade"). Associates who haven't been promoted since this column ships show no upgrade date, which is correct, not a bug: the event genuinely hasn't happened yet.
- **Out of scope, matches standing precedent:** e-PIN and Message/Support-ticket nav destinations. Per `docs/superpowers/specs/2026-08-17-admin-dashboard-design.md` §2, those domain specs are not yet built (project tracking: epin/support-tickets/announcements still not-started) — adding dashboard surface for subsystems that don't exist yet is the same scope creep called out there.
- **Out of scope: chrome shape.** The reference's collapsible left sidebar is not adopted. `frontend/src/app/app.component.html`'s horizontal top nav is shared by every authenticated screen in the app (associate and admin); forking just `/dashboard` into a sidebar layout would make it the one screen in the app with different navigation chrome, for no functional gain. If a sidebar is ever wanted, it belongs to a separate, app-wide navigation redesign, not this spec.
- **Out of scope: Quick Actions / Withdraw buttons.** Already resolved (`issues.md` M3) by replacing the dead-link buttons with informational text pointing to the admin-only real destinations. This spec doesn't touch `quick-actions.component.ts` or `wallet-card.component.ts`'s existing copy.
- **"Total Left/Right Business" semantics, decided:** lifetime `SUM(left_leg_volume)` / `SUM(right_leg_volume)` across every `leg_volume` row for the associate (all cycles, not just the open one). This is deliberately *not* `New Business + Carried Forward`, because the reference's own numbers don't reconcile that way (Carry Forward Left ₹200,000 + New Left ₹0 ≠ Total Left Business ₹2,000,000 in the recorded example) — carry-forward is this-cycle-to-next, not a running total, so a true lifetime sum is the only definition consistent with the reference's own screen.

## 3. Architecture

No new microservice or table — this extends the existing `dashboard`, `income`, `legvolume`, and `associate` slices in place.

### 3.1 Backend

Extend `DashboardResponse` (`backend/src/main/java/com/plotchain/dashboard/DashboardResponse.java`):

| Addition | Type | Source |
|---|---|---|
| `associate` (new top-level field) | `AssociateSummary(String associateId, String name, String rank, String phone, Instant joinedAt, Instant rankChangedAt)` | `associate.getUserId()/getName()/getPhone()/getJoinedAt()/getRankChangedAt()` + `currentRank.getName()` — all already loaded in `DashboardService.getDashboard` before this change except `rankChangedAt` (new column, see below), no new query |
| `CycleIncome.sponsorMatchingIncome` | `BigDecimal` | `ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.SPONSOR_MATCHING)` |
| `CycleIncome.selfPerformanceBonus` | `BigDecimal` | same method, `IncomeType.SELF_PERFORMANCE` |
| `CycleIncome.royaltyBonus` | `BigDecimal` | same method, `IncomeType.ROYALTY` |
| `CycleIncome.royaltyBonusPct` | `BigDecimal` (0 when no slab matches) | `RoyaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(planVersionId, matchedVolumeThisCycle)`, same `min(left, right)` volume already computed for `projectedMatch` |
| `LegVolumeSummary.totalLeftBusiness` / `totalRightBusiness` | `BigDecimal` | new `LegVolumeRepository` query: `SUM(left_leg_volume)` / `SUM(right_leg_volume)` grouped by `associate_id`, across all cycles (see §2 semantics) |
| `LegVolumeSummary.newBookedAreaSqft` | `BigDecimal` | new query joining `sale` → `plot` on `plot_id`, filtered `associate_id`, `cycle_id = current`, `status = 'RECORDED'`, `SUM(plot.area_sqft)` |
| `TeamSnapshot.leftAssociates` / `rightAssociates` | `long` | new `AssociateRepository` query, same recursive-CTE shape as `countDownline` (`AssociateRepository.java:17-25`) but seeded at `SELECT id FROM associate WHERE parent_id = :associateId AND position = :position` instead of just `parent_id = :associateId` |

`RoyaltyBonusRateRepository`'s lookup needs `planVersionId` — reuse the `CompensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())` call `DashboardService` already makes for `matchingIncomePct` (`DashboardService.java:83-85`); same plan version object, one more field read off it.

**New column:** `V29__associate_rank_changed_at.sql` adds `rank_changed_at TIMESTAMP NULL` to `associate`. `CycleService`'s existing rank-promotion branch (`CycleService.java:441-444`, `if (highestQualified.getRankOrder() > currentRankOrder) { associate.setRankId(...); }`) also calls `associate.setRankChangedAt(Instant.now())` in the same branch, following the file's existing `Instant.now()` convention (no injected `Clock` anywhere in `CycleService` today). `AssociateProvisioningService`'s initial rank assignment (`AssociateProvisioningService.java:63`) does **not** set it — that's a starting assignment, not a promotion.

Every other new field above is an aggregate over existing columns or a value already loaded in-memory — no migration for those. `V1__create_dashboard_tables.sql`'s `leg_volume` and `sale`/`plot` schemas are untouched.

### 3.2 Frontend

`frontend/src/app/dashboard/models/dashboard-response.model.ts` gets the matching new fields (`AssociateSummary` interface; extended `CycleIncome`, `LegVolumeSummary`, `TeamSnapshot`).

New widget: `AssociateIdentityHeaderComponent` at `frontend/src/app/dashboard/widgets/associate-identity-header/`, rendering associate ID, name, rank, phone, joined date, and (when set) rank-upgrade date. In place of a photo, an initials avatar computed client-side from `associate.name` (no upload, no `photoUrl` field — §2). When `rankChangedAt` is `null` (no promotion yet), that row/line is simply omitted, not shown as an error or a placeholder date.

`dashboard.component.ts`'s widget order gains one entry at the top, otherwise unchanged from the base spec's stat-first ordering:

1. **Associate identity header** *(new)*
2. KYC pending banner
3. Cycle income card — now Direct / Matching / Sponsor's Matching / Self Performance / Royalty / Total (`cycle-income-card.component.ts` gains three more rows)
4. Wallet card
5. Leg volume gauge — now shows New, Carried Forward, and lifetime Total per leg, plus New Booked Area (`leg-volume-gauge.component.ts` renders the already-sent `carriedForwardLeft`/`Right` for the first time, plus the two new fields)
6. Rank progress
7. Team snapshot — now also shows the left/right associate split
8. Quick actions row (unchanged, §2)
9. Cycle countdown
10. Announcements strip

**Styling.** Every widget component in `frontend/src/app/dashboard/` (existing 9 plus the new header) gets a `styles` block or `styleUrl`: card chrome (border, background, padding) consistent across widgets, using `shared/components/stat-tile` for the individual metric cells inside the income/leg-volume/team-snapshot widgets rather than a bespoke tile per widget. This is new visual language for `dashboard/`, not a reuse of `settings`' or `admin-dashboard`'s existing styles wholesale — those are separate route trees with their own established look; `dashboard/` currently has none, and this spec is what gives it one.

### 3.3 Data flow

Unchanged: `DashboardComponent.ngOnInit` still does a single `DashboardService.getDashboard()` call; the response payload just has more fields on it. No new endpoint, no polling.

## 4. Error Handling

Unchanged from the current dashboard: a `loadError` boolean, i18n error banner on fetch failure. None of the new fields introduce a new throw path — `RoyaltyBonusRateRepository`'s lookup already returns `Optional` for "no slab configured," which maps to `royaltyBonus`/`royaltyBonusPct` of `0`, the same no-op-not-a-failure convention its own repository comment documents, not a new exception type.

## 5. Testing

- Backend: extend `DashboardServiceTest`/`DashboardControllerTest` for every new `DashboardResponse` field, including the no-royalty-slab-matched, no-lifetime-leg-volume-yet (fresh associate, zero rows), and never-promoted (`rankChangedAt` null) cases. New repository query methods (`LegVolumeRepository` lifetime sum, `AssociateRepository` per-leg count, the sale/plot area join) each get their own unit test. `CycleServiceTest`'s existing rank-promotion coverage extends to assert `rankChangedAt` is set on promotion and untouched otherwise.
- Frontend: new `AssociateIdentityHeaderComponent` spec. Update specs for `cycle-income-card`, `leg-volume-gauge`, and `team-snapshot` to cover the new inputs. `dashboard.component.spec.ts` updated for the new widget in the render order.
- No visual regression / screenshot tests — Playwright e2e stays deferred per standing project decision (all 12 setup-onboarding phases first); the styling pass in §3.2 is verified by manual run-through per the `run` skill, not automated pixel comparison.

## 6. Migration Note

One migration: `V29__associate_rank_changed_at.sql`, adding nullable `rank_changed_at TIMESTAMP` to `associate` (§3.1). Every other addition in this spec is either a new derived field (aggregate query, in-memory composition of data already loaded) or a frontend-only wiring/styling change.
