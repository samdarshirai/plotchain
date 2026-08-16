# Self-Performance Bonus: Design

## Context

`compensation-plan-reference.md` (repo root) §3 defines Self-Performance Bonus but it has never been implemented in the backend: `IncomeType` has no `SELF_PERFORMANCE` value, `Sale` has no area/sqft field, and `CompensationPlanVersion` has no columns for it. This spec adds it, with an admin-controlled enable/disable switch (a first for this compensation system — every other income type is either always-on or implicitly off via a zero rate/empty child table).

Source rule (compensation-plan-reference.md §3, cross-checked against `Samvardhani Income plan.pdf`'s own Self-Performance Bonus slide): 1% of the sale amount when the sold plot's area is ≥2,000 sqft in a single closing, 2% when ≥3,000 sqft. Base = the associate's own single-closing sale. Reach = self only, no tree/leg aggregation.

## Decisions

**Decision 1 — Credited at sale time, not cycle close.** Self-Performance Bonus needs nothing from the cycle-wide batch (no leg volumes, no tree walk, no other associates) — it's a pure function of one `Sale` row and its `Plot`. `SaleService.recordSale()` already credits `IncomeType.DIRECT` in the same shape inside the same `@Transactional` method; Self-Performance Bonus is a second credit step in that same method, not a new step in `CycleService.close()`.

**Decision 2 — Enable/disable switch lives in a new mutable singleton table, separate from the versioned rates.** `CompensationPlanVersion` is append-only (no setters; a new version must be published to change any rate) — gating the whole feature there would mean publishing a new plan version just to flip a switch. This codebase has one existing precedent for a setting that needs to change independently of the versioned plan: `withdrawal_config` (created `V9__payment_and_kyc_config.sql`, singleton via `singleton_guard BOOLEAN UNIQUE CHECK(=TRUE)`, service exposes `currentConfig()`/`updateConfig()`, audited via `SettingsAuditService`, own controller at `/api/company/withdrawal`). `self_performance_bonus_config` mirrors this shape exactly, with one field, `enabled`, defaulting to `false` on the seeded row (opt-in, not opt-out).

**Decision 3 — Rates and thresholds stay on `CompensationPlanVersion`, like every other income type.** Only the on/off bit is exceptional; the actual percentages (1%/2%) and thresholds (2,000/3,000 sqft) follow the same versioned, audit-trailed, append-only pattern `directIncomePct` etc. already use. Two tiers, four new columns: `selfPerformanceTier1Pct`, `selfPerformanceTier1SqftThreshold`, `selfPerformanceTier2Pct`, `selfPerformanceTier2SqftThreshold`.

**Decision 4 — Boundary is inclusive (`>=`), highest qualifying tier wins.** The doc's own wording is literal ("≥2,000 sqft", "≥3,000 sqft") — unlike Royalty Bonus, there's no "not exceeded" ambiguity to resolve here. `sqft >= tier2Threshold ? tier2Pct : sqft >= tier1Threshold ? tier1Pct : none`. Below the lower threshold: no entry, no error (matches the doc's own Known Gap §8.1 — no rate is documented below 2,000 sqft).

**Decision 5 — KYC-gated like the other four income types, not unconditionally PENDING like Direct Income currently is.** Direct Income's current always-PENDING behavior is an existing gap in `SaleService`, not a pattern to extend. Self-Performance Bonus reuses the same gate `CycleService.kycGatedStatus()` implements (`VERIFIED` → `PENDING`, else → `CARRIED_FORWARD`) — it's real payable income, and withholding payout until KYC clears is a rule about the money, not about which pipeline stage computed it.

**Decision 6 — Deductions reuse `SaleService`'s existing TDS/admin math.** Same plan version, same always-without-PAN admin rate (the existing, documented gap — not addressed here), same shape as the Direct Income deduction already computed in the same method.

**Decision 7 — Config-disabled is a hard gate, not a zero rate.** When `enabled = false`, no `SELF_PERFORMANCE` entry is written at all, regardless of sqft — this is a feature kill switch, distinguishable from "rate configured as 0%" (which would still be a no-op today anyway, same as every other income type's zero-gross guard, but the disabled case skips the lookup entirely rather than computing a zero).

## Data model

### Migration `V25__self_performance_bonus.sql`

```sql
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier1_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier1_sqft_threshold NUMERIC(10,2) NOT NULL DEFAULT 2000;
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier2_pct NUMERIC(5,2) NOT NULL DEFAULT 0;
ALTER TABLE compensation_plan_version ADD COLUMN self_performance_tier2_sqft_threshold NUMERIC(10,2) NOT NULL DEFAULT 3000;

CREATE TABLE self_performance_bonus_config (
    id UUID PRIMARY KEY,
    singleton_guard BOOLEAN NOT NULL DEFAULT TRUE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMP NOT NULL,
    CONSTRAINT chk_self_performance_bonus_config_singleton CHECK (singleton_guard = TRUE),
    CONSTRAINT uq_self_performance_bonus_config_singleton UNIQUE (singleton_guard)
);

INSERT INTO self_performance_bonus_config (id, singleton_guard, enabled, updated_at)
VALUES ('00000000-0000-0000-0000-000000000001', TRUE, FALSE, CURRENT_TIMESTAMP);
```

`CompensationPlanVersion` gets a `DEFAULT 0` on the new pct columns (not `DEFAULT 0` on genesis's existing row retroactively re-published — the default just satisfies `NOT NULL` for the one pre-existing row from V8; genesis's row ends up with 0%/0%, i.e. inert, until an admin publishes a new version with real rates, consistent with how every other rate column would behave if added post-hoc).

### `CompensationPlanVersion.java`

Four new `BigDecimal` fields + getters, added to the constructor (append-only, no setters — same pattern as every existing field).

### New files, mirroring `WithdrawalConfig*` exactly

- `com.plotchain.compensation.SelfPerformanceBonusConfig` (entity: `id`, `singletonGuard`, `enabled`, `updatedAt`)
- `com.plotchain.compensation.SelfPerformanceBonusConfigRepository extends JpaRepository<..., UUID>` (no custom methods)
- `com.plotchain.compensation.SelfPerformanceBonusConfigService` — `currentConfig()` (`findAll().stream().findFirst().orElseThrow(...)`), `updateConfig(SelfPerformanceBonusConfigRequest, UUID actorId)` (mutate in place, save, record via `SettingsAuditService`)
- `com.plotchain.compensation.SelfPerformanceBonusConfigController` — `GET`/`PUT /api/company/self-performance-bonus`
- `SelfPerformanceBonusConfigRequest(@NotNull Boolean enabled)`, `SelfPerformanceBonusConfigResponse(boolean enabled, Instant updatedAt)`

### `IncomeType`

Add `SELF_PERFORMANCE` to the enum.

## Crediting flow (`SaleService.recordSale()`)

Inserted immediately after the existing Direct Income credit block, inside the same transaction:

1. `SelfPerformanceBonusConfig config = selfPerformanceBonusConfigService.currentConfig();`
2. If `!config.isEnabled()`, skip — no entry.
3. `BigDecimal sqft = plot.getAreaSqft();`
4. Determine rate: tier 2 if `sqft >= planVersion.getSelfPerformanceTier2SqftThreshold()`, else tier 1 if `sqft >= planVersion.getSelfPerformanceTier1SqftThreshold()`, else skip (no entry).
5. `gross = sale.getAmount() * pct/100`; if `gross <= 0`, skip (mirrors every other income type's zero-gross guard).
6. Deductions: same TDS/admin math already computed for Direct Income in this method.
7. `LedgerEntry`: `IncomeType.SELF_PERFORMANCE`, `associateId = sale.getAssociateId()`, `cycleId` = the same cycle Direct Income uses, `sourceRef = sale.getId()`, `status` = KYC-gated: a small private `kycGatedStatus(Associate)` method added to `SaleService`, duplicating `CycleService.kycGatedStatus()`'s one-line logic (`VERIFIED` → `PENDING`, else → `CARRIED_FORWARD`) rather than extracting a shared utility — consistent with how the deduction math (Decision 6) is already duplicated between the two classes rather than factored out; no cross-class extraction is in scope for this feature.

No new idempotency check needed: `recordSale()` creates exactly one `Sale` row per call already, so at most one `SELF_PERFORMANCE` entry follows structurally, same as Direct Income's own unconditional single insert.

## Admin API surface

- New: `GET`/`PUT /api/company/self-performance-bonus` (the toggle only, mirroring `/api/company/withdrawal`).
- Existing, extended: `CompensationPlanRequest`/`CompensationPlanResponse`/`CompensationPlanService` gain the four new rate/threshold fields, alongside `directIncomePct` etc. — no new endpoint, just new fields on the existing compensation-plan admin flow.
- Frontend work (a toggle control plus two rate/threshold inputs) is out of scope for this backend spec.

## Testing

- `SaleServiceTest`: both tiers correct, below-threshold no-entry, config-disabled no-entry regardless of sqft, KYC-gated status (PENDING vs CARRIED_FORWARD), exact-boundary sqft values pin the `>=` semantics.
- New `SelfPerformanceBonusConfigServiceTest` (unit, mirrors `WithdrawalConfigServiceTest`).
- New `SelfPerformanceBonusConfigControllerTest` (integration, MockMvc + real security chain, mirrors `WithdrawalConfigControllerTest`).
- One integration test on the real `recordSale()` flow proving Direct Income and Self-Performance Bonus both land correctly in the same transaction when enabled and a qualifying sale is recorded.

## Out of scope

- Frontend admin UI.
- Any change to Direct Income's own always-PENDING status (a pre-existing, separate gap — not addressed here).
- The PAN admin-charge-tier gap (documented elsewhere, not addressed here).
