# Sales Domain (Sale Recording, Register, Direct Income)

## Context

No `sale` package exists anywhere in the codebase today — the biggest single gap found by the reconciliation audit in `docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md`. Sales is upstream of the whole compensation engine (Income/Ledger, Wallet/Withdrawal, and Cycle Management's settlement batch all consume what this spec produces), so it's brainstormed first among the seven not-built domains.

Grounding docs: `land-mlm-platform-prd.md` §5.2/§7.3, `mlm-land-platform-spec.md` §2.2 (original `Sale` entity sketch) and §3 step 1 (Direct Income). Both predate the real `Plot`/`Project` inventory (`com.plotchain.projects`) and the real `CompensationPlanVersion` config (`com.plotchain.compensation`) that now exist in code — this spec reconciles the old sketch against what's actually built, not just re-implements it verbatim.

Role model: per the two-role spec, an Associate never records their own sale — Admin records every sale on an associate's behalf, and an Associate's own view is read-only (own + descendant sales).

## Scope

**In scope**: recording a sale against a real `Plot`, the admin sales register (list/filter, void), the associate-facing own-sales read, and Direct Income — computed synchronously at record time (per `mlm-land-platform-spec.md` §3 step 1: "computed immediately on `SaleRecorded`... No tree traversal needed"). A minimal cycle-lifecycle piece (`CycleService.getOrOpenCurrent()`) is included because Sales cannot function without *some* cycle to attach to, and nothing in the codebase creates one today.

**Out of scope**: Matching/Sponsor Matching/Royalty/Reward income and the leg-volume rollup batch (all require the full compensation-engine batch job — Cycle Management, a separate future spec). Admin-triggered cycle open/close/re-run, cycle monitoring UI. EMI/installment payment tracking (buyer pays the full `amount` at booking time in this spec — no partial-payment or "confirm date" gate; the PRD's own open question on this is resolved as "not needed yet," see Decisions). PAN capture on `Associate` (doesn't exist; Direct Income's admin-charge deduction always uses the without-PAN rate until a future KYC spec adds it).

## Decisions

1. **`Sale` references a real `Plot`** (`plotId` FK), not a free-floating amount. Recording requires `Plot.status == AVAILABLE` and flips it to `SOLD`; voiding flips it back to `AVAILABLE`. `Sale.amount` is a snapshot of `Plot.price` taken at record time (plot pricing can change later without altering historical sales).
2. **Buyer info is plain columns on `Sale`** (`buyerName`, `buyerPhone`, `buyerEmail` nullable) — no separate `Buyer` entity. Buyers are never system users (PRD non-goal: no public marketplace/retail buyer portal), and nothing in scope needs to look a buyer up independently of the sale that references them.
3. **Full payment at booking, no confirm gate.** Direct Income credits synchronously when the sale is recorded — no EMI, no "confirm date," no payment-threshold logic. This resolves the PRD's own open question #1 (payment/EMI/EMISchedule is unbuilt either way, so a confirm gate keyed on partial payment has nothing to key off of yet).
4. **Admin-charge deduction always uses the without-PAN rate.** `Associate` has no `pan_number` field (the original spec.md sketch had one; it was never implemented). Rather than block Direct Income on a field that doesn't exist, every sale is treated as "no PAN on file" for the admin-charge tier until a future KYC/profile spec adds PAN capture. This is a documented simplification, not a silent bug — flagged again in Open Questions.
5. **`CycleService.getOrOpenCurrent()` is new, minimal, and lives in the existing `cycle` package** — not a new package, since it's one method on top of the existing `Cycle`/`CycleRepository`/`CycleStatus` that were already built (entity+repo only, no service) for exactly this purpose. It computes today's period under the PRD's stated cadence (1st–15th / 16th–30th of the current month) and returns the matching `OPEN` cycle, creating one if none exists. No trigger/close/re-run endpoint — cycle *settlement* stays in Cycle Management.
6. **Void is a reversal, not a delete or edit**, matching the append-only-ledger NFR already stated in `mlm-land-platform-spec.md` §6. `Sale.status` flips `RECORDED → VOIDED` with a required `voidReason`; the linked `LedgerEntry` (found via the new `source_ref` column) flips to `REVERSED`. Neither row is deleted.
7. **`leg_credited` is a snapshot, not a live lookup.** Set once, at record time, from `associate.getPosition()` — the selling associate's own `L`/`R` position under their immediate parent. Nothing in the system today reassigns an associate's position after placement, so snapshot vs. live lookup is not currently observable, but snapshotting is the correct choice for an append-only sales record (a sale's historical leg attribution shouldn't silently change if placement logic ever does).
8. **Endpoints live under `/api/admin/sales`**, matching the existing `/api/admin/associates`, `/api/admin/tree`, `/api/admin/kyc` pattern for back-office operational screens (as opposed to `/api/company/*`, which is setup-wizard configuration). The associate-facing read is `/api/associates/me/sales`, matching `/api/associates/me/dashboard`, `/api/associates/me/tree` (added in the role-model-collapse plan), `/api/associates/me/profile`.

## Data model

**Migration** (new): `sale` table.

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `plot_id` | UUID NOT NULL, FK → `plot(id)` | |
| `associate_id` | UUID NOT NULL, FK → `associate(id)` | the selling associate; never the Admin row |
| `buyer_name` | VARCHAR NOT NULL | |
| `buyer_phone` | VARCHAR NOT NULL | |
| `buyer_email` | VARCHAR NULL | |
| `amount` | NUMERIC NOT NULL | snapshot of `plot.price` at record time |
| `cycle_id` | UUID NOT NULL, FK → `cycle(id)` | |
| `leg_credited` | VARCHAR(1) NOT NULL | `L` or `R`, snapshot of the associate's position |
| `status` | VARCHAR NOT NULL | `RECORDED` / `VOIDED` |
| `void_reason` | VARCHAR NULL | required by the API when voiding, not by the DB constraint (mirrors how `KycDecisionRequest`'s reason is conditionally required at the request-validation layer, not the schema, elsewhere in this codebase) |
| `recorded_at` | TIMESTAMP NOT NULL | |

**Migration** (same file): `ALTER TABLE ledger_entry ADD COLUMN source_ref UUID NULL;` — nullable because every non-`DIRECT` income type that will eventually populate this column (matching, sponsor, royalty, reward — all from the still-unbuilt compensation engine) doesn't exist yet; only `DIRECT` entries set it, to the originating `sale.id`.

**New Java types**: `Sale` (entity), `SaleStatus` (`RECORDED`, `VOIDED`), `SaleRepository`, `SaleService`, `SaleController`, `CreateSaleRequest`/`SaleResponse`/`VoidSaleRequest` records, `PlotNotAvailableException`, `SaleNotFoundException`, `SaleAlreadyVoidedException`. `CycleService` (new, in the existing `cycle` package).

## Flows

### Record a sale — `POST /api/admin/sales`, ADMIN-only

1. Look up `Plot` by `plotId` → 404 if missing.
2. `Plot.status != AVAILABLE` → `PlotNotAvailableException` → 409.
3. Look up `Associate` by `associateId` → 404 if missing (reuse `AssociateNotFoundException`).
4. `plotService`/`PlotRepository`: set `Plot.status = SOLD`, save.
5. `cycle = cycleService.getOrOpenCurrent()`.
6. Create and save `Sale` (`amount = plot.getPrice()`, `legCredited = associate.getPosition()`, `status = RECORDED`, `recordedAt = now()`).
7. Look up the current `CompensationPlanVersion` (same `findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())` pattern `DashboardService` already uses).
8. Compute and save a `LedgerEntry`: `incomeType = DIRECT`, `associateId = sale.associateId`, `cycleId = cycle.id`, `grossAmount = sale.amount × directIncomePct / 100`, `tdsDeduction = grossAmount × tdsPct / 100`, `adminDeduction = grossAmount × adminChargeWithoutPanPct / 100`, `netAmount = grossAmount − tdsDeduction − adminDeduction`, `status = PENDING`, `sourceRef = sale.id`, `createdAt = now()`.
9. Return `SaleResponse` (201).

### Void a sale — `POST /api/admin/sales/{id}/void`, ADMIN-only, body `{reason: string}`

1. Look up `Sale` → 404 if missing.
2. `Sale.status == VOIDED` → `SaleAlreadyVoidedException` → 409.
3. Set `Sale.status = VOIDED`, `voidReason = request.reason()`, save.
4. Set `Plot.status = AVAILABLE`, save.
5. Find the `LedgerEntry` where `sourceRef == sale.id` (a new `LedgerEntryRepository.findBySourceRef(UUID)` query), set `status = REVERSED`, save.
6. Return `SaleResponse` (200).

### Admin register — `GET /api/admin/sales`, ADMIN-only

Paginated, same shape as `AdminAssociateController.list()`: optional filters `associateId`, `status`, `recordedFrom`/`recordedTo` (date range), `page`/`size` (clamped 0-100 like every other admin list endpoint in this codebase).

### Associate own view — `GET /api/associates/me/sales`, any authenticated associate

Self + full descendant subtree, view-only, paginated. Needs one new `AssociateRepository` method:

```java
@Query(value = """
    WITH RECURSIVE downline(id) AS (
        SELECT id FROM associate WHERE id = :associateId
        UNION ALL
        SELECT a.id FROM associate a JOIN downline d ON a.parent_id = d.id
    )
    SELECT id FROM downline
    """, nativeQuery = true)
List<String> findSelfAndDownlineIds(@Param("associateId") UUID associateId);
```

(Returns `String`, parsed to `UUID` in a `default` method — same H2-vs-Postgres driver reasoning already documented on `findAncestorChainIds`: a bare native scalar query needs the `CAST(... AS VARCHAR)`/parse-back pattern to behave identically on both databases. Base case is `id = :associateId`, not `parent_id = :associateId` like `countDownline`, since this list must include the caller's own sales too, not just descendants'.)

`SaleService` filters `SaleRepository` by `associateId IN (selfAndDownlineIds)`.

## Error handling

| Exception | HTTP | Trigger |
|---|---|---|
| `PlotNotFoundException` (existing) | 404 | `plotId` doesn't resolve |
| `AssociateNotFoundException` (existing) | 404 | `associateId` doesn't resolve |
| `PlotNotAvailableException` (new) | 409 | `Plot.status != AVAILABLE` at record time |
| `SaleNotFoundException` (new) | 404 | `id` doesn't resolve on void |
| `SaleAlreadyVoidedException` (new) | 409 | voiding an already-`VOIDED` sale |

## Testing

- `CycleServiceTest`: no open cycle → creates one with the correct period boundaries for today's date; an open cycle already covering today → returns it, doesn't create a duplicate; a cycle exists but doesn't cover today (e.g. it's the 16th and only a 1st–15th cycle exists) → creates the next one.
- `SaleServiceTest`: happy-path record (plot flips to SOLD, ledger entry created with correct gross/tds/admin/net math against a stubbed `CompensationPlanVersion`); record against a non-`AVAILABLE` plot throws; void reverts plot + reverses ledger entry; void on an already-voided sale throws.
- `SaleControllerTest` (MockMvc + real JWT, mirroring `KycReviewControllerTest`'s shape): 201 on record, 409 on unavailable plot, 200 + reversal on void, 200 on list with filters.
- `SecurityConfigTest` additions: record/void/register are ADMIN-only (associate token → 403); `/api/associates/me/sales` reachable by an associate token.
- `AssociateRepositoryTest`: `findSelfAndDownlineIds` returns the caller plus every descendant, excludes siblings/ancestors/unrelated associates.

## Open questions

1. Admin-charge PAN tiering (Decision 4) is a real simplification, not a permanent design — once a future KYC/profile spec adds `pan_number` to `Associate`, Direct Income's admin-deduction calculation in this spec needs revisiting to read the real tier instead of always assuming "no PAN."
