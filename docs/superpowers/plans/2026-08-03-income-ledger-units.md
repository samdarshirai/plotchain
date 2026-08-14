# Income / Ledger — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-03-income-ledger-domain-design.md` by spec-slicer via `spec-cycle-orchestrator`, 2026-08-14. This file is the persisted record of that slice — a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed since.

No ADRs or glossary file exist for this spec; sliced from the spec doc alone. The spec has no dedicated "Screens" section — the screen cross-check below is derived from the Context section's PRD references (`mlm-land-platform-spec.md` §5.1/§5.2, quoted inline in the spec) the same way `docs/superpowers/plans/2026-08-03-sales-units.md` derived "Sales Register"/"Sales History" from scope prose rather than a formal screens list.

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| # | Type | Unit | Depends on | Status | Plan file | Merged as |
|---|---|---|---|---|---|---|
| 1 | backend | Admin views a paginated, filterable, cross-associate ledger register — `GET /api/admin/ledger` | none | pending | | |
| 2 | backend | Associate views own paginated, filterable ledger history across all cycles — `GET /api/associates/me/ledger` | 1 | pending | | |
| 3 | screen | Admin "Ledger Register" screen — cross-associate raw ledger audit/reconciliation view | 1 | pending | | |
| 4 | screen | Associate "Income Statement" screen — itemized ledger history, tabs per income type, filter by cycle | 2 | pending | | |

## Unit detail

### 1. Admin views a paginated, filterable, cross-associate ledger register — `GET /api/admin/ledger`

**Depends on:** none
**Refs:** Scope; Decisions 1, 2, 4, 5, 7, 8, 10, 11, 12, 13, 14; Flow "Admin ledger register"; Error handling table; Testing section

Acceptance criteria:
- ADMIN-authenticated `GET /api/admin/ledger` returns all ledger entries across all associates when unfiltered, sorted `createdAt DESC` (Decision 7).
- `associateId`, `incomeType` (including `PERK`, un-hidden per Decision 10), `cycleId`, `status` each narrow results independently and in combination, via a new null-safe `LedgerEntryRepository.search(...)` query (Decision 4, JPQL given in Flows).
- `page`/`size` clamped (`page = Math.max(page, 0)`, `size = Math.min(size, 100)`), default `page=0`/`size=20` (Decision 8).
- Response is `AdminLedgerPageResponse(entries, page, size, totalElements)`, mirroring `AdminAssociatePageResponse`'s shape (Decision 8).
- Each `AdminLedgerEntryResponse` row includes `associateUserId`/`associateName` (batch-loaded via `associateRepository.findAllById` over the distinct associate ids in the page) and `cyclePeriodStart`/`cyclePeriodEnd` (batch-loaded via `cycleRepository.findAllById`), plus nullable `sourceRef` (Decisions 11, 12, 13).
- A non-existent `associateId` filter, or any filter combination matching nothing, returns 200 with an empty `entries` list and `totalElements: 0` (error handling table) — this endpoint doesn't validate that `associateId` resolves to a real row.
- An invalid `incomeType`/`status` enum value or invalid UUID in the query string returns 400 via the existing `ApiExceptionHandler#handleTypeMismatch` — no new handler (Decision 14).
- An associate-role token calling this endpoint gets 403 (`SecurityConfig`, ADMIN-only — error table, `SecurityConfigTest` addition).
- An unauthenticated request gets 401 (standard JWT filter rejection).

### 2. Associate views own paginated, filterable ledger history across all cycles — `GET /api/associates/me/ledger`

**Depends on:** 1 — Decision 2 puts both endpoints on one `LedgerController`/`LedgerService`, and Decision 4 has this endpoint call the *same* `search(...)` repository method unit 1 introduces (associate endpoint always passes its own id where unit 1 passes the caller-supplied filter). Building unit 1 first means unit 2 extends an existing controller/service/repository-method rather than each unit separately inventing its own version of the shared query.
**Refs:** Scope; Decisions 1, 2, 3, 4, 6, 7, 8, 10, 11, 12, 13, 14; Flow "Associate own ledger"; Error handling table; Testing section

Acceptance criteria:
- Authenticated associate calling `GET /api/associates/me/ledger` gets only their own entries — `associateId` comes from `@AuthenticationPrincipal UUID associateId`, never a request parameter; the endpoint has no `associateId` query parameter at all, so there is no way to override it via query string (Decisions 3, 4).
- Response never contains another associate's entries regardless of filter values passed, even when the caller has downline associates with entries in the same cycle (Decision 3; Testing section) — "own entries only," not "self + descendant subtree," per the role-capability matrix (contrast with Sales' recursive downline query).
- `incomeType` (including `PERK`), `cycleId`, `status` filters narrow results the same null-safe way as unit 1, minus `associateId` (Decision 6).
- Sort order `createdAt DESC`; `page`/`size` clamping identical to unit 1 (Decisions 7, 8).
- Response is `AssociateLedgerPageResponse(entries, page, size, totalElements)` of `AssociateLedgerEntryResponse` rows — all ledger fields plus batch-loaded `cyclePeriodStart`/`cyclePeriodEnd` and nullable `sourceRef`, but no associate-identity fields since it's always the caller (Decisions 11, 12, 13).
- Any authenticated associate token can reach this endpoint — no role restriction beyond authentication (`SecurityConfigTest` addition).
- An unauthenticated request gets 401.

### 3. Admin "Ledger Register" screen — cross-associate raw ledger audit/reconciliation view

**Depends on:** 1
**Refs:** Context (`mlm-land-platform-spec.md` §5.2 "Reports & Exports": TDS summary, admin-charge revenue, rank distribution, cycle-over-cycle growth); Scope's own contrast — `GET /api/admin/ledger` is "the raw-ledger-entry audit view implied by the PRD's 'Reports & Exports' reconciliation-and-audit use case, not the aggregate TDS/admin-charge-revenue report"; unit 1's endpoint.

Acceptance criteria:
- Screen lists ledger entries across all associates, filterable by associate/income type (incl. `PERK`)/cycle/status, sorted newest-first, paginated per unit 1's contract.
- Each row shows the resolved associate name and cycle period dates (not raw UUIDs), per unit 1's response shape.
- View-only — no export/report-generation affordance (an aggregate CSV/PDF "Total Income Report" is explicitly out of scope, per the spec's own Out-of-scope section).

**Open question — naming, flagged not resolved:** the PRD names exactly one admin screen here, "Reports & Exports," but that screen's defining content (TDS summary, admin-charge revenue, rank distribution, cycle-over-cycle growth) is explicitly deferred by this spec's Out-of-scope section — none of it is built by unit 1's endpoint. Calling this unit "Reports & Exports" would overstate what ships; it's titled for what it actually is (a raw ledger register/audit view) so a later spec that builds the aggregate report doesn't get confused about what's already shipped under that name. Whoever specs the aggregate report should decide whether it becomes a second tab on this same screen or a separate one.

### 4. Associate "Income Statement" screen — itemized ledger history, tabs per income type, filter by cycle

**Depends on:** 2
**Refs:** Context (`mlm-land-platform-spec.md` §5.1 "Income Statement": itemized breakdown per cycle, tabs per income type, filter by cycle); Decision 9 (no "list cycles" endpoint); unit 2's endpoint.

Acceptance criteria:
- Screen lists the caller's own ledger entries, itemized per cycle, with tabs/filter by income type (Direct/Matching/Sponsor/Royalty/Reward/Perk) via unit 2's `incomeType` filter.
- Filter by cycle via unit 2's `cycleId` filter.
- Status (`PAID`/`PENDING`/`CARRIED_FORWARD`) visible per row and filterable (Decision 6).
- Pagination controls matching unit 2's `page`/`size` contract.
- View-only — no write affordances, matching the role-capability matrix's "Associate: view-only" for this domain.

**Open question — cycle picker, flagged not resolved:** Decision 9 means there's no "list cycles" endpoint to populate a cycle filter dropdown from. The spec suggests building one from previously-returned data (e.g. distinct cycles seen in an unfiltered first page, or the associate's own dashboard cycle) but doesn't prescribe a specific UI pattern — that's a real design decision for this unit's plan, not something to invent here.

## Excluded — not a unit

- **"Payout History" screen** (PRD §5.1, past settlements) — needs wallet/payout records, which are explicitly out of scope for this spec (a separate future spec, per Scope's Out-of-scope section). No endpoint sliced above feeds it, so no screen unit per the cross-check rule ("a unit with no screen... gets none — don't invent one").
- **A "list cycles" endpoint** — Decision 9 explicitly declines to add one; not a unit.
- **Income-calculation logic, aggregate "Total Income Report," wallet/withdrawal** — all named out of scope in the spec's own Out-of-scope section; none surface as units or as acceptance criteria on units 1-4.
- **A standalone "repository query method" unit** — `LedgerEntryRepository.search(...)` (Decision 4, Flows) is layer-shaped, not an observable outcome on its own; it's built as part of unit 1 and reused, unmodified, by unit 2.

## File overlap check against other approved/in-flight units (done at slice time)

`income` package (`LedgerEntry`, `LedgerEntryRepository`, `IncomeType`, `LedgerEntryStatus`) already exists — entity, repository (with several `sum*`/`exists*`/`findBy*` methods from the merged Sales and Cycle Management specs), and a `LedgerEntryRepositoryTest`, but **zero controller** (confirmed: no `LedgerController` anywhere in `backend/src/main/java/com/plotchain/income/`). This spec adds `search(...)` to the existing repository interface alongside those methods (no edit collision — additive), plus a new `LedgerController`/`LedgerService`/DTOs, all net-new files. No entity or migration changes (spec's own Data model section: `ledger_entry.source_ref` already landed via the Sales spec's migration, confirmed present on `LedgerEntry.java`). No overlap with `cycle`, `sales`, or `legvolume` packages beyond read-only `CycleRepository.findAllById`/`AssociateRepository.findAllById` calls, both pre-existing repositories.
