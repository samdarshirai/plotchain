# Income / Ledger Domain (Read Endpoints)

## Context

The `income` package has a `LedgerEntry` entity and `LedgerEntryRepository` but zero controller — no endpoint at all, admin or associate — per the reconciliation audit in `docs/superpowers/specs/2026-08-03-role-capability-data-visibility-design.md`. That spec's data-visibility matrix is the authority for who sees what here: Admin sees all associates' ledger entries (for reports/audit); Associate sees own ledger entries only, itemized by income type, view-only.

The only thing that currently writes a `LedgerEntry` row is the Sales domain (`docs/superpowers/specs/2026-08-03-sales-domain-design.md`), spec'd immediately before this one: recording a sale synchronously creates a `DIRECT`-type entry and (per that spec) adds a nullable `source_ref` column to `ledger_entry`, populated only for `DIRECT` entries today. A future Cycle Management spec (not yet written) will populate `MATCHING`/`SPONSOR_MATCHING`/`ROYALTY`/`REWARD` entries in a batch job at cycle close. This spec designs neither write path — it is a pure read layer on top of whatever those two domains produce.

`DashboardService.getDashboard()` already reads `LedgerEntryRepository` for the associate's own dashboard: direct/matching/total net-amount sums for the single currently-open cycle, via `sumNetAmountByAssociateCycleAndType`/`sumNetAmountByAssociateAndCycle`. That is a live aggregate for "today," recomputed on every dashboard load. This spec's associate endpoint is a different thing: itemized, per-entry history across *all* cycles (past and present), matching the PRD's "Income Statement" screen (§5.1: itemized breakdown per cycle, tabs per income type, filter by cycle) — not a replacement for or a duplicate of the dashboard summary.

`mlm-land-platform-spec.md` §5.1/§5.2 describe two associate-facing screens ("Income Statement", itemized per cycle; "Payout History", past settlements) and one admin screen ("Reports & Exports": TDS summary, admin-charge revenue, rank distribution, cycle-over-cycle growth). Payout History and the aggregate Reports & Exports screen both require data/features this spec doesn't build (wallet/payout records; a denormalized cross-type report) — see Out of scope.

## Scope

**In scope**:
- `GET /api/admin/ledger` — paginated, filterable, full cross-associate visibility. This is the raw-ledger-entry audit view implied by the PRD's "Reports & Exports" reconciliation-and-audit use case, not the aggregate TDS/admin-charge-revenue report.
- `GET /api/associates/me/ledger` — paginated, filterable, own entries only.
- The `LedgerEntryRepository` query method(s) both endpoints need.
- Response shapes that resolve `associateId`/`cycleId` into human-readable associate and cycle summaries, so the UI doesn't need a second round trip per row.

**Out of scope** (deferred, not designed here):
- Income-calculation logic — Direct is in the Sales spec; Matching/Sponsor Matching/Royalty/Reward belong to the future Cycle Management spec.
- An aggregate "Total Income Report" (all income types + TDS + admin-charge + payable-amount in one denormalized view) or a company-wide TDS-summary-for-tax-filing export. These are report-generation features (likely CSV/PDF), bigger than a paginated read, and not implied by the reconciliation audit's scope. Flagged as a future follow-up.
- Wallet balance and withdrawal requests — a separate future spec. Cycle Management's eventual settlement design is expected to depend on this domain existing (ledger entries are what get paid out), but that dependency isn't designed here.
- A "list cycles" endpoint. Neither this spec nor any shipped code exposes one; see Decision 9.

## Decisions

1. **Endpoint paths**: `/api/admin/ledger` and `/api/associates/me/ledger`, following the established split — `/api/admin/*` for back-office reads (`/api/admin/associates`, `/api/admin/sales`, `/api/admin/kyc`), `/api/associates/me/*` for self-service reads (`/api/associates/me/dashboard`, `/api/associates/me/sales`).

2. **One controller, one service, both endpoints.** The Sales spec put `POST /api/admin/sales`, `POST /api/admin/sales/{id}/void`, `GET /api/admin/sales`, and `GET /api/associates/me/sales` all on a single `SaleController`/`SaleService`. This domain follows the same shape: `LedgerController` (in the existing `income` package) exposes both `GET /api/admin/ledger` and `GET /api/associates/me/ledger`, backed by one `LedgerService` with two methods (`adminList(...)`, `myList(...)`). There's no write path to justify splitting into separate admin/associate service classes.

3. **Associate scope is "own entries only," not "self + descendant subtree."** The role-capability matrix's Income/ledger row says "Own ledger entries only" for Associate — contrast with the same matrix's Sales row, "Own sales + descendant sales (team-volume reports)," which the Sales spec correctly implemented with a recursive downline query. Ledger entries are earnings, not a team-volume rollup; an associate's own income statement has no reason to show a downline member's personal earnings. `GET /api/associates/me/ledger` filters strictly by `l.associateId = <caller's id>` — no downline query, no new `AssociateRepository` method needed for this endpoint.

4. **One repository query serves both endpoints.** `LedgerEntryRepository.search(associateId, incomeType, cycleId, status, pageable)` takes all four filters as nullable and combines them with the same null-safe `(:param IS NULL OR ...)` JPQL pattern `AssociateRepository.searchDirectory` already uses for the admin associate directory. The admin endpoint passes through the caller-supplied (possibly null) `associateId`; the associate endpoint always passes the authenticated caller's own id — never null, and never taken from a request parameter (the associate-facing controller method has no `associateId` parameter at all, so there is no way to override it via query string).

5. **Admin filters are exactly `associateId`, `incomeType`, `cycleId`, `status`** — matching the scope given for this spec. No `createdFrom`/`createdTo` date-range filter, unlike the Sales register's `recordedFrom`/`recordedTo`. This keeps the two domains' filter sets independently minimal rather than copying Sales' shape wholesale; a date-range filter is a trivial additive change if audit needs it later.

6. **Associate filters are `incomeType`, `cycleId`, `status`** — the admin filter set minus `associateId` (which is implicit). This lets the associate app build the PRD's "tabs: Direct/Matching/Sponsor/Royalty/Reward" (via `incomeType`) and "filter by cycle" (via `cycleId`) directly, plus a status filter (e.g. distinguishing `PAID` from `PENDING`/`CARRIED_FORWARD`) that the PRD sketch didn't call out but the schema already supports at no extra cost.

7. **Sort order is `createdAt DESC`** (newest first) on both endpoints. Unlike the associate directory (sorted by `userId` for browsability), a ledger/audit feed's natural reading order is reverse-chronological — the same reasoning that makes `findTop5ByOrderByPublishedAtDesc` (announcements) and `findFirstByStatusOrderByPeriodStartDesc` (current cycle) sort by recency elsewhere in this codebase.

8. **Pagination response shape mirrors `AdminAssociatePageResponse`**: `(entries, page, size, totalElements)`. `page`/`size` are clamped in the controller exactly like `AdminAssociateController.list()`/`KycReviewController.list()` (`page = Math.max(page, 0)`, `size = Math.min(size, 100)`), default `page=0`, `size=20`.

9. **No "list cycles" endpoint.** A `cycleId` filter needs a source of valid cycle IDs, and no endpoint anywhere lists cycles today (the `cycle` package is entity+repo only, per the reconciliation audit). This spec doesn't add one: every ledger entry already returned carries `cycleId` plus a resolved `cyclePeriodStart`/`cyclePeriodEnd` (Decision 11), so a UI can build a cycle picker from previously-returned data (e.g. the associate's own dashboard cycle, or distinct cycles seen in an unfiltered first page) without a dedicated listing call. A real "browse all cycles" affordance belongs to the future Cycle Management spec, which owns the `Cycle` lifecycle.

10. **`PERK` is a valid, un-hidden filter value for `incomeType`.** The matrix text only enumerates direct/matching/sponsor/royalty/reward, but `IncomeType` already has six values including `PERK`. Nothing in scope calls for hiding it, and no writer produces it yet either — it's exposed like any other enum value with no special-casing, consistent with not inventing income-calculation behavior here.

11. **Responses resolve `associateId` and `cycleId` into readable fields via batch lookups, not raw UUIDs alone.** `AdminLedgerEntryResponse` includes `associateUserId`/`associateName` (batch-loaded with `associateRepository.findAllById(...)` over the distinct associate ids in the page, mirroring `AdminAssociateService.ranksById()`'s "batch-load once per page, map by id" pattern); both response types include `cyclePeriodStart`/`cyclePeriodEnd` (same batch-load pattern via `cycleRepository.findAllById(...)`). Returning bare UUIDs would force a second round trip per row for any real UI.

12. **Two distinct response record types, not one shared DTO.** `AdminLedgerEntryResponse` (associate identity + all ledger fields) and `AssociateLedgerEntryResponse` (all ledger fields, no associate identity fields since it's always the caller) are separate records rather than one type with associate fields nulled out for the self view. This matches the existing pattern of `AdminAssociateSummaryResponse`/`DashboardResponse` being purpose-built per consumer rather than a single kitchen-sink type.

13. **`sourceRef` is included in both response types, nullable, sourced from the Sales spec's `ledger_entry.source_ref` column.** Today only `DIRECT` entries populate it (linking back to the originating `sale.id`); it stays `null` for every other income type until Cycle Management's batch job decides whether non-Direct entries get their own source linkage (out of scope here — not designed). This creates a build-order note, not a design gap: if this domain is implemented before the Sales domain's migration lands, `source_ref` won't exist on `ledger_entry` yet and the response field is temporarily always null until that migration runs. No schema change of its own is needed by this spec either way.

14. **No new exception types, no domain-specific `@RestControllerAdvice`.** Both endpoints are pure reads with no ownership-violation path (the associate endpoint can't be pointed at someone else's data — Decision 4) and no not-found path (an unmatched filter combination just returns an empty page, the same behavior `AdminAssociateService.list()` already has for e.g. a nonexistent `rank` filter). An invalid enum value in a query parameter (e.g. `incomeType=BOGUS`) is already handled generically by the existing `com.plotchain.api.ApiExceptionHandler#handleTypeMismatch` (400, `{"error": "invalid value for <param>"}`) — no new handler needed.

## Data model

No new tables and no new columns are introduced by this spec. The one schema change this domain depends on (`ledger_entry.source_ref`, nullable) is already accounted for in the Sales spec's migration — see Decision 13. The only new code is repository query methods and read-only DTOs; no entity changes.

## Flows

### Admin ledger register — `GET /api/admin/ledger`, `ADMIN`-only

Query params: `associateId` (UUID, optional), `incomeType` (`IncomeType`, optional), `cycleId` (UUID, optional), `status` (`LedgerEntryStatus`, optional), `page` (default 0), `size` (default 20, clamped to 100).

1. Clamp `page = Math.max(page, 0)`, `size = Math.min(size, 100)`.
2. `Page<LedgerEntry> result = ledgerEntryRepository.search(associateId, incomeType, cycleId, status, PageRequest.of(page, size))` — filters applied null-safely, ordered `createdAt DESC`.
3. Collect distinct `associateId`s and `cycleId`s from `result.getContent()`.
4. `Map<UUID, Associate> associatesById = associateRepository.findAllById(distinctAssociateIds)` keyed by id.
5. `Map<UUID, Cycle> cyclesById = cycleRepository.findAllById(distinctCycleIds)` keyed by id.
6. Map each `LedgerEntry` to `AdminLedgerEntryResponse` using the two lookup maps (associate/cycle rows are expected to exist by FK integrity; if a lookup somehow misses, the response field is left `null` rather than failing the whole page — this is a read-only audit view, not a strict-consistency write path).
7. Return `AdminLedgerPageResponse(entries, page, size, result.getTotalElements())`.

### Associate own ledger — `GET /api/associates/me/ledger`, any authenticated associate

Query params: `incomeType` (optional), `cycleId` (optional), `status` (optional), `page`, `size` — no `associateId` parameter exists on this endpoint.

1. `associateId` comes from `@AuthenticationPrincipal UUID associateId` (same pattern as `DashboardController.getDashboard()`), never from the request.
2. Clamp `page`/`size` as above.
3. `Page<LedgerEntry> result = ledgerEntryRepository.search(associateId, incomeType, cycleId, status, PageRequest.of(page, size))` — same repository method as the admin endpoint, `associateId` always non-null and always the caller's own.
4. Collect distinct `cycleId`s, batch-load `Map<UUID, Cycle> cyclesById` as above (no associate lookup needed — every row is the caller).
5. Map each `LedgerEntry` to `AssociateLedgerEntryResponse`.
6. Return `AssociateLedgerPageResponse(entries, page, size, result.getTotalElements())`.

### New repository method

```java
// income/LedgerEntryRepository.java — added alongside the existing sum* methods.
// Null-safe optional filters, same shape as AssociateRepository#searchDirectory. UUID- and
// enum-typed params (associateId, incomeType, cycleId, status) don't need the explicit CAST
// that searchDirectory's :search string param needs -- Hibernate resolves UUID/enum parameter
// types from the Java method signature alone, independent of the surrounding SQL, per that
// method's own comment.
@Query("""
    SELECT l FROM LedgerEntry l
    WHERE (:associateId IS NULL OR l.associateId = :associateId)
    AND (:incomeType IS NULL OR l.incomeType = :incomeType)
    AND (:cycleId IS NULL OR l.cycleId = :cycleId)
    AND (:status IS NULL OR l.status = :status)
    ORDER BY l.createdAt DESC
    """)
Page<LedgerEntry> search(
    @Param("associateId") UUID associateId,
    @Param("incomeType") IncomeType incomeType,
    @Param("cycleId") UUID cycleId,
    @Param("status") LedgerEntryStatus status,
    Pageable pageable);
```

## Error handling

| Condition | HTTP | Handling |
|---|---|---|
| Invalid `incomeType`/`status` enum value in query string | 400 | Existing `ApiExceptionHandler#handleTypeMismatch` — no new handler |
| Invalid UUID in `associateId`/`cycleId` query string | 400 | Same as above |
| No entries match the given filters | 200 | Empty `entries` list, `totalElements: 0` — not an error |
| `associateId` filter (admin only) refers to a non-existent associate | 200 | Empty result, same as any other non-matching filter — this endpoint doesn't validate that `associateId` resolves to a real row, matching `AdminAssociateService.list()`'s existing behavior for its own filters |
| Associate token calls `GET /api/admin/ledger` | 403 | `SecurityConfig` — `ADMIN`-only |
| Unauthenticated request to either endpoint | 401 | Standard JWT filter rejection |

## Testing

- `LedgerEntryRepositoryTest`: `search()` — each filter individually (associateId, incomeType, cycleId, status) and in combination; no filters returns everything; sort order is `createdAt DESC`; pagination (`page`/`size`) slices correctly.
- `LedgerControllerTest` (MockMvc + real JWT via `JwtService`, mirroring `KycReviewControllerTest`'s shape):
  - `GET /api/admin/ledger`: 200 with all entries across multiple associates when unfiltered; each filter narrows results; associate token gets 403.
  - `GET /api/associates/me/ledger`: 200 with only the caller's own entries, even when other associates (including the caller's own downline, if any) have entries in the same cycle; `incomeType`/`cycleId`/`status` filters narrow results; response never contains another associate's entries regardless of filter values passed.
  - Response shape: `associateUserId`/`associateName` populated on the admin response; `cyclePeriodStart`/`cyclePeriodEnd` populated on both; `sourceRef` present (nullable) on both.
- `SecurityConfigTest` additions: `GET /api/admin/ledger` is `ADMIN`-only (associate token → 403); `GET /api/associates/me/ledger` reachable by any authenticated associate token.

## Open questions

None. Every decision point had a reasonable default grounded in an existing precedent in this codebase (cited inline in the Decisions section above); nothing here was a genuine toss-up.
