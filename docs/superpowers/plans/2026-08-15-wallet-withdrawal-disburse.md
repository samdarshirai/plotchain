# Wallet/Withdrawal Unit 8 — Disburse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `POST /api/admin/withdrawals/{id}/disburse` (ADMIN-only) to the already-merged `WithdrawalController`/`WithdrawalService`, letting an admin mark an `APPROVED` withdrawal request `DISBURSED` and record a manually-entered bank reference.

**Architecture:** Fourth method (`disburse`) added to the existing single-controller/single-service withdrawal-lifecycle class pair (Decision 12) — no new controller, no new service, no new exception types. This is the simplest of the four lifecycle units: a single valid prior state (`APPROVED`), no branching, no refund, and — per Decision 10 — no wallet mutation at all (funds were already debited at request-creation time in unit 5 and never touched again by unit 7's approve path). The only new production type is a small request DTO, `DisburseWithdrawalRequest(bankReference)`, named explicitly in the spec's "New Java types" list. Reuses `WithdrawalRequestNotFoundException` and `InvalidWithdrawalStateException` unmodified from unit 7 — both already wired into `WithdrawalExceptionHandler`, so **no exception-handler changes are needed by this unit** (unlike unit 7, which had to add handler entries for its two new exception types).

**Tech Stack:** Spring Boot (Java), Spring Data JPA, MockMvc + real JWT auth for controller/security tests, JUnit 5 + Mockito + AssertJ for service tests, H2 for `@SpringBootTest` integration tests.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` (Decision 10, 11; Flow "Disburse"; Error handling table; Data model "New Java types"). Unit-level acceptance criteria: `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md`, section "### 8."

## Global Constraints

- ADMIN-only: non-ADMIN token → 403 (enforced by the existing blanket `POST /api/**` → `hasAuthority("ADMIN")` rule in `SecurityConfig`; an explicit narrower matcher is added anyway, matching the readability convention units 5/6/7 established — not load-bearing on its own).
- No new database migration — `withdrawal_request`'s `chk_withdrawal_request_status` CHECK constraint and `WithdrawalRequestStatus` enum already include `DISBURSED` (added in unit 5's migration, first made reachable by this unit).
- No new `WalletRepository`/`WithdrawalRequestRepository` methods — `disburse()` uses `findById`/`save` (inherited from `JpaRepository`), same as `decide()`.
- No wallet mutation of any kind (Decision 10) — `disburse()` must never call `walletRepository.debitIfSufficient` or `walletRepository.creditBalance`. This is the one behavior every test in this unit ultimately exists to pin down; the service-layer tests explicitly assert `verifyNoInteractions(walletRepository)`.
- No new exception types — reuse `WithdrawalRequestNotFoundException` (404) and `InvalidWithdrawalStateException` (409) from unit 7 exactly as they are; do not modify either class or `WithdrawalExceptionHandler`.
- Actor attribution stays audit-log-only (Decision 11) — no `disbursedBy` column is added to `WithdrawalRequest`.
- Bean Validation (`@NotBlank`) handles the blank-`bankReference` → 400 case entirely in the DTO, mirroring how `CreateWithdrawalRequest`'s `@Positive amount` handles its own single-field guard before the service method is ever called — do not duplicate a blank check inside `WithdrawalService.disburse()`.

---

### Task 1: `WithdrawalService.disburse()` — core disbursement logic

**Files:**
- Create: `backend/src/main/java/com/plotchain/withdrawal/DisburseWithdrawalRequest.java`
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`

**Interfaces:**
- Consumes (already-injected constructor dependencies, no signature change needed): `AssociateRepository associateRepository`, `WithdrawalRequestRepository withdrawalRequestRepository` (`findById(UUID): Optional<WithdrawalRequest>`, `save(WithdrawalRequest)`, both inherited), `SettingsAuditService.record(String section, String summary, Map<String,Object> detail, UUID actorId)`, existing `WithdrawalRequestNotFoundException(UUID)` and `InvalidWithdrawalStateException(String)` (both unit 7), existing `AssociateNotFoundException(UUID)`, existing private `toResponse(WithdrawalRequest, Associate): AdminWithdrawalResponse` helper. `walletRepository` is **not** consumed by this method (Decision 10 — no balance change).
- Produces: `WithdrawalService.disburse(UUID id, DisburseWithdrawalRequest request, UUID actorId): AdminWithdrawalResponse` — Task 2's controller calls this exact signature. `DisburseWithdrawalRequest(String bankReference)`.

- [ ] **Step 1: Write the new DTO**

`backend/src/main/java/com/plotchain/withdrawal/DisburseWithdrawalRequest.java`:
```java
package com.plotchain.withdrawal;

import jakarta.validation.constraints.NotBlank;

// Wallet/withdrawal unit 8 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Flow "Disburse" step 3, Data model "New Java types"): bankReference is a manually-entered
// record of a bank transfer that happened outside this system (Decision resolved in Scope -- no
// real payment gateway integration is ever called here). @NotBlank enforces the spec's "blank
// bankReference -> 400" acceptance criterion directly via Bean Validation before
// WithdrawalService.disburse() ever runs, the same pattern CreateWithdrawalRequest's @Positive
// amount already establishes for its own single-field guard.
public record DisburseWithdrawalRequest(@NotBlank String bankReference) {}
```

- [ ] **Step 2: Write the failing tests**

Append these test methods to `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`, just before the final closing `}` of the class (after `decideThrowsWhenDecidingAnAlreadyDisbursedRequest`):

```java
    private DisburseWithdrawalRequest disburseWith(String bankReference) {
        return new DisburseWithdrawalRequest(bankReference);
    }

    @Test
    void disburseThrowsWhenTheRequestIsUnknown() {
        UUID requestId = UUID.randomUUID();
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID))
            .isInstanceOf(WithdrawalRequestNotFoundException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void disburseThrowsWhenTheRequestIsStillRequested() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void disburseThrowsWhenTheRequestIsAlreadyRejected() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.REJECTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void disburseThrowsWhenTheRequestIsAlreadyDisbursed() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("300.00"), WithdrawalRequestStatus.DISBURSED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        assertThatThrownBy(() -> withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID))
            .isInstanceOf(InvalidWithdrawalStateException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void disburseTransitionsApprovedToDisbursedRecordsTheBankReferenceAndMakesNoBalanceChange() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1500.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.DISBURSED);
        assertThat(response.bankReference()).isEqualTo("BANK-REF-001");
        assertThat(response.disbursedAt()).isNotNull();
        verifyNoInteractions(walletRepository);
    }

    @Test
    void disburseRecordsASettingsAuditEntry() {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestFor(requestId, ASSOCIATE_ID, new BigDecimal("1500.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        withdrawalService.disburse(requestId, disburseWith("BANK-REF-001"), ADMIN_ACTOR_ID);

        ArgumentCaptor<String> summaryCaptor = ArgumentCaptor.forClass(String.class);
        verify(settingsAuditService).record(eq("withdrawal"), summaryCaptor.capture(), any(), eq(ADMIN_ACTOR_ID));
        assertThat(summaryCaptor.getValue()).contains("VP00001");
    }
```

This requires one new static import in `WithdrawalServiceTest.java`, alongside the existing `import static org.mockito.Mockito.never;`/`import static org.mockito.Mockito.verify;`/`import static org.mockito.Mockito.when;` block:
```java
import static org.mockito.Mockito.verifyNoInteractions;
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=WithdrawalServiceTest -q`
Expected: compilation failure — `DisburseWithdrawalRequest` exists from Step 1, but `WithdrawalService.disburse(...)` does not exist yet. FAIL, not yet a passing run.

- [ ] **Step 4: Implement `disburse()`**

In `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`, insert the following method directly after `decide(...)` (i.e., after its closing `}`, currently line 199) and before the `private Map<UUID, Associate> associatesById(...)` helper (currently line 201):

```java
    // Flow "Disburse" (Decision 10): the simplest of the four withdrawal-lifecycle transitions --
    // exactly one valid prior state (APPROVED), no branching, no refund, and no wallet mutation
    // at all -- the associate's balance was already debited at submission time (unit 5) and is
    // never touched again by approve (unit 7) or here. This method only ever writes the three
    // disbursement-record fields: status, bankReference, disbursedAt. bankReference's
    // blank-check is handled entirely by @NotBlank on DisburseWithdrawalRequest (Bean
    // Validation, before this method runs), the same division of labor CreateWithdrawalRequest's
    // @Positive amount already establishes. Reuses WithdrawalRequestNotFoundException and
    // InvalidWithdrawalStateException unmodified from unit 7 -- both already mapped by
    // WithdrawalExceptionHandler, so no handler changes are needed here.
    @Transactional
    public AdminWithdrawalResponse disburse(UUID id, DisburseWithdrawalRequest request, UUID actorId) {
        WithdrawalRequest withdrawalRequest = withdrawalRequestRepository.findById(id)
            .orElseThrow(() -> new WithdrawalRequestNotFoundException(id));

        if (withdrawalRequest.getStatus() != WithdrawalRequestStatus.APPROVED) {
            throw new InvalidWithdrawalStateException(
                "Withdrawal request " + id + " is " + withdrawalRequest.getStatus()
                    + " and cannot be disbursed; only an APPROVED request can be disbursed");
        }

        Associate associate = associateRepository.findById(withdrawalRequest.getAssociateId())
            .orElseThrow(() -> new AssociateNotFoundException(withdrawalRequest.getAssociateId()));

        withdrawalRequest.setStatus(WithdrawalRequestStatus.DISBURSED);
        withdrawalRequest.setBankReference(request.bankReference());
        withdrawalRequest.setDisbursedAt(Instant.now());
        withdrawalRequestRepository.save(withdrawalRequest);

        settingsAuditService.record("withdrawal",
            "Withdrawal disbursed for " + associate.getUserId(),
            Map.of("bankReference", request.bankReference()),
            actorId);

        return toResponse(withdrawalRequest, associate);
    }
```

No new imports are required in `WithdrawalService.java` — `Instant`, `Map`, `UUID` are already imported (see the existing `submitRequest`/`decide` methods).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=WithdrawalServiceTest -q`
Expected: PASS, all tests including the new `disburse*` methods green.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/withdrawal/DisburseWithdrawalRequest.java \
        backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java \
        backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java
git commit -m "feat(withdrawal): add WithdrawalService.disburse()"
```

---

### Task 2: `POST /{id}/disburse` endpoint — controller, security matcher

**Files:**
- Modify: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java`
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java`
- Test: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

No changes to `WithdrawalExceptionHandler.java` — `WithdrawalRequestNotFoundException` and `InvalidWithdrawalStateException` are already mapped to 404/409 respectively (unit 7).

**Interfaces:**
- Consumes: `WithdrawalService.disburse(UUID id, DisburseWithdrawalRequest request, UUID actorId): AdminWithdrawalResponse` (Task 1).
- Produces: `POST /api/admin/withdrawals/{id}/disburse` returning `200 AdminWithdrawalResponse` on success; `404`/`409`/`400`/`403` per the existing exception mapping. This is the last of the four withdrawal-lifecycle endpoints — no later unit adds a sibling method to this controller/service pair (unit 9 is a new, separate `GET /api/associates/me/withdrawals` reusing `WithdrawalRequestRepository.search`, not a `WithdrawalController`/`WithdrawalService` addition).

- [ ] **Step 1: Write the failing controller tests**

Append these test methods to `backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java`, just before the final closing `}` of the class (after `decideIsForbiddenForAnAssociateToken`):

```java
    @Test
    void disburseTransitionsAnApprovedRequestToDisbursedAndReturns200ForAnAdminToken() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestRowFor(requestId, TARGET_ASSOCIATE_ID, new BigDecimal("1500.00"), WithdrawalRequestStatus.APPROVED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String body = new ObjectMapper().writeValueAsString(new DisburseWithdrawalRequest("BANK-REF-001"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/disburse", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.status").value("DISBURSED"))
            .andExpect(jsonPath("$.bankReference").value("BANK-REF-001"));
    }

    @Test
    void disburseReturns404ForAnUnknownRequestId() throws Exception {
        UUID requestId = UUID.randomUUID();
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.empty());

        String body = new ObjectMapper().writeValueAsString(new DisburseWithdrawalRequest("BANK-REF-001"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/disburse", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isNotFound());
    }

    @Test
    void disburseReturns409ForARequestThatIsNotYetApproved() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestRowFor(requestId, TARGET_ASSOCIATE_ID, new BigDecimal("1500.00"), WithdrawalRequestStatus.REQUESTED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        String body = new ObjectMapper().writeValueAsString(new DisburseWithdrawalRequest("BANK-REF-001"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/disburse", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isConflict());
    }

    @Test
    void disburseReturns409ForAnAlreadyDisbursedRequest() throws Exception {
        UUID requestId = UUID.randomUUID();
        WithdrawalRequest request = requestRowFor(requestId, TARGET_ASSOCIATE_ID, new BigDecimal("1500.00"), WithdrawalRequestStatus.DISBURSED);
        when(withdrawalRequestRepository.findById(requestId)).thenReturn(Optional.of(request));

        String body = new ObjectMapper().writeValueAsString(new DisburseWithdrawalRequest("BANK-REF-001"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/disburse", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isConflict());
    }

    @Test
    void disburseReturns400WhenBankReferenceIsBlank() throws Exception {
        UUID requestId = UUID.randomUUID();
        String body = new ObjectMapper().writeValueAsString(new DisburseWithdrawalRequest("   "));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/disburse", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.bankReference").isNotEmpty());
    }

    @Test
    void disburseIsForbiddenForAnAssociateToken() throws Exception {
        UUID requestId = UUID.randomUUID();
        String body = new ObjectMapper().writeValueAsString(new DisburseWithdrawalRequest("BANK-REF-001"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/disburse", requestId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isForbidden());
    }
```

Note: `disburseReturns400WhenBankReferenceIsBlank` asserts `$.fields.bankReference`, mirroring `submitReturns400WhenAmountIsNotPositive`'s `$.fields.amount` assertion above — both rely on the same app-wide Bean Validation error body shape (`{"fields": {"<field>": "<message>"}}`), confirm this shape by reading the existing `submitReturns400WhenAmountIsNotPositive` test (already in this file) if the assertion fails; do not invent a different error-body shape.

- [ ] **Step 2: Run the controller tests to verify they fail**

Run: `cd backend && ./mvnw test -Dtest=WithdrawalControllerTest -q`
Expected: FAIL — `POST /api/admin/withdrawals/{id}/disburse` 404s (route doesn't exist yet, `DisburseWithdrawalRequest` compiles from Task 1) instead of returning the expected status codes.

- [ ] **Step 3: Wire the controller endpoint**

In `backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java`, add this method to the existing class, after `decide(...)`:

```java
    @PostMapping("/{id}/disburse")
    public AdminWithdrawalResponse disburse(
            @PathVariable UUID id,
            @Valid @RequestBody DisburseWithdrawalRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return withdrawalService.disburse(id, request, actorId);
    }
```

No new imports are required — `@PathVariable`, `@Valid`, `@RequestBody`, `@PostMapping`, `@AuthenticationPrincipal` are all already imported (unit 7 added `PathVariable`).

Update the file's leading comment (currently: `// Wallet/withdrawal unit 5 added POST (submit). Unit 6 added GET (list). Unit 7 ... adds this decide() method. Unit 8 adds the sibling /{id}/disburse POST. ...`) to reflect that unit 8 is now done:
```java
// Wallet/withdrawal unit 5 added POST (submit). Unit 6 added GET (list). Unit 7 added
// POST /{id}/decision (decide()). Unit 8
// (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "Disburse -- POST /api/admin/withdrawals/{id}/disburse, ADMIN-only") adds this disburse()
// method, the last of the four lifecycle endpoints on this controller. ADMIN-only enforcement is
// via SecurityConfig's explicit matcher (see below) -- no @PreAuthorize needed on the method itself.
```

- [ ] **Step 4: Add the SecurityConfig matcher**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, insert this matcher directly after the existing `POST /api/admin/withdrawals/*/decision` matcher (after its `.hasAuthority("ADMIN")` line, currently around line 117), before the Sales `POST /api/admin/sales` matcher:

```java
                // Wallet/withdrawal unit 8
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "Disburse -- POST /api/admin/withdrawals/{id}/disburse, ADMIN-only"): same
                // target-role-model reasoning and first-match-wins placement as the submit/decide
                // matchers directly above -- not load-bearing on its own (the blanket POST rule
                // below already covers it), added for the same readability/grouping reason those
                // matchers document.
                .requestMatchers(HttpMethod.POST, "/api/admin/withdrawals/*/disburse")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 5: Write the failing SecurityConfigTest case**

Add this test to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, directly after `adminWithdrawalsDecideIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` (after its closing `}`, before `kycDecisionIsForbiddenForAnAssociateToken`):

```java
    // Wallet/withdrawal unit 8 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "Disburse -- POST /api/admin/withdrawals/{id}/disburse, ADMIN-only"): same
    // target-role-model pattern as POST /api/admin/withdrawals/*/decision above. A random,
    // never-persisted request id reaches the real (H2, unmocked-here) WithdrawalRequestRepository
    // and 404s for the ADMIN token (WithdrawalRequestNotFoundException) -- proof the request
    // passed the security layer, not proof of any particular business outcome, same "assert not
    // 403" reasoning as adminWithdrawalsDecideIsReachableOnlyForAdminAndForbiddenForEveryOtherRole
    // above. Every other role is blocked at the filter layer before the controller/service ever
    // runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminWithdrawalsDisburseIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.withdrawal.DisburseWithdrawalRequest("BANK-REF-001"));

        mockMvc.perform(post("/api/admin/withdrawals/{id}/disburse", UUID.randomUUID())
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }
```

- [ ] **Step 6: Run all the tests to verify they pass**

Run: `cd backend && ./mvnw test -Dtest=WithdrawalControllerTest,WithdrawalServiceTest,SecurityConfigTest -q`
Expected: PASS, all tests green including the new controller and security tests.

Also run the full backend suite once to confirm nothing else regressed:
Run: `cd backend && ./mvnw test -q`
Expected: PASS (aside from the ~55 known-spurious JDK21/25 Mockito errors unrelated to this change — see the `plotchain_jdk_mockito_env_issue` memory note; do not chase those).

- [ ] **Step 7: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java \
        backend/src/main/java/com/plotchain/auth/SecurityConfig.java \
        backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java \
        backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(withdrawal): wire POST /api/admin/withdrawals/{id}/disburse endpoint"
```

---

## Self-review notes (for whoever executes this plan)

- **Spec coverage:** every unit-8 acceptance-criteria bullet has a corresponding test — unknown `{id}` → 404 (`disburseThrowsWhenTheRequestIsUnknown` / `disburseReturns404ForAnUnknownRequestId`); `status != APPROVED` → 409, exercised from all three other states (`disburseThrowsWhenTheRequestIsStillRequested`, `disburseThrowsWhenTheRequestIsAlreadyRejected`, `disburseThrowsWhenTheRequestIsAlreadyDisbursed`, plus the controller-level `disburseReturns409ForARequestThatIsNotYetApproved`/`...AlreadyDisbursedRequest`); blank `bankReference` → 400 (`disburseReturns400WhenBankReferenceIsBlank`, enforced by `@NotBlank`); `status = DISBURSED`/`bankReference`/`disbursedAt` set with no wallet mutation (`disburseTransitionsApprovedToDisbursedRecordsTheBankReferenceAndMakesNoBalanceChange`'s `verifyNoInteractions(walletRepository)`, mirrored at the controller layer by `disburseTransitionsAnApprovedRequestToDisbursedAndReturns200ForAnAdminToken`); audit log recorded (`disburseRecordsASettingsAuditEntry`); non-ADMIN token → 403 (`disburseIsForbiddenForAnAssociateToken`, `adminWithdrawalsDisburseIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`).
- **Placeholder scan:** no TBD/TODO markers; every step has literal, complete code.
- **Type consistency:** `WithdrawalService.disburse(UUID, DisburseWithdrawalRequest, UUID): AdminWithdrawalResponse` is the exact signature used identically in Task 1's tests and Task 2's controller. `DisburseWithdrawalRequest(String bankReference)`'s field name/type matches `WithdrawalRequest.bankReference`/`AdminWithdrawalResponse.bankReference()` exactly, so no mapping mismatch is possible.
- **No exception-handler changes:** confirmed both `WithdrawalRequestNotFoundException` and `InvalidWithdrawalStateException` are already `@ExceptionHandler`-mapped in `WithdrawalExceptionHandler.java` (404 and 409 respectively) as of unit 7 — this plan does not touch that file, and no task above lists it as modified.
- **Out of scope, confirmed not touched:** unit 9 (associate history — a new read endpoint reusing `WithdrawalRequestRepository.search`, no changes to `WithdrawalController`/`WithdrawalService`), unit 10 (admin screen). `WalletRepository` is a read-only dependency in this plan (per Decision 10, `disburse()` never calls any of its methods) — its file is not modified. `WithdrawalRequestRepository`, `WithdrawalRequestStatus`, `WithdrawalRequest` entity, and `WithdrawalExceptionHandler` are also read-only here — only `WithdrawalService`, `WithdrawalController`, and `SecurityConfig` are modified, plus the one new `DisburseWithdrawalRequest.java` file.
