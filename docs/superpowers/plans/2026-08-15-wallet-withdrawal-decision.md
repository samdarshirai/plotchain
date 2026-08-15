# Wallet/Withdrawal Unit 7 — Decide (Approve/Reject/Cancel) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/admin/withdrawals/{id}/decision` (ADMIN-only) to the already-merged `WithdrawalController`/`WithdrawalService`, letting an admin approve a `REQUESTED` withdrawal, reject a `REQUESTED` withdrawal, or cancel (reject) an already-`APPROVED` withdrawal — all through the same endpoint, per Decision 17's broadened precondition.

**Architecture:** Third method (`decide`) added to the existing single-controller/single-service withdrawal-lifecycle class pair (Decision 12) — no new controller, no new service. Two new lightweight `RuntimeException` types plus two new `@ExceptionHandler` entries in the existing `WithdrawalExceptionHandler`. No schema change: `withdrawal_request`'s `chk_withdrawal_request_status` constraint and `WithdrawalRequestStatus` enum already carry all four states (built ahead of time by unit 5, per that migration's own comment). Reuses `KycNotVerifiedException` (unit 5) and `WalletRepository.creditBalance` (unit 1) unmodified — no new repository methods.

**Tech Stack:** Spring Boot (Java), Spring Data JPA, MockMvc + real JWT auth for controller/security tests, JUnit 5 + Mockito + AssertJ for service tests, H2 for `@SpringBootTest` integration tests.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` (Decisions 8, 9, 10, 11, 17; Flow "Decide"; Error handling table; Data model "New Java types"/"Exceptions"). Unit-level acceptance criteria: `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md`, section "### 7."

## Global Constraints

- ADMIN-only: non-ADMIN token → 403 (enforced by the existing blanket `POST /api/**` → `hasAuthority("ADMIN")` rule in `SecurityConfig`; an explicit narrower matcher is added anyway, matching the readability convention units 5/6 established — not load-bearing on its own).
- No new database migration — `withdrawal_request`'s status CHECK constraint and `WithdrawalRequestStatus` enum already include all four values (added in unit 5's `V22__withdrawal_request.sql`).
- No new `WalletRepository`/`WithdrawalRequestRepository` methods — `decide()` uses `findById`/`save` (already inherited from `JpaRepository`) and the existing `creditBalance` (unit 1).
- Actor attribution stays audit-log-only (Decision 11) — no `decidedBy` column is added to `WithdrawalRequest`.
- Follow this codebase's one-exception-class-per-HTTP-status convention (seen in `InvalidKycDecisionException`, `InvalidWithdrawalConfigException`, `BelowMinimumWithdrawalException`, etc.) — do not have one exception class serve two different status codes depending on message content.

## Note on a spec inconsistency (read before implementing)

The source spec has two documents (a table and a step-by-step flow) that disagree on the status code for "rejecting/cancelling without a reason":

- **Error handling table** lists it under `InvalidWithdrawalStateException` (409).
- **Flow "Decide" step 4** and the **unit-7 acceptance criteria** (this plan's actual instruction source) both say: *"`decision == REJECTED` with a blank reason → 400"* — twice, with reasoning ("mirrors KYC's reason required when rejecting", where `InvalidKycDecisionException` is always 400).
- The Data model's "Exceptions" catalog entry for `InvalidWithdrawalStateException` only lists it as covering "decision on a non-`REQUESTED`/non-`APPROVED`" and "disburse on a non-`APPROVED`" — it does **not** mention the blank-reason case at all.

This plan resolves the conflict in favor of the Flow narrative + unit acceptance criteria (400, twice-stated, reasoned) over the summary table's shorthand (409, unreasoned, contradicted by the table's own more-detailed sibling document). Concretely:

- **`InvalidWithdrawalStateException` (409)** — reserved strictly for the state-precondition violations the Exceptions catalog names: deciding an already-`REJECTED`/`DISBURSED` request, or trying to re-approve an already-`APPROVED` one.
- **New `InvalidWithdrawalDecisionException` (400)** — a small new type (not named in the spec's catalog, but structurally identical to `InvalidKycDecisionException`, which the spec explicitly says this mirrors) for the two body-validation failures: `decision` not `APPROVED`/`REJECTED`, and a blank `reason` on a `REJECTED` decision.

If the plan approver disagrees with this reading and wants blank-reason to be 409 via `InvalidWithdrawalStateException` instead, that's a one-line change in Task 1 (drop the new exception type, throw `InvalidWithdrawalStateException` for both cases, and change the exception handler's status for that one existing class... except that would also flip the decision-value-validity case to 409, which no source document supports at all). Flagging here so it's a conscious call, not a silent one.

---

### Task 1: `WithdrawalService.decide()` — core decision logic

**Files:**
- Create: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalDecisionRequest.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestNotFoundException.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/InvalidWithdrawalStateException.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/InvalidWithdrawalDecisionException.java`
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`

**Interfaces:**
- Consumes (already-injected constructor dependencies, no signature change needed): `AssociateRepository associateRepository`, `WalletRepository walletRepository` (specifically `creditBalance(UUID, BigDecimal): int`, unit 1), `WithdrawalRequestRepository withdrawalRequestRepository` (`findById(UUID): Optional<WithdrawalRequest>`, `save(WithdrawalRequest)`, both inherited), `SettingsAuditService.record(String section, String summary, Map<String,Object> detail, UUID actorId)`, existing `KycNotVerifiedException(UUID)` (unit 5), existing `AssociateNotFoundException(UUID)`, existing private `toResponse(WithdrawalRequest, Associate): AdminWithdrawalResponse` helper.
- Produces: `WithdrawalService.decide(UUID id, WithdrawalDecisionRequest request, UUID actorId): AdminWithdrawalResponse` — Task 2's controller calls this exact signature. `WithdrawalDecisionRequest(WithdrawalRequestStatus decision, String reason)`. `WithdrawalRequestNotFoundException(UUID id)` (404, wired in Task 2). `InvalidWithdrawalStateException(String message)` (409, wired in Task 2). `InvalidWithdrawalDecisionException(String message)` (400, wired in Task 2).

- [ ] **Step 1: Write the new DTO and exception types**

`backend/src/main/java/com/plotchain/withdrawal/WithdrawalDecisionRequest.java`:
```java
package com.plotchain.withdrawal;

import jakarta.validation.constraints.NotNull;

// Wallet/withdrawal unit 7 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Flow "Decide"): decision is typed as the same WithdrawalRequestStatus enum the entity uses
// (mirrors KycDecisionRequest's use of KycStatus) rather than a narrower two-value enum --
// WithdrawalService.decide() explicitly rejects any value other than APPROVED/REJECTED at
// runtime (InvalidWithdrawalDecisionException, 400), since the shared enum also carries
// REQUESTED/DISBURSED, which are never valid decision values. reason is validated
// conditionally (required only when decision == REJECTED), so it isn't @NotBlank here --
// same reasoning as KycDecisionRequest.reason.
public record WithdrawalDecisionRequest(@NotNull WithdrawalRequestStatus decision, String reason) {}
```

`backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestNotFoundException.java`:
```java
package com.plotchain.withdrawal;

import java.util.UUID;

// Wallet/withdrawal unit 7 (Data model "New Java types"/Exceptions, Flow "Decide" step 1):
// unknown {id} on the decision endpoint (and, per the spec's Error handling table, the future
// disburse endpoint too -- unit 8 reuses this type unmodified).
public class WithdrawalRequestNotFoundException extends RuntimeException {
    public WithdrawalRequestNotFoundException(UUID id) {
        super("Withdrawal request not found: " + id);
    }
}
```

`backend/src/main/java/com/plotchain/withdrawal/InvalidWithdrawalStateException.java`:
```java
package com.plotchain.withdrawal;

// Wallet/withdrawal unit 7 (Decision 17, Flow "Decide" step 2): thrown when the CURRENT status
// forbids ANY decision at all (REJECTED/DISBURSED), or forbids the SPECIFIC decision requested
// (APPROVED -> re-approving is invalid; only REJECTED is a legal transition from APPROVED).
// Deliberately narrow in scope -- see this plan's "Note on a spec inconsistency" for why the
// blank-reason/invalid-decision-value cases are NOT routed through this type despite one summary
// table in the source spec bundling them here. Unit 8 (disburse) reuses this same type for
// "status != APPROVED" per the spec's Exceptions catalog.
public class InvalidWithdrawalStateException extends RuntimeException {
    public InvalidWithdrawalStateException(String message) {
        super(message);
    }
}
```

`backend/src/main/java/com/plotchain/withdrawal/InvalidWithdrawalDecisionException.java`:
```java
package com.plotchain.withdrawal;

// Wallet/withdrawal unit 7 (Flow "Decide" steps 3-4): the request BODY itself is invalid --
// decision isn't APPROVED/REJECTED, or reason is blank on a REJECTED decision -- independent of
// the withdrawal request's current status. Mirrors com.plotchain.associate.InvalidKycDecisionException
// exactly (same single-exception-class-mapped-to-one-status shape, same two trigger cases: bad
// decision value, missing reason on reject), per the spec's own "mirrors KYC's reason required
// when rejecting" note on the blank-reason case.
public class InvalidWithdrawalDecisionException extends RuntimeException {
    public InvalidWithdrawalDecisionException(String message) {
        super(message);
    }
}
```

- [ ] **Step 2: Write the failing tests**

Append these test methods to `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`, just before the final closing `}` of the class (after `adminListReturnsAnEmptyPageWhenSearchFindsNothing`):

```java
    private WithdrawalDecisionRequest decisionOf(WithdrawalRequestStatus decision, String reason) {
        return new WithdrawalDecisionRequest(decision, reason);
    }

    @Test
    void decideThrowsWhenTheRequestIsUnknown() {
        UUID requestId = UUID.randomUUID();
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.APPROVED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(WithdrawalRequestNotFoundException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideApprovesARequestedRequestWithNoBalanceChange() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.decide(
            requestId, decisionOf(WithdrawalRequestStatus.APPROVED, null), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.APPROVED);
        assertThat(response.decidedAt()).isNotNull();
        verify(walletRepository, never()).creditBalance(any(), any());
    }

    @Test
    void decideThrowsWhenApprovingARequestWhoseAssociateKycHasRegressedSinceSubmission() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
        Associate regressed = verifiedActiveAssociate();
        regressed.setKycStatus(KycStatus.REJECTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(regressed));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.APPROVED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(KycNotVerifiedException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideRejectsARequestedRequestRefundsTheWalletAndSetsTheReason() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("750.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.decide(
            requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Bank details mismatch"), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REJECTED);
        assertThat(response.reason()).isEqualTo("Bank details mismatch");
        assertThat(response.decidedAt()).isNotNull();
        verify(walletRepository).creditBalance(ASSOCIATE_ID, new BigDecimal("750.00"));
    }

    @Test
    void decideCancelsAnApprovedRequestRefundsTheWalletIdenticallyAndProducesTheCancelledAuditMessage() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("2000.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.decide(
            requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Duplicate request"), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REJECTED);
        verify(walletRepository).creditBalance(ASSOCIATE_ID, new BigDecimal("2000.00"));

        ArgumentCaptor<String> summaryCaptor = ArgumentCaptor.forClass(String.class);
        verify(settingsAuditService).record(eq("withdrawal"), summaryCaptor.capture(), any(), eq(ADMIN_ACTOR_ID));
        assertThat(summaryCaptor.getValue()).contains("cancelled after approval");
    }

    @Test
    void decideRejectingFromRequestedProducesTheRejectedNotCancelledAuditMessage() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        withdrawalService.decide(requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Not eligible"), ADMIN_ACTOR_ID);

        ArgumentCaptor<String> summaryCaptor = ArgumentCaptor.forClass(String.class);
        verify(settingsAuditService).record(eq("withdrawal"), summaryCaptor.capture(), any(), eq(ADMIN_ACTOR_ID));
        assertThat(summaryCaptor.getValue()).contains("rejected").doesNotContain("cancelled");
    }

    @Test
    void decideThrowsWhenRejectingWithABlankReasonFromRequested() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "  "), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalDecisionException.class);

        verify(walletRepository, never()).creditBalance(any(), any());
        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideThrowsWhenCancellingWithABlankReasonFromApproved() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.REJECTED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalDecisionException.class);

        verify(walletRepository, never()).creditBalance(any(), any());
    }

    @Test
    void decideThrowsWhenTheDecisionValueIsNeitherApprovedNorRejected() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.DISBURSED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalDecisionException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideThrowsWhenReApprovingAnAlreadyApprovedRequest() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.APPROVED, null), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideThrowsWhenDecidingAnAlreadyRejectedRequest() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REJECTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Any reason"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void decideThrowsWhenDecidingAnAlreadyDisbursedRequest() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.DISBURSED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.decide(
                requestId, decisionOf(WithdrawalRequestStatus.REJECTED, "Any reason"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }
```

Also add these imports to the top of `WithdrawalServiceTest.java` (alongside the existing `import` block):
```java
import com.plotchain.withdrawal.WithdrawalDecisionRequest;
```
(Not actually needed — `WithdrawalDecisionRequest` is in the same package `com.plotchain.withdrawal` as the test class, so no import is required. Skip this addition; it's called out here only so the implementer doesn't add a redundant same-package import by habit.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=WithdrawalServiceTest -q`
Expected: compilation failure (`WithdrawalDecisionRequest`/`WithdrawalRequestNotFoundException`/`InvalidWithdrawalStateException`/`InvalidWithdrawalDecisionException` types exist from Step 1, but `WithdrawalService.decide(...)` does not exist yet) — or, once Step 1's types compile cleanly, a `NoSuchMethodError`/compile error specifically on the `withdrawalService.decide(...)` calls. Either way: FAIL, not yet a passing run.

- [ ] **Step 4: Implement `decide()`**

In `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`, insert the following method directly after `adminList(...)` (i.e., after its closing `}` on line 125) and before the `private Map<UUID, Associate> associatesById(...)` helper:

```java
    // Flow "Decide" (Decision 17, post-review broadening of the precondition from "must be
    // REQUESTED"): approve/reject a REQUESTED request, or cancel (reject) an already-APPROVED
    // one, through this single method -- no separate "cancel" endpoint or status value. Guard
    // order mirrors the spec's Flow steps exactly: 404 (unknown id) -> 409 (state precondition,
    // Decision 17) -> 400 (malformed decision body, InvalidWithdrawalDecisionException -- see
    // this unit's plan for why this is split from InvalidWithdrawalStateException) -> 409 (KYC
    // regression, only on the APPROVED path, Decision 9) -> mutate -> save -> audit.
    @Transactional
    public AdminWithdrawalResponse decide(UUID id, WithdrawalDecisionRequest request, UUID actorId) {
        WithdrawalRequest withdrawalRequest = withdrawalRequestRepository.findById(id)
            .orElseThrow(() -> new WithdrawalRequestNotFoundException(id));

        WithdrawalRequestStatus priorStatus = withdrawalRequest.getStatus();

        // Decision 17: REJECTED/DISBURSED never accept a decision. APPROVED accepts only
        // REJECTED (a cancel) -- re-approving is meaningless. REQUESTED accepts both, checked
        // generically by the decision-value guard just below.
        if (priorStatus == WithdrawalRequestStatus.REJECTED || priorStatus == WithdrawalRequestStatus.DISBURSED) {
            throw new InvalidWithdrawalStateException(
                "Withdrawal request " + id + " is already " + priorStatus + " and cannot be decided again");
        }
        if (priorStatus == WithdrawalRequestStatus.APPROVED && request.decision() != WithdrawalRequestStatus.REJECTED) {
            throw new InvalidWithdrawalStateException(
                "An APPROVED withdrawal request can only be cancelled (rejected), not re-approved");
        }

        if (request.decision() != WithdrawalRequestStatus.APPROVED && request.decision() != WithdrawalRequestStatus.REJECTED) {
            throw new InvalidWithdrawalDecisionException("decision must be APPROVED or REJECTED");
        }
        if (request.decision() == WithdrawalRequestStatus.REJECTED
                && (request.reason() == null || request.reason().isBlank())) {
            throw new InvalidWithdrawalDecisionException("reason is required when rejecting");
        }

        Associate associate = associateRepository.findById(withdrawalRequest.getAssociateId())
            .orElseThrow(() -> new AssociateNotFoundException(withdrawalRequest.getAssociateId()));

        Instant now = Instant.now();
        String summary;
        if (request.decision() == WithdrawalRequestStatus.APPROVED) {
            // Only reachable when priorStatus == REQUESTED, per the guards above.
            if (associate.getKycStatus() != KycStatus.VERIFIED) {
                throw new KycNotVerifiedException(associate.getId());
            }
            withdrawalRequest.setStatus(WithdrawalRequestStatus.APPROVED);
            withdrawalRequest.setDecidedAt(now);
            summary = "Withdrawal approved for " + associate.getUserId();
        } else {
            // Reachable from REQUESTED (a plain reject) or APPROVED (a post-approval cancel) --
            // same refund call either way (Decision 10), audit message text is what
            // distinguishes them (Decision 17).
            walletRepository.creditBalance(withdrawalRequest.getAssociateId(), withdrawalRequest.getAmount());
            withdrawalRequest.setStatus(WithdrawalRequestStatus.REJECTED);
            withdrawalRequest.setReason(request.reason());
            withdrawalRequest.setDecidedAt(now);
            summary = priorStatus == WithdrawalRequestStatus.APPROVED
                ? "Withdrawal cancelled after approval for " + associate.getUserId()
                : "Withdrawal rejected for " + associate.getUserId();
        }

        withdrawalRequestRepository.save(withdrawalRequest);

        settingsAuditService.record("withdrawal", summary,
            Map.of("decision", request.decision().name(),
                   "reason", request.reason() == null ? "" : request.reason(),
                   "priorStatus", priorStatus.name()),
            actorId);

        return toResponse(withdrawalRequest, associate);
    }
```

No new imports are required in `WithdrawalService.java` — `KycStatus`, `Instant`, `Map`, `UUID` are already imported (see the existing `submitRequest` method).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=WithdrawalServiceTest -q`
Expected: PASS, all tests including the new `decide*` methods green.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/withdrawal/WithdrawalDecisionRequest.java \
        backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestNotFoundException.java \
        backend/src/main/java/com/plotchain/withdrawal/InvalidWithdrawalStateException.java \
        backend/src/main/java/com/plotchain/withdrawal/InvalidWithdrawalDecisionException.java \
        backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java \
        backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java
git commit -m "feat(withdrawal): add WithdrawalService.decide() for approve/reject/cancel"
```

---

### Task 2: `POST /{id}/decision` endpoint — controller, exception wiring, security matcher

**Files:**
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java`
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalExceptionHandler.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java`
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `WithdrawalService.decide(UUID id, WithdrawalDecisionRequest request, UUID actorId): AdminWithdrawalResponse` (Task 1). `WithdrawalRequestNotFoundException`, `InvalidWithdrawalStateException`, `InvalidWithdrawalDecisionException` (Task 1, all in `com.plotchain.withdrawal`).
- Produces: `POST /api/admin/withdrawals/{id}/decision` returning `200 AdminWithdrawalResponse` on success; `404`/`409`/`400`/`403` per the exception mapping below. No new types produced for later units to consume (unit 8's disburse endpoint is a sibling `POST /{id}/disburse` added directly to this same controller/service, reusing `WithdrawalRequestNotFoundException` and `InvalidWithdrawalStateException` from Task 1 — not built here).

- [ ] **Step 1: Write the failing controller tests**

Append these test methods to `backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java`, just before the final closing `}` of the class (after `listIsUnauthorizedWithoutAToken`):

```java
    private WithdrawalRequest requestRowFor(UUID id, UUID associateId, java.math.BigDecimal amount, WithdrawalRequestStatus status) {
        WithdrawalRequest request = new WithdrawalRequest();
        request.setId(id);
        request.setAssociateId(associateId);
        request.setAmount(amount);
        request.setStatus(status);
        request.setRequestedAt(java.time.Instant.now());
        return request;
    }

    @Test
    void decideApprovesARequestedRequestAndReturns200ForAnAdminToken() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestRowFor(requestId, TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String body = new ObjectMapper().writeValueAsString(new WithdrawalDecisionRequest(WithdrawalRequestStatus.APPROVED, null));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("APPROVED"));
    }

    @Test
    void decideRejectsARequestedRequestAndReturns200ForAnAdminToken() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestRowFor(requestId, TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String body = new ObjectMapper().writeValueAsString(new WithdrawalDecisionRequest(WithdrawalRequestStatus.REJECTED, "Not eligible"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REJECTED"))
            .andExpect(jsonPath("$.reason").value("Not eligible"));
    }

    @Test
    void decideCancelsAnApprovedRequestAndReturns200ForAnAdminToken() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestRowFor(requestId, TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String body = new ObjectMapper().writeValueAsString(new WithdrawalDecisionRequest(WithdrawalRequestStatus.REJECTED, "Duplicate"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("REJECTED"));
    }

    @Test
    void decideReturns404ForAnUnknownRequestId() throws Exception {
        UUID requestId = UUID.randomUUID();
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.empty());

        String body = new ObjectMapper().writeValueAsString(new WithdrawalDecisionRequest(WithdrawalRequestStatus.APPROVED, null));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isNotFound());
    }

    @Test
    void decideReturns409ForAnAlreadyDisbursedRequest() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestRowFor(requestId, TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.DISBURSED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        String body = new ObjectMapper().writeValueAsString(new WithdrawalDecisionRequest(WithdrawalRequestStatus.REJECTED, "Any reason"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isConflict());
    }

    @Test
    void decideReturns400WhenRejectingWithABlankReason() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestRowFor(requestId, TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        String body = new ObjectMapper().writeValueAsString(new WithdrawalDecisionRequest(WithdrawalRequestStatus.REJECTED, "  "));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest());
    }

    @Test
    void decideReturns409WhenApprovalTimeKycHasRegressed() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestRowFor(requestId, TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);
        Associate regressed = verifiedActiveAssociate();
        regressed.setKycStatus(KycStatus.REJECTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(regressed));

        String body = new ObjectMapper().writeValueAsString(new WithdrawalDecisionRequest(WithdrawalRequestStatus.APPROVED, null));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isConflict());
    }

    @Test
    void decideIsForbiddenForAnAssociateToken() throws Exception {
        UUID requestId = UUID.randomUUID();
        String body = new ObjectMapper().writeValueAsString(new WithdrawalDecisionRequest(WithdrawalRequestStatus.APPROVED, null));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isForbidden());
    }
```

- [ ] **Step 2: Run the controller tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=WithdrawalControllerTest -q`
Expected: FAIL — `POST /api/admin/withdrawals/{id}/decision` 404s (route doesn't exist yet) instead of returning the expected status codes.

- [ ] **Step 3: Wire the controller endpoint**

In `backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java`, add this method to the existing class, after `list(...)`:

```java
    @PostMapping("/{id}/decision")
    public AdminWithdrawalResponse decide(
            @PathVariable java.util.UUID id,
            @Valid @RequestBody WithdrawalDecisionRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return withdrawalService.decide(id, request, actorId);
    }
```

Add `import org.springframework.web.bind.annotation.PathVariable;` to the existing import block at the top of the file (alongside the other `org.springframework.web.bind.annotation.*` imports already there).

Update the file's leading comment (currently: `// Wallet/withdrawal unit 5 added POST (submit). Unit 6 ... adds this GET (list) method ... Units 7-8 add the /{id}/decision, /{id}/disburse POSTs.`) to reflect that unit 7 is now done:
```java
// Wallet/withdrawal unit 5 added POST (submit). Unit 6 added GET (list). Unit 7
// (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Decide -- POST /api/admin/withdrawals/{id}/decision, ADMIN-only") adds this decide() method.
// Unit 8 adds the sibling /{id}/disburse POST. ADMIN-only enforcement is via SecurityConfig's
// explicit matcher (see below) -- no @PreAuthorize needed on the method itself.
```

- [ ] **Step 4: Wire the exception handlers**

In `backend/src/main/java/com/plotchain/withdrawal/WithdrawalExceptionHandler.java`, add these three handler methods to the existing class, after `handleInsufficientWalletBalance`:

```java
    @ExceptionHandler(WithdrawalRequestNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleWithdrawalRequestNotFound(WithdrawalRequestNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidWithdrawalStateException.class)
    public ResponseEntity<Map<String, String>> handleInvalidWithdrawalState(InvalidWithdrawalStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InvalidWithdrawalDecisionException.class)
    public ResponseEntity<Map<String, String>> handleInvalidWithdrawalDecision(InvalidWithdrawalDecisionException ex) {
        return ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("error", ex.getMessage()));
    }
```

- [ ] **Step 5: Add the SecurityConfig matcher**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, insert this matcher directly after the existing `POST /api/admin/withdrawals` matcher (after its `.hasAuthority("ADMIN")` line, currently around line 108), before the Sales `POST /api/admin/sales` matcher:

```java
                // Wallet/withdrawal unit 7
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "Decide -- POST /api/admin/withdrawals/{id}/decision, ADMIN-only"): same
                // target-role-model reasoning and first-match-wins placement as the submit
                // matcher directly above -- not load-bearing on its own (the blanket POST rule
                // below already covers it), added for the same readability/grouping reason that
                // matcher documents.
                .requestMatchers(HttpMethod.POST, "/api/admin/withdrawals/*/decision")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 6: Write the failing SecurityConfigTest case**

Add this test to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, directly after `adminWithdrawalsListIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (after its closing `}`, before `kycDecisionIsForbiddenForAnAssociateToken`):

```java
    // Wallet/withdrawal unit 7 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "Decide -- POST /api/admin/withdrawals/{id}/decision, ADMIN-only"): same target-role-model
    // pattern as POST /api/admin/withdrawals above. A random, never-persisted request id reaches
    // the real (H2, unmocked-here) WithdrawalRequestRepository and 404s for the ADMIN token
    // (WithdrawalRequestNotFoundException) -- proof the request passed the security layer, not
    // proof of any particular business outcome, same "assert not 403" reasoning as
    // adminWithdrawalsSubmitIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above. Every
    // other role is blocked at the filter layer before the controller/service ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminWithdrawalsDecideIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.withdrawal.WithdrawalDecisionRequest(
                com.plotchain.withdrawal.WithdrawalRequestStatus.APPROVED, null));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/decision", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }
```

- [ ] **Step 7: Run all the tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=WithdrawalControllerTest,WithdrawalServiceTest,SecurityConfigTest -q`
Expected: PASS, all tests green including the new controller and security tests.

Also run the full backend suite once to confirm nothing else regressed:
Run: `cd backend && ./mvnw test -q`
Expected: PASS (aside from the ~55 known-spurious JDK21/25 Mockito errors unrelated to this change — see the `plotchain_jdk_mockito_env_issue` memory note; do not chase those).

- [ ] **Step 8: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java \
        backend/src/main/java/com/plotchain/withdrawal/WithdrawalExceptionHandler.java \
        backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(withdrawal): wire POST /api/admin/withdrawals/{id}/decision endpoint"
```

---

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** every unit-7 acceptance-criteria bullet has a corresponding test — 404 unknown id (`decideThrowsWhenTheRequestIsUnknown` / `decideReturns404ForAnUnknownRequestId`), REQUESTED→APPROVED/REJECTED and APPROVED→REJECTED-only precondition (`decideThrowsWhenReApprovingAnAlreadyApprovedRequest`, cancel tests), REJECTED/DISBURSED→any-decision 409 (`decideThrowsWhenDecidingAnAlreadyRejectedRequest`, `...DisbursedRequest`, `decideReturns409ForAnAlreadyDisbursedRequest`), blank-reason 400 from both prior states (`decideThrowsWhenRejectingWithABlankReasonFromRequested`, `...CancellingWithABlankReasonFromApproved`, `decideReturns400WhenRejectingWithABlankReason`), APPROVED-outcome KYC re-check 409 (`decideThrowsWhenApprovingARequestWhoseAssociateKycHasRegressedSinceSubmission`, `decideReturns409WhenApprovalTimeKycHasRegressed`), APPROVED sets no balance change (`verify(walletRepository, never()).creditBalance`), REJECTED-outcome refund via `creditBalance` from both prior states (`decideRejectsARequestedRequestRefundsTheWalletAndSetsTheReason`, `decideCancelsAnApprovedRequestRefundsTheWalletIdenticallyAndProducesTheCancelledAuditMessage`), distinct audit messages (`...ProducesTheCancelledAuditMessage`, `decideRejectingFromRequestedProducesTheRejectedNotCancelledAuditMessage`), non-ADMIN 403 (`decideIsForbiddenForAnAssociateToken`, `adminWithdrawalsDecideIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`). No dedicated "hold" endpoint is added (Decision 8) — nothing in this plan introduces one.
- **Placeholder scan:** no TBD/TODO markers; every step has literal, complete code.
- **Type consistency:** `WithdrawalService.decide(UUID, WithdrawalDecisionRequest, UUID): AdminWithdrawalResponse` is the exact signature used identically in Task 1's tests and Task 2's controller. `WithdrawalDecisionRequest(WithdrawalRequestStatus decision, String reason)` field names/types match across both tasks. Exception constructors (`WithdrawalRequestNotFoundException(UUID)`, `InvalidWithdrawalStateException(String)`, `InvalidWithdrawalDecisionException(String)`) match their usage in `WithdrawalService.decide()` and their handler signatures in `WithdrawalExceptionHandler`.
- **Out of scope, confirmed not touched:** unit 8 (`/disburse`), unit 9 (associate history), unit 10 (admin screen) — no files for those are created or modified here. `WalletRepository`, `WithdrawalRequestRepository`, `WithdrawalRequestStatus`, `WithdrawalRequest` entity, and `WithdrawalConfigService` are all read-only dependencies in this plan — none of their files are modified, only `WithdrawalService`, `WithdrawalController`, `WithdrawalExceptionHandler`, and `SecurityConfig` are.
