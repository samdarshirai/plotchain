# Wallet / Withdrawal Domain (Wallet Crediting, Withdrawal Requests, Approval Queue, Disbursement)

## Context

The `wallet` package (`Wallet`, `WalletRepository`) is entity+repository only, per the reconciliation audit in `docs/superpowers/specs/2026-08-03-role-capability-data-visibility-design.md`: no controller, no write path that ever sets a non-zero balance. `Wallet.balance` is read today by exactly one caller, `DashboardService.getDashboard()` (`walletRepository.findById(associateId).orElseGet(() -> Wallet.zero(associateId))`, surfaced as `DashboardResponse.WalletSummary`) — that read path is not touched by this spec and must keep working unmodified. The `payments` package (`WithdrawalConfigController`/`Service`/`Repository`, `PayoutBankAccount`) is entirely setup-wizard policy configuration; nothing in it is a runtime `WithdrawalRequest` entity or an approval-queue endpoint.

This is the seventh and last of the not-built domains identified by that audit. It sits directly downstream of `docs/superpowers/specs/2026-08-03-cycle-management-domain-design.md`'s settlement batch, which was deliberately scoped to stop at `LedgerEntry.status = PENDING` (KYC-verified) or `CARRIED_FORWARD` (KYC-withheld) and explicitly left "wallet balance crediting and the `CLOSED → PAID` cycle transition" to this spec. It also builds on the role model from the role-capability spec: Admin has an approval queue (approve/reject/hold) and submits withdrawal requests on an associate's behalf; Associate has read-only balance + history.

**Two reconciliation findings that reshape this spec's scope, found while reading the real code rather than assuming the PRD's sketch still matches it:**

1. **`WithdrawalConfig` (`payments` package) has no minimum-withdrawal-threshold field.** Its only fields are `approvalMode` (`AUTO_UNDER_LIMIT` / `ALWAYS_MANUAL`) and `autoApproveLimit` — an auto-approval policy, not a minimum-request-amount gate. Neither the entity, the migration (`V9__payment_and_kyc_config.sql`), the request/response DTOs, nor the setup wizard's frontend (`payments-kyc.service.ts`) carry anything resembling "minimum withdrawal amount" or "frequency limit." The PRD's characterization of this config predates what was actually built. This spec resolves it in Decision 6, not by ignoring the requirement to enforce a minimum, but by extending the existing table rather than inventing a parallel one.
2. **`PayoutBankAccount` is company-level, not associate-level**, confirmed by reading the entity: it's a `singleton_guard`-gated singleton (`CREATE TABLE payout_bank_account (... singleton_guard BOOLEAN ..., CONSTRAINT uq_payout_bank_account_singleton UNIQUE (singleton_guard) ...)`) holding one bank account the *company* pays *from* — set up once in the Payments & KYC wizard step. There is no per-associate bank-details table anywhere in the codebase. This confirms the PRD's `bank_ref` on `WithdrawalRequest` can only ever be a free-text reference an admin records by hand (e.g. a UTR/transaction-reference number from a manual bank transfer they just performed outside this system) — not a link to a payee account this system holds, since no such per-associate record exists. Capturing associate bank details is a future Associate-profile-extension spec (see Scope).

`mlm-land-platform-spec.md` §3 step 8's real ledger-status story was already reconciled by the Cycle Management spec (Decision 11): `PENDING` = computed and KYC-clear, `CARRIED_FORWARD` = computed but withheld pending KYC. Neither of the real enum values means "paid out" — `LedgerEntryStatus.PAID` exists but is unused by any writer today. This spec is what finally uses it.

## Scope

**In scope:**
- **Wallet crediting**: an admin-triggered step, separate from settlement close, that finds a closed cycle's `PENDING` `LedgerEntry` rows, increments each associate's `Wallet.balance`, marks the entries `PAID` (repurposing the existing unused enum value to mean "credited to wallet," not "disbursed to a bank"), and advances `Cycle.status` to `PAID` once done.
- `GET /api/associates/me/wallet` — own balance, associate-only.
- `POST /api/admin/withdrawals` — Admin submits a withdrawal request for a named associate (not an associate self-serve action, per the role model).
- `GET /api/admin/withdrawals` — approval queue, paginated/filterable by associate and status.
- `POST /api/admin/withdrawals/{id}/decision` — approve/reject with reason, mirroring `KycReviewService.decide()`.
- `POST /api/admin/withdrawals/{id}/disburse` — marks an approved request disbursed, records a manually-entered bank reference.
- `GET /api/associates/me/withdrawals` — own withdrawal history, view-only.
- Extending `withdrawal_config` with the minimum-threshold field it's missing (Decision 6), and — per post-review resolution — making it a required Go-Live field (Decision 18), not an always-defaulted one.
- **Post-review addition**: a KYC-verification-triggered reconciliation sweep that credits an associate's `CARRIED_FORWARD` entries once their KYC clears (Decision 16) — originally deferred, now in scope per explicit resolution below.
- **Post-review addition**: a cancel path for an `APPROVED`-but-not-yet-`DISBURSED` withdrawal request (Decision 17) — originally an open question, now in scope per explicit resolution below.

**Out of scope** (deferred, one sentence each):
- Any real payment gateway / bank transfer integration — `disburse` is a manual admin action recording a reference to a transfer that happened outside this system, not an API call to a bank.
- Per-associate bank account capture — `PayoutBankAccount` is confirmed company-level-only (see Context finding 2); giving each associate a place to register their own receiving bank details is a future Associate-profile-extension spec, not designed here.
- Withdrawal frequency limits — the PRD gestures at "frequency settings" but no config field, migration, or UI for it exists anywhere in the real codebase (see Context finding 1); not invented here since nothing in Scope calls for it.
- A distinct "hold" state/endpoint in the approval queue — reconciled in Decision 8, not built as a separate mechanism.

## Decisions

1. **Wallet crediting is a separate admin-triggered step, not folded into Cycle Management's settlement close.** New endpoint `POST /api/admin/cycles/{id}/credit-wallets`, added to Cycle Management's `CycleController` (cross-package addition — same precedent Cycle Management itself set by adding `SaleRepository.findByCycleIdAndStatus`, "owned by the Sales package, added here since Sales didn't need it"), backed by a new `WalletCreditingService` that lives in the `wallet` package, since the logic's job — reading `LedgerEntry`, writing `Wallet.balance` — is a wallet-domain concern even though it's triggered from a cycle-scoped URL. Rationale: Cycle Management's settlement batch already holds a row lock on `Cycle` and a large in-memory tree walk inside one long transaction (its own Decision 1); folding wallet-crediting into that same transaction would extend an already-long lock further and conflate two different administrative moments — "close the books and calculate what's owed" (finance/ops function, may want to review the settlement result before releasing funds) vs. "release this cycle's calculated income into associates' spendable wallet balances" (a deliberate, separate go/no-go action). Cycle Management's own Out of Scope section anticipated exactly this split ("a future Wallet/Withdrawal spec decides... via a separate settlement step").

2. **Crediting's idempotency/concurrency mechanism directly mirrors Cycle Management's Decisions 1–3** (same pattern, not a different one invented without reason, per the task's explicit instruction): `credit-wallets` runs inside one `@Transactional` method; its first statement is `SELECT ... FROM cycle WHERE id = :id FOR UPDATE`, same row-lock-as-first-statement discipline as settlement close. Status must be `CLOSED` (not yet credited) or the call 409s: `CLOSED` → proceed; `PAID` → already credited, `CyclePayoutStateException`; `OPEN`/`CALCULATING` → settlement hasn't finished yet, same exception with a different message. A second concurrent call blocks on the lock, then re-reads status and gets the same 409 the first request's outcome implies — identical shape to Cycle Management's Decision 2. Unlike settlement, this step's own idempotency doesn't need a new unique-constraint safety net: settlement's problem was preventing duplicate *inserts* on retry, which needed a DB constraint as backstop; crediting only ever *updates* existing `PENDING` rows filtered by status, so a retry after a full rollback finds the exact same (uncredited) set of rows it started with, and a retry after a real commit finds zero `PENDING` rows left to touch — the status transition itself is the idempotency marker, structurally, with no separate constraint required.

3. **`Cycle.status` reaches `PAID` when crediting finishes processing all of that cycle's `PENDING` entries — regardless of any `CARRIED_FORWARD` entries still sitting in it.** `PAID` is read here as "this cycle's payable-and-KYC-clear income has been released to wallets," not "every ledger entry this cycle ever produced is now settled." A cycle with some KYC-withheld associates still reaches `PAID` once everyone else is credited; the withheld entries remain `CARRIED_FORWARD` indefinitely until a future spec resolves that reconciliation (Cycle Management's own unresolved gap, restated in Open Questions here).

4. **`LedgerEntryStatus.PAID` means "credited to the associate's wallet balance," distinct from a `WithdrawalRequest` reaching `DISBURSED` ("money has actually left the company's bank account for this specific withdrawal").** This is a two-hop model — cycle income becomes spendable wallet balance (this step), then a slice of that wallet balance becomes an actual bank payout (the withdrawal flow) — matching how `Wallet.balance` is a real accumulating pool an associate draws down over time via multiple withdrawal requests across many cycles' worth of credited income, not a 1:1 mapping from one cycle's income to one withdrawal.

5. **Wallet balance mutations use atomic conditional `UPDATE` queries (`@Modifying @Query`), not JPA entity dirty-checking.** `WalletRepository` gains `creditBalance(UUID associateId, BigDecimal amount)` (`UPDATE wallet SET balance = balance + :amount WHERE associate_id = :associateId`) and `debitIfSufficient(UUID associateId, BigDecimal amount): int` (`UPDATE wallet SET balance = balance - :amount WHERE associate_id = :associateId AND balance >= :amount`, returning affected-row-count). A plain `find → mutate in Java → save` round trip is a read-then-write race between two concurrent operations touching the same associate's wallet (e.g. two different cycles' crediting runs, or a crediting run overlapping a withdrawal-request debit) — `Wallet` has no `@Version` column today, so nothing would catch a lost update. The atomic `UPDATE` closes that race without adding optimistic-locking machinery: Postgres's own row-level write lock on the `UPDATE` statement serializes concurrent attempts. `debitIfSufficient` returning `0` affected rows elegantly covers two cases identically — insufficient balance, *and* no `Wallet` row existing at all yet (an associate with zero credited income has an implicit balance of zero, and `0 >= amount` is false for any positive `amount`) — so no separate "wallet doesn't exist" branch is needed in the withdrawal-request flow.

6. **`withdrawal_config` gains a `minimum_withdrawal_amount` column** (new migration, `NUMERIC(14,2) NOT NULL DEFAULT 0`), and `WithdrawalConfig`/`WithdrawalConfigRequest`/`WithdrawalConfigResponse`/`WithdrawalConfigService` (all in the `payments` package) are extended with the corresponding field, rather than this spec inventing a second, competing withdrawal-policy table. This is the same "extend the domain that already owns this config rather than duplicate it" instinct the task brief called for, applied at the schema level instead of just a repository method (Cycle Management's precedent was query-method-level; this is one level up, but the same reasoning: `payments` already owns "withdrawal policy," and a second table would immediately raise "which one wins" the moment they disagree). `POST /api/admin/withdrawals` reads this value and rejects (409) any request below it. This is a genuine, out-of-band change to another domain's table/entity/DTOs — flagged clearly here rather than silently bundled, since whoever implements this spec needs to touch `payments` package files, not just `wallet`/new withdrawal files.

7. **The existing `approvalMode`/`autoApproveLimit` fields are put to their evidently-intended use: auto-approval at request-creation time.** Today these fields are configurable via the setup wizard but read by nothing at runtime — a dead setting. At `POST /api/admin/withdrawals`, after the minimum-threshold (Decision 6) and KYC checks (Decision 9) pass, if `approvalMode == AUTO_UNDER_LIMIT` and the requested `amount <= autoApproveLimit`, the request is created directly in `APPROVED` status (no separate decision call needed); otherwise it's created `REQUESTED` and sits in the queue. This isn't new behavior invented from nothing — `WithdrawalConfigService`'s own comment ("ALWAYS_MANUAL ignores the limit entirely") already implies the limit's purpose is exactly this, it was just never wired to anything downstream until now.

8. **No dedicated "hold" status or endpoint**, reconciling the role-capability matrix's "approve/reject/hold" language against this spec's narrower, explicitly-scoped `decision` endpoint (approve/reject only, mirroring `KycReviewService.decide()`'s binary shape). A request Admin isn't ready to decide on simply stays in `REQUESTED` — that state *is* the hold; there is nothing a distinct `ON_HOLD` status would represent that `REQUESTED`-and-not-yet-decided doesn't already mean, and no source document (PRD §6's own state list, or the SCOPE section's endpoint list, which explicitly says "approve/reject with reason") calls for a third value with different semantics.

9. **KYC-verification is checked at both request-submission and approval-decision time, not at disbursement.** At submission: `associate.kycStatus != VERIFIED` → 409, immediately, since the beneficiary's eligibility is the first thing that should gate a withdrawal existing at all. At approval: re-checked, because `KycReviewService.decide()` places no restriction on transitioning a previously-`VERIFIED` associate to `REJECTED` (confirmed by reading `KycReviewService.decide()` — it only validates the *new* decision value, not the associate's current status) — so a real window exists where KYC regresses between a request being created and an admin getting around to approving it, potentially days later for a queued (non-auto-approved) request. Approval is the last point before funds are earmarked as "ready to disburse," so it's the natural re-check point. Disbursement is deliberately *not* re-checked: by then the wallet debit already happened (Decision 10) and the decision is already made; disbursement is a bookkeeping action (recording that a bank transfer occurred) with no further money movement inside this system to gate, and re-litigating KYC a third time this close to a same-session admin action wasn't judged to add real protection over the approval-time check.

10. **Funds are held — `Wallet.balance` debited — at withdrawal *request creation* time, not at approval or disbursement.** `POST /api/admin/withdrawals` calls `debitIfSufficient` (Decision 5) as part of creating the row; a `REJECTED` decision refunds via `creditBalance`; `APPROVED` and `DISBURSED` transitions cause no further balance change (the money was already set aside). This resolves an ordering question the PRD's flow doesn't address: if debiting happened only at disbursement (the PRD's literal "(4) on approval... wallet balance decremented" — itself conflating approval and disbursement, which this spec treats as separate steps per the SCOPE section), two concurrent withdrawal requests against the same balance could both pass a naive "amount <= balance" check before either debits, over-drawing the wallet once both are eventually disbursed. Debiting atomically at creation (Decision 5's `debitIfSufficient`) closes that race the same way Decision 5 closes the crediting race, and makes "available balance" (what `GET /api/associates/me/wallet` shows) always mean "funds not already earmarked by some other request," matching the PRD's own §7.1 framing of balance as "not yet withdrawn."

11. **No `requested_by`/`decided_by`/`disbursed_by` columns on `WithdrawalRequest`.** Actor attribution follows the existing convention: `SettingsAuditService.record(section, summary, detail, actorId)` is the system of record for "who did this and when," the same way `Sale` carries no `recordedBy` and `Associate` carries no `kycDecidedBy` — both rely entirely on the audit log. `WithdrawalRequest` does the same (`section = "withdrawal"` for request/decision/disburse actions, `section = "wallet"` for the crediting step), keeping the entity itself lean and consistent with every other domain's write path in this codebase.

12. **One controller, one service for the withdrawal-request lifecycle** (`WithdrawalController`/`WithdrawalService` in a new `withdrawal` sub-area of the `wallet` package, or a sibling top-level package — either is fine; not a load-bearing choice), covering all four withdrawal-request endpoints, following the Sales/Income-Ledger precedent of one controller per domain rather than splitting admin and associate concerns into separate classes. `GET /api/associates/me/wallet` and the wallet-crediting endpoint are separate, smaller pieces (`WalletController`/`WalletCreditingService`) since they're a genuinely different concern (balance, not withdrawal lifecycle) reusing the existing `Wallet`/`WalletRepository` types directly.

13. **`GET /api/associates/me/wallet` is a small dedicated endpoint, not folded into the dashboard.** `DashboardService.getDashboard()` already returns a `WalletSummary(balance)` today and keeps doing so, untouched — but the dashboard is a large aggregate query (rank progress, team snapshot, announcements, cycle income, leg volume) that a wallet/withdrawal-history screen shouldn't have to pull in full just to show a balance next to the withdrawal list. Both endpoints read `WalletRepository` independently (the same `findById(...).orElseGet(() -> Wallet.zero(associateId))` pattern `DashboardService` already uses) — this is plain reuse of a trivial single-row lookup from two call sites, not duplication of logic worth centralizing further.

14. **Response DTOs resolve associate identity via batch-load**, following Income/Ledger's Decision 11 precedent exactly: `AdminWithdrawalResponse` includes `associateUserId`/`associateName` (batch-loaded with `associateRepository.findAllById(...)` over the distinct associate ids in a queue page); `AssociateWithdrawalResponse` (the self-view) omits them, since every row is always the caller — same "two purpose-built response types, not one with nulled fields" pattern as Income/Ledger's Decision 12.

15. **Admin can submit a withdrawal request for itself (the root Admin row), with no special-casing.** Per the role-capability spec, Admin participates in compensation and can accumulate a wallet balance from its own leg's Matching/Sponsor/Reward income (Cycle Management already established Admin gets no Royalty/rank but *does* earn everything else). Nothing in this spec's flow distinguishes "associateId belongs to an ADMIN-role row" from any other associate id — the same "no special-cased exclusion unless the schema forces it" posture Cycle Management took, and nothing here is schema-forced the way rank-nullability was.

16. **(Post-review) KYC-verification-triggered reconciliation sweep, operating below the cycle level.** When `KycReviewService.decide()` (existing, `associate` package) transitions an associate to `VERIFIED`, it now also calls a new `WalletCreditingService.reconcileCarriedForward(associateId)`: find every `LedgerEntry` for that associate with `status = CARRIED_FORWARD` (across *any* cycle, no `cycleId` filter — deliberately unscoped, same reasoning as Reward's cross-cycle idempotency check in Cycle Management's Decision 8), and for each: `walletRepository.creditBalance(associateId, entry.netAmount)`, `entry.status = PAID`. This is a cross-package call from `associate` into `wallet` — the first one in this direction in the codebase, but no different in kind from `AuthService` calling into `setupStateService`, or the many services that already call `settingsAuditService`. Deliberately does **not** touch `Cycle.status` — a cycle already `PAID` for everyone else stays `PAID`; this sweep corrects one associate's individually-withheld entries without reopening or re-examining the cycle as a whole, which is exactly what Cycle Management's Resolved Decision #2 ("never reopen a closed cycle") requires. Uses the same atomic `creditBalance` + per-entry status-flip mechanism as the main crediting step (Decision 5) — safe to invoke even if somehow triggered twice (a second sweep finds zero `CARRIED_FORWARD` rows left to touch). Audit-logged under `section = "wallet"`, same as the main crediting step. **Cross-package implementation note**: shipping this decision means `KycReviewService.decide()` (already-built, not part of this spec's own package) needs a small modification — inject `WalletCreditingService` and call the sweep after a `VERIFIED` decision — flagged clearly since whoever implements this spec touches a file outside `wallet`/`withdrawal`.

17. **(Post-review) A withdrawal request `APPROVED` (including auto-approved) can be reversed before disbursement, via the same decision endpoint, not a new one.** `POST /api/admin/withdrawals/{id}/decision`'s precondition broadens from "`status` must be `REQUESTED`" to: `REQUESTED` → `APPROVED` or `REJECTED` (existing behavior, unchanged); `APPROVED` → `REJECTED` only (re-approving an already-`APPROVED` request is meaningless and stays rejected as an invalid transition); `REJECTED`/`DISBURSED` → any decision is invalid, `InvalidWithdrawalStateException`, unchanged. A `REJECTED` decision from `APPROVED` runs the exact same refund logic as a `REJECTED` decision from `REQUESTED` (Decision 10's `creditBalance` reversal) — no new status value, no new endpoint. This is a minimal, targeted broadening of an existing state check rather than a parallel "cancel" mechanism, because the two cases (reject a pending request / reverse an approved-but-undisbursed one) are the same operation — "this request should not proceed, give the money back" — at two different points in its lifecycle. The audit log message distinguishes them (`"Withdrawal rejected"` vs. `"Withdrawal cancelled after approval"`) even though the stored `status` value is identically `REJECTED` in both cases, so a reader of the audit trail can still tell which happened.

18. **(Post-review) `minimum_withdrawal_amount` becomes a Go-Live-gating field, matching `payment_config`/`payout_bank_account`'s treatment, not `kyc_config`/`withdrawal_config`'s "always has defaults, never blocks" treatment it would otherwise inherit.** The column is nullable (`NUMERIC(14,2) NULL`, no default), not `NOT NULL DEFAULT 0` as originally drafted. `WithdrawalConfigService` gains an `isComplete()` method (`minimumWithdrawalAmount != null`), following `PayoutBankAccountService.isComplete()`'s exact pattern (a doc comment there already says "matching `CompanyProfileService.isComplete()`'s isNotBlank pattern" — this is the same family of check, just a null-check instead of a blank-string check since the field is numeric). `SetupStateService`'s `paymentsKyc` step (`case "paymentsKyc" -> paymentConfigService.isComplete() && payoutBankAccountService.isComplete()`) gains a third clause: `&& withdrawalConfigService.isComplete()`. This is a real, explicit change to a step-completion rule owned by the `company` package, not just `payments`/`wallet` — flagged clearly, same spirit as Decision 6's flag for extending `withdrawal_config` itself. `approvalMode`/`autoApproveLimit` are unaffected by this — they keep their existing always-defaulted, non-blocking behavior; only the new minimum-threshold field is promoted to Go-Live-required.

## Data model

**New migration** (lands after Cycle Management's idempotency-constraint migration, no fixed version number assumed — implementation assigns the next available `V*` per this repo's Flyway convention):

```sql
-- withdrawal_request: the runtime request/approval/disbursement lifecycle. Admin submits on an
-- associate's behalf (role-capability spec: associates have no self-serve write action here).
CREATE TABLE withdrawal_request (
    id UUID PRIMARY KEY,
    associate_id UUID NOT NULL REFERENCES associate(id),
    amount NUMERIC(14,2) NOT NULL,
    status VARCHAR(16) NOT NULL,
    reason VARCHAR(500),
    bank_reference VARCHAR(120),
    requested_at TIMESTAMP NOT NULL,
    decided_at TIMESTAMP,
    disbursed_at TIMESTAMP,
    CONSTRAINT chk_withdrawal_request_status
        CHECK (status IN ('REQUESTED','APPROVED','REJECTED','DISBURSED')),
    CONSTRAINT chk_withdrawal_request_amount_positive CHECK (amount > 0)
);
CREATE INDEX idx_withdrawal_request_associate ON withdrawal_request(associate_id);
CREATE INDEX idx_withdrawal_request_status ON withdrawal_request(status);

-- withdrawal_config gains the minimum-threshold field the PRD assumed already existed (see
-- Context finding 1) -- it doesn't, so this spec adds it to the table that already owns
-- withdrawal policy rather than starting a second one. Nullable, no default (Decision 18,
-- post-review) -- this field blocks Go Live until an admin explicitly sets it, same treatment
-- as payment_config/payout_bank_account, not the always-defaulted pattern the rest of
-- withdrawal_config uses.
ALTER TABLE withdrawal_config
    ADD COLUMN minimum_withdrawal_amount NUMERIC(14,2);
```

No changes to `wallet` (still `associate_id` PK + `balance`) or `ledger_entry` beyond what Sales/Cycle Management already specified — this spec only *reads and updates* `LedgerEntry.status`, it doesn't add columns to it. No new status value on `withdrawal_request` for the cancel path (Decision 17) — it's `REJECTED`, reached from a broader set of prior states.

**Entity changes:**
- `WithdrawalConfig` (existing, `payments` package): add `minimumWithdrawalAmount` field (`BigDecimal`, nullable) + getter/setter; `WithdrawalConfigRequest`/`Response` gain the corresponding nullable field; `WithdrawalConfigService.updateConfig()` sets it from the request (nullable, so no default-substitution); `WithdrawalConfigService.isComplete()` (new, Decision 18) returns `minimumWithdrawalAmount != null`.
- `Wallet` (existing, `wallet` package): **no field or method changes** — balance mutation happens entirely via the new atomic repository queries (Decision 5), not entity methods.
- `KycReviewService` (existing, `associate` package): gains a `WalletCreditingService` constructor dependency and one new call inside `decide()`'s `VERIFIED` branch (Decision 16). This is the one cross-package modification this spec requires outside `wallet`/`withdrawal`/`payments`.
- `SetupStateService` (existing, `company` package): `paymentsKyc` step's completion check gains `&& withdrawalConfigService.isComplete()` (Decision 18).

**New Java types:**
- `WithdrawalRequest` (entity), `WithdrawalRequestStatus` (`REQUESTED`, `APPROVED`, `REJECTED`, `DISBURSED`), `WithdrawalRequestRepository`, `WithdrawalService`, `WithdrawalController`.
- `WalletCreditingService` (new, `wallet` package — the crediting batch step *and*, per Decision 16, the KYC-triggered reconciliation sweep), `WalletController` (new, `wallet` package — `GET /api/associates/me/wallet`), `WalletBalanceResponse` record.
- Request/response records: `CreateWithdrawalRequest(associateId, amount)`, `WithdrawalDecisionRequest(decision, reason)`, `DisburseWithdrawalRequest(bankReference)`, `AdminWithdrawalResponse`, `AssociateWithdrawalResponse`, `AdminWithdrawalPageResponse`, `AssociateWithdrawalPageResponse`, `WalletCreditingResult` (record: `cycleId`, `entriesCredited`, `totalAmountCredited`, `newCycleStatus`), `ReconciliationResult` (record: `associateId`, `entriesCredited`, `totalAmountCredited` — Decision 16's sweep return value, used internally/for the audit log detail, not exposed via any endpoint of its own since the sweep is triggered by a KYC decision, not a direct API call).
- Exceptions: `BelowMinimumWithdrawalException` (409), `InsufficientWalletBalanceException` (409), `KycNotVerifiedException` (409), `AssociateSuspendedException` (409), `WithdrawalRequestNotFoundException` (404), `InvalidWithdrawalStateException` (409, reused for "decision on a non-`REQUESTED`/non-`APPROVED`" and "disburse on a non-`APPROVED`" — same single-exception-with-descriptive-message style as `InvalidKycDecisionException`/`InvalidWithdrawalConfigException` elsewhere in this codebase), `CyclePayoutStateException` (409, crediting a cycle that's not `CLOSED` or is already `PAID`).

**New repository methods:**
- `LedgerEntryRepository.findByCycleIdAndStatus(UUID cycleId, LedgerEntryStatus status): List<LedgerEntry>` — the crediting step's one read query (mirrors Cycle Management's precedent of adding a `findByCycleIdAndStatus`-shaped method to a sibling package's repository).
- `LedgerEntryRepository.findByAssociateIdAndStatus(UUID associateId, LedgerEntryStatus status): List<LedgerEntry>` — Decision 16's sweep query, deliberately unscoped by `cycleId`.
- `WalletRepository.creditBalance(UUID associateId, BigDecimal amount): int` (`@Modifying @Query`) and `WalletRepository.debitIfSufficient(UUID associateId, BigDecimal amount): int` (`@Modifying @Query`) — Decision 5's atomic mutations.
- `WithdrawalRequestRepository.search(UUID associateId, WithdrawalRequestStatus status, Pageable pageable): Page<WithdrawalRequest>` — same null-safe `(:param IS NULL OR ...)` shape as `LedgerEntryRepository.search`/`AssociateRepository.searchDirectory`; admin passes a possibly-null `associateId`, the associate self-view always passes its own (never null, never client-supplied — same guarantee as Income/Ledger's Decision 4).

## Flows

### Wallet crediting — `POST /api/admin/cycles/{id}/credit-wallets`, ADMIN-only

1. Look up `Cycle` by id → 404 if missing (reuses the `CycleNotFoundException` Cycle Management's spec defines — not yet in the codebase either, since Cycle Management hasn't been implemented yet).
2. `SELECT ... FOR UPDATE` the `Cycle` row (Decision 2). Re-check status: `PAID` → `CyclePayoutStateException` ("already credited"), 409. `OPEN`/`CALCULATING` → `CyclePayoutStateException` ("settlement not closed yet"), 409. `CLOSED` → proceed.
3. `entries = ledgerEntryRepository.findByCycleIdAndStatus(cycleId, PENDING)`.
4. For each entry, grouped implicitly by iterating the list (no explicit grouping needed — each entry is its own credit):
   a. If no `Wallet` row exists yet for `entry.associateId` (`walletRepository.existsById(...)` false), insert one via `walletRepository.save(Wallet.zero(entry.associateId))`.
   b. `walletRepository.creditBalance(entry.associateId, entry.netAmount)`.
   c. `entry.status = PAID`; save.
5. `cycle.status = PAID`; save (Decision 3 — unconditional once step 4 finishes, regardless of any `CARRIED_FORWARD` rows left untouched in this cycle).
6. Return `WalletCreditingResult(cycleId, entries.size(), sum of netAmount credited, PAID)`.

If any step throws, the whole transaction rolls back (every wallet credit, every entry's status flip, and the cycle's `PAID` transition) — the cycle is left exactly `CLOSED`, identical to how it started, and a retry finds the same `PENDING` set to (re-)process. A JVM crash mid-run has the same effect (dropped connection, uncommitted transaction, released lock) — same reasoning as Cycle Management's Decision 1/3.

### `GET /api/associates/me/wallet` — any authenticated associate

1. `associateId` from `@AuthenticationPrincipal`.
2. `wallet = walletRepository.findById(associateId).orElseGet(() -> Wallet.zero(associateId))` — same lazy-default pattern `DashboardService` already uses; a wallet that's never been credited returns zero, not 404.
3. Return `WalletBalanceResponse(balance)`.

### Submit a withdrawal request — `POST /api/admin/withdrawals`, ADMIN-only

1. Look up `Associate` by `request.associateId()` → 404 if missing.
2. `associate.status == SUSPENDED` → `AssociateSuspendedException`, 409.
3. `associate.kycStatus != VERIFIED` → `KycNotVerifiedException`, 409 (Decision 9).
4. `request.amount() <= 0` → standard Bean Validation 400 (`@Positive` on the DTO).
5. `request.amount() < withdrawalConfig.minimumWithdrawalAmount` → `BelowMinimumWithdrawalException`, 409 (Decision 6).
6. `walletRepository.debitIfSufficient(associateId, amount)` returns `0` → `InsufficientWalletBalanceException`, 409 (Decision 5/10 — covers both "balance too low" and "no wallet row at all" identically).
7. Determine initial status (Decision 7): `config.approvalMode == AUTO_UNDER_LIMIT && amount <= config.autoApproveLimit` → `APPROVED`, else `REQUESTED`.
8. Save `WithdrawalRequest` (`requestedAt = now()`, `decidedAt` set now too if auto-approved, else null).
9. `settingsAuditService.record("withdrawal", "Submitted withdrawal for " + associate.getUserId(), Map.of("amount", amount, "status", status), actorId)`.
10. Return `AdminWithdrawalResponse` (201).

### Approval queue — `GET /api/admin/withdrawals`, ADMIN-only

Paginated, filters `associateId` (optional), `status` (optional), `page`/`size` (clamped 0–100, default 0/20) — same shape as `GET /api/admin/ledger`. Batch-resolves associate identity (Decision 14).

### Decide — `POST /api/admin/withdrawals/{id}/decision`, ADMIN-only

1. Look up `WithdrawalRequest` → 404 if missing.
2. Precondition (Decision 17, post-review — broadened from "must be `REQUESTED`"): current `status == REQUESTED` → `decision` may be `APPROVED` or `REJECTED`. Current `status == APPROVED` → `decision` must be `REJECTED` (a cancel; `decision == APPROVED` here is itself invalid, since re-approving an already-approved request means nothing). Any other current status (`REJECTED`, `DISBURSED`) → `InvalidWithdrawalStateException`, 409, regardless of `decision`.
3. `request.decision() != APPROVED && != REJECTED` → validation error, 400 (mirrors `KycReviewService`'s `InvalidKycDecisionException` shape, though here it's redundant with the DTO's enum type — kept for symmetry with KYC's pattern).
4. `decision == REJECTED && (reason blank)` → `InvalidWithdrawalStateException`-style validation, 400 (mirrors KYC's "reason required when rejecting" — applies whether the prior status was `REQUESTED` or `APPROVED`, so a cancel always requires a reason too).
5. If `APPROVED` (only reachable from `REQUESTED`, per step 2): re-check `associate.kycStatus == VERIFIED` (Decision 9) → `KycNotVerifiedException`, 409, if it regressed since submission. Set `status = APPROVED`, `decidedAt = now()`.
6. If `REJECTED` (reachable from `REQUESTED` or `APPROVED`): `walletRepository.creditBalance(associateId, amount)` (refund, Decision 10 — same call whether this is a first-time reject or a post-approval cancel). Set `status = REJECTED`, `reason = request.reason()`, `decidedAt = now()`.
7. Save. `settingsAuditService.record("withdrawal", (priorStatus == APPROVED ? "Withdrawal cancelled after approval for " : "Withdrawal rejected for ") + associate.getUserId(), Map.of("decision", ..., "reason", ..., "priorStatus", priorStatus), actorId)` — Decision 17's audit-message distinction between a plain reject and a post-approval cancel, even though the stored `status` is identically `REJECTED` either way.
8. Return `AdminWithdrawalResponse`.

### Disburse — `POST /api/admin/withdrawals/{id}/disburse`, ADMIN-only

1. Look up `WithdrawalRequest` → 404 if missing.
2. `status != APPROVED` → `InvalidWithdrawalStateException`, 409.
3. `request.bankReference()` blank → 400 (`@NotBlank`).
4. Set `status = DISBURSED`, `bankReference = request.bankReference()`, `disbursedAt = now()`. No wallet mutation (Decision 10 — already debited at submission).
5. Save. Audit log (`section = "withdrawal"`).
6. Return `AdminWithdrawalResponse`.

### Own withdrawal history — `GET /api/associates/me/withdrawals`, any authenticated associate

`associateId` from principal, never a request parameter. Filters: `status` (optional), `page`/`size`. Returns `AssociateWithdrawalPageResponse` (no associate-identity fields — Decision 14).

### KYC-verification-triggered reconciliation sweep — internal, invoked from `KycReviewService.decide()`, not its own endpoint (Decision 16, post-review)

1. Runs only when `decide()`'s `request.decision() == KycStatus.VERIFIED` — no sweep on a `REJECTED` decision.
2. `entries = ledgerEntryRepository.findByAssociateIdAndStatus(associateId, CARRIED_FORWARD)` — every cycle, not just the associate's most recent one.
3. For each: `walletRepository.creditBalance(associateId, entry.netAmount)` (creating a `Wallet` row first if none exists, same as the main crediting step); `entry.status = PAID`; save.
4. `settingsAuditService.record("wallet", "Reconciled " + entries.size() + " carried-forward entries for " + associate.getUserId() + " after KYC verification", Map.of("entriesCredited", entries.size(), "totalAmount", sum), actorId)` — `actorId` is whoever made the KYC decision (the same admin, passed through from `decide()`'s existing parameter).
5. No response of its own — folds into `KycReviewService.decide()`'s existing `KycQueueEntryResponse` return value, unchanged in shape. If the sweep finds zero `CARRIED_FORWARD` entries (the common case — most associates verify KYC before ever having withheld income), steps 3-4 are simply no-ops; the KYC decision itself still succeeds and returns normally.

## Error handling

| Exception | HTTP | Trigger |
|---|---|---|
| `AssociateNotFoundException` (existing) | 404 | `associateId` on request creation doesn't resolve |
| `AssociateSuspendedException` (new) | 409 | submitting a request for a `SUSPENDED` associate |
| `KycNotVerifiedException` (new) | 409 | associate's `kycStatus != VERIFIED` at submission or at approval-decision time |
| `BelowMinimumWithdrawalException` (new) | 409 | `amount < withdrawalConfig.minimumWithdrawalAmount` |
| `InsufficientWalletBalanceException` (new) | 409 | `debitIfSufficient` affects 0 rows — balance too low, or no wallet row exists |
| `WithdrawalRequestNotFoundException` (new) | 404 | `{id}` doesn't resolve on decision/disburse |
| `InvalidWithdrawalStateException` (new) | 409 | deciding a `REJECTED`/`DISBURSED` request, or approving an already-`APPROVED` one; disbursing a non-`APPROVED` request; rejecting/cancelling without a reason |
| `CycleNotFoundException` (defined by Cycle Management's spec, not yet in the codebase) | 404 | `{id}` on `credit-wallets` doesn't resolve |
| `CyclePayoutStateException` (new) | 409 | crediting a cycle that's still `OPEN`/`CALCULATING`, or already `PAID` |

## Testing

- `WalletCreditingServiceTest`: happy path credits every `PENDING` entry in a closed cycle across multiple associates, sums correctly, flips entries to `PAID`, cycle to `PAID`; entries in other cycles or with `CARRIED_FORWARD`/`REVERSED` status are untouched; a cycle with a mix of `PENDING` and `CARRIED_FORWARD` still reaches `PAID` once the `PENDING` ones are credited; crediting an already-`PAID` cycle throws; crediting an `OPEN`/`CALCULATING` cycle throws; a first-time associate with no prior `Wallet` row gets one created with the correct balance, not an error.
- **Idempotency test** (mirrors Cycle Management's): force a mid-batch failure after crediting some but not all entries; assert full rollback — zero wallet balance changes, zero entry status changes, cycle still `CLOSED`; retry without the fault and assert it succeeds with the complete, correct result (not double-credited, since the failed attempt left nothing committed to collide with).
- **Concurrency test**: two simultaneous `credit-wallets` calls against the same cycle — second blocks on the row lock, then 409s once the first commits; credited amounts appear exactly once.
- `WalletControllerTest`: `GET /api/associates/me/wallet` returns zero for a never-credited associate, correct balance after crediting; 403 for... n/a (any associate token is valid here, no admin-only case to negative-test beyond the standard auth filter).
- `WithdrawalServiceTest`: happy-path submission debits wallet and creates `REQUESTED`; submission below minimum throws; submission with insufficient balance throws; submission for unverified-KYC associate throws; submission for a suspended associate throws; auto-approval path (`AUTO_UNDER_LIMIT`, amount under limit) creates `APPROVED` directly with no separate decision call; approve transitions `REQUESTED → APPROVED` with no balance change; approve on an associate whose KYC regressed after submission throws; reject-from-`REQUESTED` transitions `REQUESTED → REJECTED`, refunds the wallet, requires a reason; **cancel-from-`APPROVED`** (Decision 17) transitions `APPROVED → REJECTED`, refunds the wallet identically, requires a reason, and produces the "cancelled after approval" audit message rather than "rejected"; approving an already-`APPROVED` request throws `InvalidWithdrawalStateException`; disburse transitions `APPROVED → DISBURSED`, records the bank reference, no balance change; deciding/disbursing in every other wrong state throws.
- `WithdrawalControllerTest` (MockMvc + real JWT, mirroring `KycReviewControllerTest`'s shape): 201 on submit, 200 + queue on list with filters, 200 on decision (approve, reject-from-requested, and cancel-from-approved), 200 on disburse, 409s for each guard above, 404s for unknown ids; associate token gets 403 on all four admin endpoints; associate token reaches `GET /api/associates/me/wallet` and `GET /api/associates/me/withdrawals` and never sees another associate's rows regardless of filters passed.
- `SecurityConfigTest` additions: all `/api/admin/withdrawals*` routes and `/api/admin/cycles/*/credit-wallets` are ADMIN-only; `/api/associates/me/wallet` and `/api/associates/me/withdrawals` reachable by any authenticated associate token.
- `WithdrawalConfigServiceTest` additions: `minimumWithdrawalAmount` round-trips through `updateConfig`/`getConfig` correctly; `isComplete()` is `false` while it's `null` (the fresh V9-seeded row's state) and `true` once set, including to `0` (an explicit "no minimum" is still a completed configuration, distinct from never having been set).
- `SetupStateServiceTest` addition: `paymentsKyc` step stays incomplete when `paymentConfigService`/`payoutBankAccountService` are complete but `withdrawalConfigService.isComplete()` is `false`; complete once all three are.
- **`KycReviewServiceTest` addition** (existing test class, `associate` package — this spec modifies code it doesn't own): a `VERIFIED` decision for an associate with existing `CARRIED_FORWARD` entries triggers `WalletCreditingService.reconcileCarriedForward`, crediting the wallet and flipping those entries to `PAID`; a `VERIFIED` decision for an associate with no `CARRIED_FORWARD` entries is a no-op sweep (decision still succeeds normally); a `REJECTED` decision never triggers the sweep.
- `WalletCreditingServiceTest` addition: `reconcileCarriedForward` credits entries spanning multiple cycles (including an already-`PAID` cycle) for one associate in a single call, leaves `Cycle.status` untouched regardless of which cycles those entries belonged to, and running it twice in a row is a no-op the second time (nothing left in `CARRIED_FORWARD` to find).

## Resolved decisions (post-review)

1. **`CARRIED_FORWARD` reconciliation is resolved: a KYC-verification-triggered sweep, not left open.** See Decision 16 and the new Flows subsection above. An associate's withheld income gets credited the moment their KYC verifies, regardless of which (possibly already-`PAID`) cycle it originated in.
2. **A cancel/un-approve path is added, reusing the existing decision endpoint rather than a new one.** See Decision 17. `APPROVED → REJECTED` (with a required reason) is now a valid transition, refunding the wallet identically to a first-time reject.
3. **`minimum_withdrawal_amount` is now a required Go-Live field.** See Decision 18. The column is nullable with no default, `WithdrawalConfigService.isComplete()` is added, and `SetupStateService`'s `paymentsKyc` step gates on it alongside `payment_config`/`payout_bank_account` — a company cannot go live without an admin explicitly setting a minimum withdrawal amount (including explicitly setting it to `0`, if "no minimum" is the intended policy).

No open questions remain unresolved for this spec.
