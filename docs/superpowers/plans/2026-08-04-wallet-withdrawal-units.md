# Wallet / Withdrawal — Unit Queue

Sliced from `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` by spec-slicer via `spec-cycle-orchestrator`, 2026-08-14. This file is the persisted record of that slice — a fresh session should read this instead of re-running spec-slicer, unless the source spec has changed since.

No ADRs or glossary file exist for this spec; sliced from the spec doc alone. The spec has no dedicated "Screens" section — the screen cross-check below is derived from `mlm-land-platform-spec.md` §5.1/§5.2 (quoted inline in this file), the same pattern used for `docs/superpowers/plans/2026-08-03-income-ledger-units.md`.

**Status legend:** `pending` (not started) · `planned` (plan file exists, not yet implemented) · `merged` (implemented, reviewed, on `master`)

| # | Type | Unit | Depends on | Status | Plan file | Merged as |
|---|---|---|---|---|---|---|
| 1 | backend | Wallet crediting batch step — `POST /api/admin/cycles/{id}/credit-wallets` | none | merged | `2026-08-14-wallet-withdrawal-credit-wallets.md` | `13d4e62..039e286` |
| 2 | backend | Associate views own wallet balance — `GET /api/associates/me/wallet` | none | merged | `2026-08-14-wallet-withdrawal-associate-balance.md` | `1bc8ab6..f8f9b48` |
| 3 | backend | `withdrawal_config` gains a minimum-withdrawal-amount field, required for Go-Live | none | merged | `2026-08-14-wallet-withdrawal-config-minimum.md` | `85d2367..d4286e8` |
| 4 | backend | KYC-verification-triggered reconciliation sweep credits `CARRIED_FORWARD` entries | 1 | pending | | |
| 5 | backend | Admin submits a withdrawal request for an associate — `POST /api/admin/withdrawals` | 3 | pending | | |
| 6 | backend | Admin views the approval queue — `GET /api/admin/withdrawals` | 5 | pending | | |
| 7 | backend | Admin approves, rejects, or cancels-after-approval a request — `POST /api/admin/withdrawals/{id}/decision` | 5 | pending | | |
| 8 | backend | Admin disburses an approved request — `POST /api/admin/withdrawals/{id}/disburse` | 7 | pending | | |
| 9 | backend | Associate views own withdrawal history — `GET /api/associates/me/withdrawals` | 6 | pending | | |
| 10 | screen | Admin "Ledger / Payout Approval" screen — withdrawal request lifecycle | 5, 6, 7, 8 | pending | | |
| 11 | screen | Associate "Payout History" screen — wallet balance + own withdrawal history | 2, 9 | pending | | |
| 12 | screen | Admin "Cycle Management" screen gains a "Credit Wallets" action for `CLOSED` cycles | 1 | merged | `2026-08-14-wallet-withdrawal-unit-12-cycle-management-credit-wallets.md` | `a222839..543562a` |

## Unit detail

### 1. Wallet crediting batch step — `POST /api/admin/cycles/{id}/credit-wallets`, ADMIN-only

**Depends on:** none
**Refs:** Scope; Decisions 1, 2, 3, 5; Data model migration; Flow "Wallet crediting"; Error handling table; Testing section (`WalletCreditingServiceTest`, idempotency test, concurrency test)

Acceptance criteria:
- New endpoint added to the existing `CycleController` (cross-package addition, Decision 1 — same precedent Cycle Management itself set), backed by a new `WalletCreditingService` in the `wallet` package.
- `SELECT ... FOR UPDATE` row-locks the `Cycle` first (Decision 2). `CLOSED` → proceed; `PAID` → `CyclePayoutStateException` 409 ("already credited"); `OPEN`/`CALCULATING` → `CyclePayoutStateException` 409 ("settlement not closed yet").
- Every `PENDING` `LedgerEntry` for the cycle (new `LedgerEntryRepository.findByCycleIdAndStatus`) is credited via a new atomic `WalletRepository.creditBalance(UUID, BigDecimal): int` `@Modifying @Query` (Decision 5) and flipped to `PAID`; entries in other cycles or with `CARRIED_FORWARD`/`REVERSED` status are untouched.
- A first-time associate with no prior `Wallet` row gets one created (`Wallet.zero`) rather than erroring.
- `cycle.status` becomes `PAID` once all `PENDING` entries are processed, unconditionally regardless of any `CARRIED_FORWARD` entries still sitting in the cycle (Decision 3).
- Returns `WalletCreditingResult(cycleId, entriesCredited, totalAmountCredited, newCycleStatus)`.
- Any mid-batch failure rolls back completely — zero wallet balance changes, zero entry status changes, cycle stays `CLOSED` — and is safely retryable (idempotency test); the status transition itself is the idempotency marker, no new unique-constraint needed (Decision 2).
- Two concurrent calls against the same cycle: the second blocks on the row lock, then 409s once the first commits; credited amounts appear exactly once (concurrency test).
- Unknown `{id}` → 404 `CycleNotFoundException`. Non-ADMIN token → 403.

### 2. Associate views own wallet balance — `GET /api/associates/me/wallet`, any authenticated associate

**Depends on:** none
**Refs:** Decision 13; Flow "`GET /api/associates/me/wallet`"; Testing (`WalletControllerTest`)

Acceptance criteria:
- New `WalletController` (`wallet` package) — a small dedicated endpoint, not folded into the dashboard (Decision 13); `DashboardService.getDashboard()`'s existing `WalletSummary` read path is untouched.
- `associateId` from `@AuthenticationPrincipal`.
- Returns `WalletBalanceResponse(balance)` using the same lazy-default pattern (`findById(...).orElseGet(() -> Wallet.zero(...))`) `DashboardService` already uses — a never-credited associate gets `0`, not 404.
- Reachable by any authenticated associate token, no admin-only restriction. Unauthenticated → 401.

### 3. `withdrawal_config` gains a minimum-withdrawal-amount field, required for Go-Live

**Depends on:** none
**Refs:** Decisions 6, 18; Data model migration (`ALTER TABLE withdrawal_config ADD COLUMN minimum_withdrawal_amount`); Entity changes section; Testing (`WithdrawalConfigServiceTest` additions, `SetupStateServiceTest` addition)

Acceptance criteria:
- New migration: `ALTER TABLE withdrawal_config ADD COLUMN minimum_withdrawal_amount NUMERIC(14,2)`, nullable, no default (Decision 18 — not the `NOT NULL DEFAULT 0` Decision 6 originally drafted).
- `WithdrawalConfig` entity, `WithdrawalConfigRequest`/`Response` DTOs, and `WithdrawalConfigService.updateConfig()` all extended with the field, round-tripping correctly through the *existing* update/get endpoints — no new endpoint, per Decision 6's "extend the domain that already owns this config" instinct.
- `WithdrawalConfigService.isComplete()` (new): `false` while `minimumWithdrawalAmount` is `null` (the fresh V9-seeded row's state), `true` once set — including set to exactly `0` (an explicit "no minimum" still counts as complete, distinct from never-set).
- `SetupStateService`'s `paymentsKyc` step gains a third clause: `&& withdrawalConfigService.isComplete()`, alongside the existing `paymentConfigService`/`payoutBankAccountService` checks — Go-Live is blocked until an admin explicitly sets this field.
- `approvalMode`/`autoApproveLimit` are unaffected — they keep their existing always-defaulted, non-blocking behavior (Decision 18).

**Note for whoever plans this unit:** the existing Payments & KYC setup-wizard frontend (`payments-kyc.service.ts`, already built in an earlier spec) will need a new field for `minimum_withdrawal_amount` to make this Go-Live gate satisfiable from the UI. That's a touch-up to an already-shipped screen, not a PRD-named screen in its own right (see Excluded section below) — raise it with whoever owns that screen rather than inventing a unit for it here.

### 4. KYC-verification-triggered reconciliation sweep credits `CARRIED_FORWARD` entries

**Depends on:** 1 — reuses the atomic `creditBalance` + per-entry status-flip mechanism unit 1 establishes in `WalletCreditingService` (Decision 16: "same atomic mechanism as the main crediting step").
**Refs:** Decision 16; Flow "KYC-verification-triggered reconciliation sweep"; Entity changes (`KycReviewService` gains a `WalletCreditingService` dependency); Testing (`KycReviewServiceTest` addition, `WalletCreditingServiceTest` addition for `reconcileCarriedForward`)

Acceptance criteria:
- `KycReviewService.decide()` (existing, `associate` package), on a `VERIFIED` decision only, now calls a new `WalletCreditingService.reconcileCarriedForward(associateId)` — no sweep on a `REJECTED` decision.
- Sweep finds every `LedgerEntry` for that associate with `status = CARRIED_FORWARD` across *any* cycle (no `cycleId` filter, deliberately unscoped) via new `LedgerEntryRepository.findByAssociateIdAndStatus`.
- Each found entry: `walletRepository.creditBalance(associateId, entry.netAmount)` (creating a `Wallet` row first if none exists), `entry.status = PAID`.
- `Cycle.status` is never touched by this sweep, regardless of which (possibly already-`PAID`) cycles those entries belonged to — a cycle already `PAID` for everyone else stays `PAID`.
- Audit-logged under `section = "wallet"`, `actorId` = whoever made the KYC decision.
- An associate with zero `CARRIED_FORWARD` entries: sweep is a no-op, the KYC decision still succeeds normally with its existing `KycQueueEntryResponse` shape unchanged.
- Entries spanning multiple cycles for one associate are credited in a single call; running the sweep twice in a row is safe (second run finds nothing left in `CARRIED_FORWARD`).

### 5. Admin submits a withdrawal request for an associate — `POST /api/admin/withdrawals`, ADMIN-only

**Depends on:** 3 — enforces `withdrawalConfig.minimumWithdrawalAmount`, added there.
**Refs:** Decisions 5, 6, 7, 9, 10, 11, 12, 15; Data model (`withdrawal_request` table, `WithdrawalRequest`/`WithdrawalRequestStatus`/`WithdrawalRequestRepository`); Flow "Submit a withdrawal request"; Error handling table; Testing (`WithdrawalServiceTest`, `WithdrawalControllerTest` submit cases)

Acceptance criteria:
- New migration creates `withdrawal_request` (id, `associate_id` FK, amount, status, reason, bank_reference, requested_at, decided_at, disbursed_at + status/amount check constraints), per Data model section.
- New `WalletRepository.debitIfSufficient(UUID, BigDecimal): int` atomic `@Modifying @Query` (Decision 5) — returns `0` both when balance is too low and when no `Wallet` row exists at all, covering both cases identically.
- Guard clauses (Decisions 9, 6, 5/10), each its own status code: unknown `associateId` → 404 `AssociateNotFoundException`; `SUSPENDED` associate → 409 `AssociateSuspendedException`; `kycStatus != VERIFIED` → 409 `KycNotVerifiedException`; `amount <= 0` → 400 (`@Positive`); `amount < withdrawalConfig.minimumWithdrawalAmount` → 409 `BelowMinimumWithdrawalException`; `debitIfSufficient` returns `0` → 409 `InsufficientWalletBalanceException`.
- Funds are debited atomically at request-creation time, not at approval or disbursement (Decision 10).
- Auto-approval (Decision 7): if `approvalMode == AUTO_UNDER_LIMIT && amount <= autoApproveLimit`, the request is created directly `APPROVED` (`decidedAt` set now); otherwise created `REQUESTED`.
- Admin can submit a request for itself (the root Admin row) with no special-casing (Decision 15).
- `AdminWithdrawalResponse` resolves `associateUserId`/`associateName` for the submitted request (Decision 14).
- `settingsAuditService.record("withdrawal", ...)` logged on submission (Decision 11).
- 201 on success; non-ADMIN token → 403.

### 6. Admin views the approval queue — `GET /api/admin/withdrawals`, ADMIN-only

**Depends on:** 5
**Refs:** Decision 14; Flow "Approval queue"; Testing (`WithdrawalControllerTest` list-with-filters case)

Acceptance criteria:
- New `WithdrawalRequestRepository.search(UUID associateId, WithdrawalRequestStatus status, Pageable): Page<WithdrawalRequest>`, same null-safe `(:param IS NULL OR ...)` shape as `LedgerEntryRepository.search`/`AssociateRepository.searchDirectory`.
- `associateId` (optional) and `status` (optional) filter independently and in combination; `page`/`size` clamped 0–100, default 0/20, same shape as `GET /api/admin/ledger`.
- Response is `AdminWithdrawalPageResponse` of `AdminWithdrawalResponse` rows, each batch-resolving `associateUserId`/`associateName` via `associateRepository.findAllById` over the distinct associate ids in the page (Decision 14).
- Non-ADMIN token → 403; unauthenticated → 401.

### 7. Admin approves, rejects, or cancels-after-approval a request — `POST /api/admin/withdrawals/{id}/decision`, ADMIN-only

**Depends on:** 5
**Refs:** Decisions 8, 9, 10, 11, 17; Flow "Decide"; Error handling table; Testing (`WithdrawalServiceTest` decision cases including cancel-from-`APPROVED`, `WithdrawalControllerTest` decision cases)

Acceptance criteria:
- Unknown `{id}` → 404 `WithdrawalRequestNotFoundException`.
- Precondition, broadened per Decision 17 (post-review): `status == REQUESTED` → `decision` may be `APPROVED` or `REJECTED`. `status == APPROVED` → `decision` must be `REJECTED` (re-approving an already-`APPROVED` request is `InvalidWithdrawalStateException`, 409). `status` in `{REJECTED, DISBURSED}` → any decision is `InvalidWithdrawalStateException`, 409.
- `decision == REJECTED` with a blank reason → 400, whether the prior status was `REQUESTED` or `APPROVED` — a cancel always requires a reason too.
- `APPROVED` outcome (only reachable from `REQUESTED`): re-checks `associate.kycStatus == VERIFIED` (Decision 9) → 409 `KycNotVerifiedException` if it regressed since submission; sets `status = APPROVED`, `decidedAt = now()`, no balance change.
- `REJECTED` outcome (reachable from `REQUESTED` or `APPROVED`): `walletRepository.creditBalance(associateId, amount)` refund (Decision 10), same call whether it's a first-time reject or a post-approval cancel; sets `status = REJECTED`, `reason`, `decidedAt = now()`.
- No dedicated "hold" status/endpoint (Decision 8) — a request Admin isn't ready to decide on simply stays `REQUESTED`.
- Audit log message distinguishes `"Withdrawal rejected for X"` vs `"Withdrawal cancelled after approval for X"` even though the stored `status` is identically `REJECTED` either way (Decision 17).
- Non-ADMIN token → 403.

### 8. Admin disburses an approved request — `POST /api/admin/withdrawals/{id}/disburse`, ADMIN-only

**Depends on:** 7
**Refs:** Decision 11; Flow "Disburse"; Error handling table; Testing (`WithdrawalServiceTest`/`WithdrawalControllerTest` disburse cases)

Acceptance criteria:
- Unknown `{id}` → 404 `WithdrawalRequestNotFoundException`.
- `status != APPROVED` → 409 `InvalidWithdrawalStateException`.
- Blank `bankReference` → 400 (`@NotBlank`).
- Sets `status = DISBURSED`, `bankReference` = request value, `disbursedAt = now()` — no wallet mutation (already debited at submission, Decision 10).
- `settingsAuditService.record("withdrawal", ...)` logged.
- Non-ADMIN token → 403.

### 9. Associate views own withdrawal history — `GET /api/associates/me/withdrawals`, any authenticated associate

**Depends on:** 6 — reuses `WithdrawalRequestRepository.search` introduced there.
**Refs:** Decision 14 (and the associate-scoping pattern income-ledger's unit 2 established); Flow "Own withdrawal history"; Testing (`WithdrawalControllerTest` associate-history case, `SecurityConfigTest`)

Acceptance criteria:
- `associateId` from `@AuthenticationPrincipal`, never a request parameter — no way to override via query string.
- `status` (optional), `page`/`size` filters, same clamping as unit 6.
- Response is `AssociateWithdrawalPageResponse` of `AssociateWithdrawalResponse` rows — no associate-identity fields, since every row is always the caller (Decision 14).
- Never returns another associate's rows regardless of filter values passed.
- Any authenticated associate token can reach this endpoint (no ADMIN restriction); unauthenticated → 401.

### 10. Admin "Ledger / Payout Approval" screen — withdrawal request lifecycle

**Depends on:** 5, 6, 7, 8
**Refs:** `mlm-land-platform-spec.md` §5.2 "Ledger / Payout Approval" — "Review before disbursal: Pending payouts list, KYC-blocked list, bulk approve/hold, manual adjustment with mandatory audit note"; units 5/6/7/8's endpoints.

Acceptance criteria:
- Screen lets Admin submit a withdrawal request on a named associate's behalf (unit 5), view the paginated/filterable approval queue by associate and status (unit 6), approve/reject/cancel-after-approval with a reason (unit 7), and mark an approved request disbursed with a manually-entered bank reference (unit 8).
- Each queue row shows the resolved associate name (not a raw UUID), per unit 6's batch-loaded response shape.
- View reflects this spec's actual state machine (`REQUESTED`/`APPROVED`/`REJECTED`/`DISBURSED`) — no distinct "hold" affordance (Decision 8 explicitly declines one) and no bulk approve/hold action (no bulk endpoint exists in this spec).

**Open question — flagged not resolved:** the PRD's "Ledger / Payout Approval" also names a "KYC-blocked list" and "bulk approve/hold" — neither has a backing endpoint in this spec (nothing bulk is built; a KYC block just surfaces as a 409 at submission/decision time, not a queryable list). Whoever plans this unit should decide whether to synthesize a client-side "blocked" view from 409 responses or omit it; not resolved here.

### 11. Associate "Payout History" screen — wallet balance + own withdrawal history

**Depends on:** 2, 9
**Refs:** `mlm-land-platform-spec.md` §5.1 "Payout History" — "Past settlements: Cycle, amount paid, TDS/admin deducted, bank reference, downloadable statement (PDF)"; units 2/9's endpoints. (Income/Ledger's Excluded section explicitly deferred this screen to "a separate future spec" — this is that spec.)

Acceptance criteria:
- Screen shows the associate's current wallet balance (unit 2) alongside their own withdrawal request history — status, amount, bank reference once `DISBURSED`, filterable by status (unit 9).
- View-only, matching the role-capability matrix's associate read-only posture for this domain.

**Open question — flagged not resolved:** the PRD's "Payout History" also names "TDS/admin deducted" (a per-cycle deduction breakdown) and a "downloadable statement (PDF)" — neither is built by this spec (`withdrawal_request` has no TDS/deduction fields, and no export/PDF endpoint exists anywhere in Scope). The screen ships without them; a future spec would need to add the fields/export before this table can show them.

### 12. Admin "Cycle Management" screen gains a "Credit Wallets" action for `CLOSED` cycles

**Depends on:** 1
**Refs:** `mlm-land-platform-spec.md` §5.2 "Cycle Management" — "Trigger/monitor cycle close... status of current cycle (open/calculating/closed/paid)"; this spec's Context section ("Cycle Management's settlement batch... was deliberately scoped to stop at `LedgerEntry.status = PENDING`... and explicitly left 'wallet balance crediting and the `CLOSED → PAID` cycle transition' to this spec"); unit 1's endpoint; `docs/superpowers/plans/2026-08-03-cycle-management-units.md` unit 11 (the already-merged Cycle Management screen this extends).

Acceptance criteria:
- The already-shipped Admin Cycle Management screen (cycle-management spec's unit 11, merged `docs/superpowers/plans/2026-08-13-cycle-management-screen.md`) gains a "Credit Wallets" action, visible/enabled only for a `CLOSED` cycle, calling unit 1's `POST /api/admin/cycles/{id}/credit-wallets`.
- On success, the screen's cycle-status display now shows `PAID` — the fourth status value the existing screen's "open/calculating/closed/paid" status track already anticipated per the PRD, first made reachable by this spec.
- A cycle that's already `PAID` shows the action disabled/hidden rather than erroring; the underlying 409 case (already credited, or not yet `CLOSED`) is unit 1's concern — this screen just reflects current status to avoid a pointless call.
- This is a targeted addition to an existing screen's component, not a new screen or route.

## Excluded — not a unit

- **Real payment gateway / bank transfer integration** — named out of scope; `disburse` stays a manual admin action recording a reference, never an API call to a bank.
- **Per-associate bank account capture** — `PayoutBankAccount` confirmed company-level-only (Context finding 2); a future Associate-profile-extension spec, not this one.
- **Withdrawal frequency limits** — no config field, migration, or UI exists for it anywhere in the real codebase (Context finding 1); not invented here.
- **A distinct "hold" status/endpoint** — reconciled in Decision 8 as *not* a separate mechanism; `REQUESTED`-and-undecided already means it.
- **A standalone "repository query method" unit** for `WithdrawalRequestRepository.search` — layer-shaped, not an observable outcome on its own; built as part of unit 6 and reused unmodified by unit 9 (same exclusion pattern as `income-ledger`'s `LedgerEntryRepository.search`).
- **A screen unit for the existing Payments & KYC setup wizard** picking up `minimum_withdrawal_amount` — that screen isn't named in `mlm-land-platform-spec.md` §5.1/§5.2's table (income-ledger's cross-check precedent scopes screens strictly to that table); flagged as a note under unit 3 instead of invented as a unit.

## File overlap check against other approved/in-flight units (done at slice time)

- `wallet` package (`Wallet.java`, `WalletRepository.java`) is entity+repository only today — confirmed no controller anywhere in `backend/src/main/java/com/plotchain/wallet/`. **Units 1 and 5 both add a new `@Modifying @Query` method to the same existing `WalletRepository.java`** (`creditBalance` and `debitIfSufficient` respectively) — additive, no logic overlap, but the same file. Since unit 5 depends on unit 3 (not unit 1), these two could be worked in parallel worktrees; sequence them or merge carefully to avoid a trivial interface-file conflict.
- `payments` package already has `WithdrawalConfigController`/`Service`/`Repository`/`WithdrawalConfig`/DTOs (setup-wizard policy config) and `PayoutBankAccountController`/`Service` (company-level singleton bank account) — confirmed via `find`. Unit 3 extends `WithdrawalConfig`/`WithdrawalConfigRequest`/`Response`/`Service` with the new field; no other unit touches `payments` package files.
- `cycle` package (`CycleController.java`, `Cycle.java`, `CycleStatus.java`) already exists (Cycle Management spec, merged 11/11) — unit 1 adds a new endpoint method to the existing `CycleController`, a cross-package addition flagged explicitly by the spec itself (Decision 1), same precedent Cycle Management set for `SaleRepository.findByCycleIdAndStatus`.
- `associate` package's `KycReviewService.java` (existing, merged with the role-capability spec) is modified by unit 4 — the one cross-package change this spec makes outside `wallet`/`withdrawal`/`payments`, flagged explicitly by the spec (Decision 16).
- `company` package's `SetupStateService.java` (existing) is modified by unit 3 — a second cross-package change, flagged explicitly by the spec (Decision 18).
- `income` package (`LedgerEntry`, `LedgerEntryRepository`, already has `search`, several `sum*`/`exists*`/`findBy*` methods per income-ledger's own overlap check) gains two new read methods — `findByCycleIdAndStatus` (unit 1) and `findByAssociateIdAndStatus` (unit 4) — both additive to the existing repository interface, no collision with each other or with income-ledger's `search`.
- No unit in this file touches `sales`, `legvolume`, `tree`, `rank`, `compensation`, `announcement`, `booking`, `projects`, or `stats` packages.
