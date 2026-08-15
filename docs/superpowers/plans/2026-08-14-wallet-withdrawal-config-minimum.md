# Wallet/Withdrawal Unit 3 — `withdrawal_config` Minimum-Withdrawal-Amount Go-Live Gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `withdrawal_config` a nullable `minimum_withdrawal_amount` column, extend the existing `payments` package's config entity/DTOs/service to round-trip it, add `WithdrawalConfigService.isComplete()`, and wire that into `SetupStateService`'s `paymentsKyc` step so Go-Live is blocked until an admin explicitly sets a minimum (including explicitly to `0`).

**Architecture:** Purely additive changes inside the existing `payments`-package config domain (`WithdrawalConfig`/`WithdrawalConfigRequest`/`WithdrawalConfigResponse`/`WithdrawalConfigService`) plus one new required-dependency injection into `company`'s `SetupStateService`. No new endpoint, no new table, no new package — this unit extends the domain that already owns this config (Decision 6), the same instinct the spec calls out explicitly.

**Tech Stack:** Java 21, Spring Boot, Spring Data JPA, Flyway (Postgres migrations), JUnit 5 + Mockito + AssertJ, MockMvc for controller-level tests.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` (Decisions 6 and 18, Data model section, Entity changes section, Testing section) and `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md` section "### 3."

## Global Constraints

- New migration file: `ALTER TABLE withdrawal_config ADD COLUMN minimum_withdrawal_amount NUMERIC(14,2);` — nullable, **no default**. This supersedes the spec's earlier `NOT NULL DEFAULT 0` draft (Decision 6) — Decision 18 (post-review) is the resolving decision and is authoritative.
- `WithdrawalConfigService.isComplete()` is a **null-check, not a truthiness check** — `0` counts as complete, `null` does not.
- `approvalMode`/`autoApproveLimit` keep their existing always-defaulted, non-blocking behavior — do not touch their semantics anywhere in this unit.
- No new endpoint — `minimumWithdrawalAmount` rides the existing `GET /api/company/withdrawal` / `PUT /api/company/withdrawal` pair on `WithdrawalConfigController`.
- No `SecurityConfigTest` changes — no new route is introduced.
- Next available Flyway version in `backend/src/main/resources/db/migration/` is **V21** (existing files run V1–V20).

---

## File Structure

| File | Change |
|---|---|
| `backend/src/main/resources/db/migration/V21__withdrawal_config_minimum.sql` | Create — the `ALTER TABLE` migration |
| `backend/src/main/java/com/plotchain/payments/WithdrawalConfig.java` | Modify — new `minimumWithdrawalAmount` field + getter/setter |
| `backend/src/main/java/com/plotchain/payments/WithdrawalConfigRequest.java` | Modify — new nullable record component |
| `backend/src/main/java/com/plotchain/payments/WithdrawalConfigResponse.java` | Modify — new record component |
| `backend/src/main/java/com/plotchain/payments/WithdrawalConfigService.java` | Modify — `updateConfig()`/`toResponse()` round-trip the field; new `isComplete()` method |
| `backend/src/main/java/com/plotchain/company/SetupStateService.java` | Modify — new `WithdrawalConfigService` dependency; `paymentsKyc` case gains a third `&&` clause |
| `backend/src/test/java/com/plotchain/payments/WithdrawalConfigServiceTest.java` | Modify — update 5 existing `WithdrawalConfigRequest` call sites for the new record shape; add round-trip test + 3 `isComplete()` tests |
| `backend/src/test/java/com/plotchain/payments/WithdrawalConfigControllerTest.java` | Modify — add GET/PUT round-trip assertions for the new field |
| `backend/src/test/java/com/plotchain/company/SetupStateServiceTest.java` | Modify — new mock, new constructor wiring, updated `stubPaymentsKycComplete()` helper, 2 new tests |
| `backend/src/test/java/com/plotchain/auth/AuthServiceTest.java` | Modify — one extra `null` in an existing `SetupStateService` constructor call |
| `backend/src/test/java/com/plotchain/auth/AuthControllerTest.java` | Modify — same one-line constructor-arity fix |

No changes to `WithdrawalConfigController.java`, `WithdrawalConfigRepository.java`, or `SetupStateController.java` — the existing endpoints and repository already work unmodified with the extended DTOs/entity. `SetupStateControllerTest.java` needs no code change — it's a `@SpringBootTest` wiring the real `WithdrawalConfigService`/`WithdrawalConfigRepository` beans against the (Flyway-migrated) test database, same as it already does for the other `paymentsKyc` sub-services.

---

## Task 1: Migration — add the nullable `minimum_withdrawal_amount` column

**Files:**
- Create: `backend/src/main/resources/db/migration/V21__withdrawal_config_minimum.sql`
- Test: none new (verified via an existing `@SpringBootTest` context load, which runs Flyway on startup)

**Interfaces:**
- Produces: a `minimum_withdrawal_amount NUMERIC(14,2)` column on `withdrawal_config`, nullable, no default. Every existing row (including the V9-seeded singleton) ends up with `NULL` here — this is the "fresh V9-seeded row" state Task 3's `isComplete()` test relies on.

- [ ] **Step 1: Write the migration**

```sql
-- withdrawal_config gains the minimum-withdrawal-threshold field the PRD assumed already
-- existed (wallet-withdrawal spec, Decisions 6 and 18). Nullable, no default: unlike
-- approval_mode/auto_approve_limit (always-defaulted, never block Go-Live), this field is
-- promoted to a Go-Live-gating requirement -- an admin must explicitly set it (including to 0,
-- for an explicit "no minimum" policy) before WithdrawalConfigService.isComplete() is true.
ALTER TABLE withdrawal_config
    ADD COLUMN minimum_withdrawal_amount NUMERIC(14,2);
```

- [ ] **Step 2: Verify the migration applies cleanly**

No code references the new column yet, so this step only proves Flyway accepts the file. Run an existing `@SpringBootTest` that boots the full context (Flyway migrates on startup):

Run: `cd backend && mvn -q test -Dtest=WithdrawalConfigControllerTest`
Expected: PASS — all 4 pre-existing tests in that class stay green, confirming V21 applied without a Flyway checksum/syntax error and without changing any existing behavior.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V21__withdrawal_config_minimum.sql
git commit -m "feat(payments): add minimum_withdrawal_amount column to withdrawal_config"
```

---

## Task 2: Round-trip `minimumWithdrawalAmount` through the entity, DTOs, and `updateConfig()`/`getConfig()`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/payments/WithdrawalConfig.java`
- Modify: `backend/src/main/java/com/plotchain/payments/WithdrawalConfigRequest.java`
- Modify: `backend/src/main/java/com/plotchain/payments/WithdrawalConfigResponse.java`
- Modify: `backend/src/main/java/com/plotchain/payments/WithdrawalConfigService.java`
- Test: `backend/src/test/java/com/plotchain/payments/WithdrawalConfigServiceTest.java`
- Test: `backend/src/test/java/com/plotchain/payments/WithdrawalConfigControllerTest.java`

**Interfaces:**
- Consumes: Task 1's `minimum_withdrawal_amount` column.
- Produces: `WithdrawalConfig.getMinimumWithdrawalAmount()/setMinimumWithdrawalAmount(BigDecimal)`; `WithdrawalConfigRequest(String approvalMode, BigDecimal autoApproveLimit, BigDecimal minimumWithdrawalAmount)`; `WithdrawalConfigResponse(String approvalMode, BigDecimal autoApproveLimit, BigDecimal minimumWithdrawalAmount, Instant updatedAt)` — Task 3 and Task 4 read `WithdrawalConfig.getMinimumWithdrawalAmount()` directly.

- [ ] **Step 1: Update the 5 existing `WithdrawalConfigRequest` call sites in `WithdrawalConfigServiceTest.java` for the new 3-arg record shape**

`WithdrawalConfigRequest` is about to gain a third component. Every existing 2-arg call site must add a third argument now, or the file won't compile once Task 2's implementation step lands. Preserve existing behavior (`null` — none of these tests care about the minimum) by editing each of the following 5 lines in `backend/src/test/java/com/plotchain/payments/WithdrawalConfigServiceTest.java`:

Line 52, inside `updateConfigSavesApprovalModeAndLimit()`:
```java
// old
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", new BigDecimal("25000.00")), ACTOR_ID);
// new
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", new BigDecimal("25000.00"), null), ACTOR_ID);
```

Line 68, inside `updateConfigClearsTheLimitWhenSwitchingToAlwaysManual()`:
```java
// old
        withdrawalConfigService.updateConfig(new WithdrawalConfigRequest("ALWAYS_MANUAL", null), ACTOR_ID);
// new
        withdrawalConfigService.updateConfig(new WithdrawalConfigRequest("ALWAYS_MANUAL", null, null), ACTOR_ID);
```

Line 79, inside `updateConfigRejectsAutoUnderLimitWithNoLimit()`:
```java
// old
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", null), ACTOR_ID))
// new
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", null, null), ACTOR_ID))
```

Line 86, inside `updateConfigRejectsAutoUnderLimitWithAZeroOrNegativeLimit()`:
```java
// old
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", BigDecimal.ZERO), ACTOR_ID))
// new
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", BigDecimal.ZERO, null), ACTOR_ID))
```

Line 97, inside `updateConfigRecordsAnAuditEntry()`:
```java
// old
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", new BigDecimal("25000.00")), ACTOR_ID);
// new
            new WithdrawalConfigRequest("AUTO_UNDER_LIMIT", new BigDecimal("25000.00"), null), ACTOR_ID);
```

- [ ] **Step 2: Add the failing round-trip test to `WithdrawalConfigServiceTest.java`**

Add this test method (e.g. right after `updateConfigRecordsAnAuditEntry()`, before the closing `}` of the class):

```java
    @Test
    void updateConfigSavesAndReturnsMinimumWithdrawalAmount() {
        WithdrawalConfig stored = new WithdrawalConfig();
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        WithdrawalConfigResponse response = withdrawalConfigService.updateConfig(
            new WithdrawalConfigRequest("ALWAYS_MANUAL", null, new BigDecimal("500.00")), ACTOR_ID);

        ArgumentCaptor<WithdrawalConfig> captor = ArgumentCaptor.forClass(WithdrawalConfig.class);
        verify(withdrawalConfigRepository).save(captor.capture());
        assertThat(captor.getValue().getMinimumWithdrawalAmount()).isEqualByComparingTo("500.00");
        assertThat(response.minimumWithdrawalAmount()).isEqualByComparingTo("500.00");
    }
```

- [ ] **Step 3: Add the failing round-trip tests to `WithdrawalConfigControllerTest.java`**

Add these two test methods (e.g. right after `putConfigReturns409ForAutoUnderLimitWithNoLimit()`, before the closing `}` of the class):

```java
    @Test
    void getConfigIncludesMinimumWithdrawalAmountWhenSet() throws Exception {
        WithdrawalConfig stored = new WithdrawalConfig();
        stored.setApprovalMode("ALWAYS_MANUAL");
        stored.setMinimumWithdrawalAmount(new java.math.BigDecimal("500.00"));
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        mockMvc.perform(get("/api/company/withdrawal")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.minimumWithdrawalAmount").value(500.00));
    }

    @Test
    void putConfigSavesAndReturnsTheUpdatedMinimumWithdrawalAmount() throws Exception {
        WithdrawalConfig stored = new WithdrawalConfig();
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));
        when(withdrawalConfigRepository.save(any())).thenReturn(stored);

        mockMvc.perform(put("/api/company/withdrawal")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content("{\"approvalMode\":\"ALWAYS_MANUAL\",\"minimumWithdrawalAmount\":0}"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.minimumWithdrawalAmount").value(0));
    }
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=WithdrawalConfigServiceTest,WithdrawalConfigControllerTest`
Expected: FAIL — compile error (`WithdrawalConfigRequest`/`WithdrawalConfigResponse` don't have a `minimumWithdrawalAmount` component yet, `WithdrawalConfig` has no `getMinimumWithdrawalAmount()`/`setMinimumWithdrawalAmount()`). This is the expected "red" state for a statically-typed change — the tests can't even compile until Step 5 lands the types.

- [ ] **Step 5: Implement — extend the entity**

In `backend/src/main/java/com/plotchain/payments/WithdrawalConfig.java`, add the field after `autoApproveLimit`:

```java
    @Column(name = "minimum_withdrawal_amount")
    private BigDecimal minimumWithdrawalAmount;
```

and the getter/setter after `getAutoApproveLimit()/setAutoApproveLimit()`:

```java
    public BigDecimal getMinimumWithdrawalAmount() { return minimumWithdrawalAmount; }
    public void setMinimumWithdrawalAmount(BigDecimal minimumWithdrawalAmount) { this.minimumWithdrawalAmount = minimumWithdrawalAmount; }
```

- [ ] **Step 6: Implement — extend the request DTO**

Replace the contents of `backend/src/main/java/com/plotchain/payments/WithdrawalConfigRequest.java`:

```java
package com.plotchain.payments;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

// autoApproveLimit has no @NotNull here -- it's only required when approvalMode is
// AUTO_UNDER_LIMIT, a cross-field rule WithdrawalConfigService validates (not expressible with
// a single-field Bean Validation annotation), same category as compensation's reward-tier
// contiguity check. minimumWithdrawalAmount is likewise unannotated and nullable -- per the
// wallet-withdrawal spec's Data model section, it round-trips with no default-substitution;
// null means "not yet set" (WithdrawalConfigService.isComplete() is false), a stored 0 is a
// deliberate "no minimum" policy, distinct from never having been set.
public record WithdrawalConfigRequest(
    @NotBlank @Pattern(regexp = "AUTO_UNDER_LIMIT|ALWAYS_MANUAL") String approvalMode,
    BigDecimal autoApproveLimit,
    BigDecimal minimumWithdrawalAmount
) {}
```

- [ ] **Step 7: Implement — extend the response DTO**

Replace the contents of `backend/src/main/java/com/plotchain/payments/WithdrawalConfigResponse.java`:

```java
package com.plotchain.payments;

import java.math.BigDecimal;
import java.time.Instant;

public record WithdrawalConfigResponse(
    String approvalMode,
    BigDecimal autoApproveLimit,
    BigDecimal minimumWithdrawalAmount,
    Instant updatedAt
) {}
```

- [ ] **Step 8: Implement — round-trip the field through the service**

In `backend/src/main/java/com/plotchain/payments/WithdrawalConfigService.java`, update `updateConfig()`:

```java
        config.setApprovalMode(request.approvalMode());
        // ALWAYS_MANUAL ignores the limit entirely -- cleared rather than left stale, so a
        // later switch back to AUTO_UNDER_LIMIT can't silently resurrect an old value.
        config.setAutoApproveLimit("ALWAYS_MANUAL".equals(request.approvalMode()) ? null : request.autoApproveLimit());
        config.setMinimumWithdrawalAmount(request.minimumWithdrawalAmount());
        config.setUpdatedAt(Instant.now());
```

and `toResponse()`:

```java
    private static WithdrawalConfigResponse toResponse(WithdrawalConfig config) {
        return new WithdrawalConfigResponse(
            config.getApprovalMode(),
            config.getAutoApproveLimit(),
            config.getMinimumWithdrawalAmount(),
            config.getUpdatedAt()
        );
    }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `cd backend && mvn -q test -Dtest=WithdrawalConfigServiceTest,WithdrawalConfigControllerTest`
Expected: PASS — all existing tests plus the 3 new ones (Steps 2 and 3) green.

- [ ] **Step 10: Commit**

```bash
git add backend/src/main/java/com/plotchain/payments/WithdrawalConfig.java \
        backend/src/main/java/com/plotchain/payments/WithdrawalConfigRequest.java \
        backend/src/main/java/com/plotchain/payments/WithdrawalConfigResponse.java \
        backend/src/main/java/com/plotchain/payments/WithdrawalConfigService.java \
        backend/src/test/java/com/plotchain/payments/WithdrawalConfigServiceTest.java \
        backend/src/test/java/com/plotchain/payments/WithdrawalConfigControllerTest.java
git commit -m "feat(payments): round-trip minimumWithdrawalAmount through withdrawal config"
```

---

## Task 3: `WithdrawalConfigService.isComplete()`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/payments/WithdrawalConfigService.java`
- Test: `backend/src/test/java/com/plotchain/payments/WithdrawalConfigServiceTest.java`

**Interfaces:**
- Consumes: `WithdrawalConfig.getMinimumWithdrawalAmount()` (Task 2).
- Produces: `WithdrawalConfigService.isComplete(): boolean` — Task 4's `SetupStateService` calls this directly.

- [ ] **Step 1: Write the failing tests**

Add these three test methods to `backend/src/test/java/com/plotchain/payments/WithdrawalConfigServiceTest.java` (e.g. after the Task 2 round-trip test):

```java
    @Test
    void isCompleteIsFalseWhenMinimumWithdrawalAmountHasNeverBeenSet() {
        WithdrawalConfig stored = new WithdrawalConfig();
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        assertThat(withdrawalConfigService.isComplete()).isFalse();
    }

    @Test
    void isCompleteIsTrueWhenMinimumWithdrawalAmountIsSet() {
        WithdrawalConfig stored = new WithdrawalConfig();
        stored.setMinimumWithdrawalAmount(new BigDecimal("500.00"));
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        assertThat(withdrawalConfigService.isComplete()).isTrue();
    }

    @Test
    void isCompleteIsTrueWhenMinimumWithdrawalAmountIsExplicitlyZero() {
        WithdrawalConfig stored = new WithdrawalConfig();
        stored.setMinimumWithdrawalAmount(BigDecimal.ZERO);
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(stored));

        assertThat(withdrawalConfigService.isComplete()).isTrue();
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=WithdrawalConfigServiceTest`
Expected: FAIL — compile error, `WithdrawalConfigService` has no `isComplete()` method yet.

- [ ] **Step 3: Implement `isComplete()`**

In `backend/src/main/java/com/plotchain/payments/WithdrawalConfigService.java`, add this method (e.g. right after `updateConfig()`, before the private `validate()` helper):

```java
    // Go-Live-gating field (Decisions 6 and 18, wallet-withdrawal spec) -- matches
    // PayoutBankAccountService.isComplete()'s exact pattern, a null-check instead of a
    // blank-string check since this field is numeric. false while never set (the fresh
    // V9-seeded row's state); true once set, including to exactly 0 -- an explicit "no
    // minimum" is still a completed configuration, distinct from never having been set.
    public boolean isComplete() {
        return currentConfig().getMinimumWithdrawalAmount() != null;
    }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn -q test -Dtest=WithdrawalConfigServiceTest`
Expected: PASS — all tests in the class, including the 3 new ones, green.

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/payments/WithdrawalConfigService.java \
        backend/src/test/java/com/plotchain/payments/WithdrawalConfigServiceTest.java
git commit -m "feat(payments): add WithdrawalConfigService.isComplete()"
```

---

## Task 4: Wire `withdrawalConfigService.isComplete()` into `SetupStateService`'s `paymentsKyc` step

**Files:**
- Modify: `backend/src/main/java/com/plotchain/company/SetupStateService.java`
- Modify: `backend/src/test/java/com/plotchain/company/SetupStateServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/auth/AuthServiceTest.java`
- Modify: `backend/src/test/java/com/plotchain/auth/AuthControllerTest.java`

**Interfaces:**
- Consumes: `WithdrawalConfigService.isComplete()` (Task 3).
- Produces: `SetupStateService`'s constructor grows a 6th business-service parameter, `WithdrawalConfigService withdrawalConfigService`, inserted immediately after `payoutBankAccountService` and before `projectService`: `SetupStateService(SetupStateRepository, CompanyProfileService, CompanyBrandingService, CompensationPlanService, PaymentConfigService, PayoutBankAccountService, WithdrawalConfigService, ProjectService)`. Every direct instantiation of `SetupStateService` elsewhere in the codebase must be updated to this new arity — confirmed via `grep -rn "new SetupStateService(" backend/src` to be exactly the 3 call sites this task touches (`SetupStateServiceTest`, `AuthServiceTest`, `AuthControllerTest`); `SetupStateControllerTest` uses Spring's real bean graph and needs no change.

- [ ] **Step 1: Write the failing tests in `SetupStateServiceTest.java`**

First, add the three new imports (alongside the existing `com.plotchain.payments.*` imports):

```java
import com.plotchain.payments.WithdrawalConfig;
import com.plotchain.payments.WithdrawalConfigRepository;
import com.plotchain.payments.WithdrawalConfigService;
```

Add the new mock field (alongside the other `@Mock ...Repository` fields, e.g. right after `@Mock PayoutBankAccountRepository payoutBankAccountRepository;`):

```java
    @Mock WithdrawalConfigRepository withdrawalConfigRepository;
```

Update the `setUp()` constructor call — insert a `new WithdrawalConfigService(withdrawalConfigRepository, settingsAuditService)` argument between the `PayoutBankAccountService` and `ProjectService` arguments:

```java
// old
        setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            new CompensationPlanService(
                compensationPlanVersionRepository, royaltyBonusRateRepository, rewardTierRepository, rankTierRepository,
                settingsAuditService, associateRepository),
            new PaymentConfigService(paymentConfigRepository,
                new SecretsEncryptionService("test-secrets-key-at-least-32-bytes-long-for-aes"), settingsAuditService),
            new PayoutBankAccountService(payoutBankAccountRepository, settingsAuditService),
            new ProjectService(projectRepository, plotRepository, settingsAuditService));
// new
        setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            new CompensationPlanService(
                compensationPlanVersionRepository, royaltyBonusRateRepository, rewardTierRepository, rankTierRepository,
                settingsAuditService, associateRepository),
            new PaymentConfigService(paymentConfigRepository,
                new SecretsEncryptionService("test-secrets-key-at-least-32-bytes-long-for-aes"), settingsAuditService),
            new PayoutBankAccountService(payoutBankAccountRepository, settingsAuditService),
            new WithdrawalConfigService(withdrawalConfigRepository, settingsAuditService),
            new ProjectService(projectRepository, plotRepository, settingsAuditService));
```

Add a matching lenient default stub in `setUp()` (right after the existing `payoutBankAccountRepository` lenient stub):

```java
        // withdrawal_config's fresh-seeded state is blank (null minimumWithdrawalAmount) --
        // same "default incomplete" posture as the payment/bank-account stubs above.
        lenient().when(withdrawalConfigRepository.findAll()).thenReturn(List.of(new WithdrawalConfig()));
```

Update `stubPaymentsKycComplete()` so the three existing tests that rely on it for a fully-complete Payments & KYC step (`canGoLiveIsTrueOnceCompanyProfileCompensationAndPaymentsKycAreAllComplete`, `reviewLaunchStepBecomesCompleteOnceLaunched`, and the test it's directly asserting on) keep passing once the third clause is added:

```java
// old (end of method)
        PayoutBankAccount account = new PayoutBankAccount();
        account.setBankName("HDFC Bank");
        account.setAccountHolder("Plotchain Estates Pvt Ltd");
        account.setAccountNumber("50100123456789");
        account.setIfscCode("HDFC0001234");
        account.setAccountType("CURRENT");
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(account));
    }
// new (end of method)
        PayoutBankAccount account = new PayoutBankAccount();
        account.setBankName("HDFC Bank");
        account.setAccountHolder("Plotchain Estates Pvt Ltd");
        account.setAccountNumber("50100123456789");
        account.setIfscCode("HDFC0001234");
        account.setAccountType("CURRENT");
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(account));

        WithdrawalConfig withdrawalConfig = new WithdrawalConfig();
        withdrawalConfig.setMinimumWithdrawalAmount(new BigDecimal("500.00"));
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(withdrawalConfig));
    }
```

Finally, add two new test methods (e.g. right after `paymentsKycStepIsCompleteWhenPaymentConfigAndPayoutBankAccountAreBothComplete()`):

```java
    @Test
    void paymentsKycStepStaysIncompleteWhenMinimumWithdrawalAmountIsNotSetEvenIfPaymentConfigAndBankAccountAreComplete() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();

        PaymentConfig payment = new PaymentConfig();
        payment.setGateway("RAZORPAY");
        payment.setCredentialsEncrypted("encrypted-value");
        when(paymentConfigRepository.findAll()).thenReturn(List.of(payment));

        PayoutBankAccount account = new PayoutBankAccount();
        account.setBankName("HDFC Bank");
        account.setAccountHolder("Plotchain Estates Pvt Ltd");
        account.setAccountNumber("50100123456789");
        account.setIfscCode("HDFC0001234");
        account.setAccountType("CURRENT");
        when(payoutBankAccountRepository.findAll()).thenReturn(List.of(account));
        // withdrawalConfigRepository left at setUp()'s default -- blank WithdrawalConfig, null
        // minimumWithdrawalAmount -- proving the third clause independently gates the step even
        // when the other two are complete.

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("paymentsKyc")).findFirst().orElseThrow().complete())
            .isFalse();
    }

    @Test
    void paymentsKycStepIsCompleteWhenMinimumWithdrawalAmountIsExplicitlySetToZero() {
        when(setupStateRepository.findAll()).thenReturn(List.of(unlaunchedState()));
        stubCompanyProfile(new CompanyProfile());
        stubCompanyBranding(blankBranding());
        stubCompensationIncomplete();
        stubPaymentsKycComplete();
        // Override stubPaymentsKycComplete()'s non-zero minimum with an explicit zero -- proves
        // isComplete() is a null-check, not a truthiness check.
        WithdrawalConfig zeroMinimum = new WithdrawalConfig();
        zeroMinimum.setMinimumWithdrawalAmount(BigDecimal.ZERO);
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(zeroMinimum));

        SetupStateResponse response = setupStateService.getSetupState();

        assertThat(response.steps().stream()
            .filter(s -> s.key().equals("paymentsKyc")).findFirst().orElseThrow().complete())
            .isTrue();
    }
```

- [ ] **Step 2: Fix the two other direct `SetupStateService` construction sites so the module still compiles**

These tests never exercise `getSetupState()`/`isStepComplete()` (only `isLaunched()`, which doesn't call `isStepComplete()` at all), so they already pass `null` for the trailing business-service arguments — just extend the null list by one and update the explanatory comment. Both edits are identical in shape.

In `backend/src/test/java/com/plotchain/auth/AuthServiceTest.java`:

```java
// old
        setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            // Never invoked here: these tests only exercise isLaunched(), which doesn't touch
            // compensationPlanService/paymentConfigService/payoutBankAccountService/projectService.
            null, null, null, null);
// new
        setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            // Never invoked here: these tests only exercise isLaunched(), which doesn't touch
            // compensationPlanService/paymentConfigService/payoutBankAccountService/
            // withdrawalConfigService/projectService.
            null, null, null, null, null);
```

In `backend/src/test/java/com/plotchain/auth/AuthControllerTest.java`, the identical edit:

```java
// old
        SetupStateService setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            // Never invoked here: these tests only exercise isLaunched(), which doesn't touch
            // compensationPlanService/paymentConfigService/payoutBankAccountService/projectService.
            null, null, null, null);
// new
        SetupStateService setupStateService = new SetupStateService(
            setupStateRepository,
            new CompanyProfileService(companyProfileRepository, settingsAuditService),
            new CompanyBrandingService(companyBrandingRepository,
                new CompanyProfileService(companyProfileRepository, settingsAuditService), settingsAuditService),
            // Never invoked here: these tests only exercise isLaunched(), which doesn't touch
            // compensationPlanService/paymentConfigService/payoutBankAccountService/
            // withdrawalConfigService/projectService.
            null, null, null, null, null);
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd backend && mvn -q test -Dtest=SetupStateServiceTest,AuthServiceTest,AuthControllerTest`
Expected: FAIL — compile error, `SetupStateService`'s constructor doesn't accept a `WithdrawalConfigService` argument yet (still 7-arg, tests now pass 8).

- [ ] **Step 4: Implement — wire the dependency into `SetupStateService`**

Replace the contents of `backend/src/main/java/com/plotchain/company/SetupStateService.java`:

```java
package com.plotchain.company;

import com.plotchain.compensation.CompensationPlanService;
import com.plotchain.payments.PaymentConfigService;
import com.plotchain.payments.PayoutBankAccountService;
import com.plotchain.payments.WithdrawalConfigService;
import com.plotchain.projects.ProjectService;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;

@Service
public class SetupStateService {

    // Order and required-ness match the master roadmap's 6-step wizard and its Step 6 "canGoLive"
    // gate (Company Profile + Compensation + Payments & KYC).
    private static final List<StepDefinition> STEP_DEFINITIONS = List.of(
        new StepDefinition(1, "companyProfile", true),
        new StepDefinition(2, "branding", false),
        new StepDefinition(3, "compensation", true),
        new StepDefinition(4, "projects", false),
        new StepDefinition(5, "paymentsKyc", true),
        new StepDefinition(6, "reviewLaunch", false)
    );

    private final SetupStateRepository setupStateRepository;
    private final CompanyProfileService companyProfileService;
    private final CompanyBrandingService companyBrandingService;
    private final CompensationPlanService compensationPlanService;
    private final PaymentConfigService paymentConfigService;
    private final PayoutBankAccountService payoutBankAccountService;
    private final WithdrawalConfigService withdrawalConfigService;
    private final ProjectService projectService;

    public SetupStateService(SetupStateRepository setupStateRepository,
                              CompanyProfileService companyProfileService,
                              CompanyBrandingService companyBrandingService,
                              CompensationPlanService compensationPlanService,
                              PaymentConfigService paymentConfigService,
                              PayoutBankAccountService payoutBankAccountService,
                              WithdrawalConfigService withdrawalConfigService,
                              ProjectService projectService) {
        this.setupStateRepository = setupStateRepository;
        this.companyProfileService = companyProfileService;
        this.companyBrandingService = companyBrandingService;
        this.compensationPlanService = compensationPlanService;
        this.paymentConfigService = paymentConfigService;
        this.payoutBankAccountService = payoutBankAccountService;
        this.withdrawalConfigService = withdrawalConfigService;
        this.projectService = projectService;
    }

    public SetupStateResponse getSetupState() {
        SetupState state = currentState();
        List<SetupStateResponse.StepStatus> steps = STEP_DEFINITIONS.stream()
            .map(def -> {
                boolean complete = isStepComplete(def.key());
                return new SetupStateResponse.StepStatus(def.number(), def.key(), complete, def.required(), complete ? 100 : 0);
            })
            .toList();
        boolean canGoLive = steps.stream()
            .filter(SetupStateResponse.StepStatus::required)
            .allMatch(SetupStateResponse.StepStatus::complete);
        return new SetupStateResponse(steps, canGoLive, state.getLaunchedAt());
    }

    public boolean isLaunched() {
        return currentState().getLaunchedAt() != null;
    }

    public SetupStateResponse launch() {
        SetupStateResponse current = getSetupState();
        if (!current.canGoLive()) {
            List<String> incomplete = current.steps().stream()
                .filter(s -> s.required() && !s.complete())
                .map(SetupStateResponse.StepStatus::key)
                .toList();
            throw new LaunchBlockedException(incomplete);
        }
        SetupState state = currentState();
        Instant now = Instant.now();
        state.setTermsAcceptedAt(now);
        state.setLaunchedAt(now);
        state.setUpdatedAt(now);
        setupStateRepository.save(state);
        return getSetupState();
    }

    private boolean isStepComplete(String key) {
        return switch (key) {
            case "companyProfile" -> companyProfileService.isComplete();
            case "branding" -> companyBrandingService.isComplete();
            case "compensation" -> compensationPlanService.isComplete();
            case "paymentsKyc" -> paymentConfigService.isComplete() && payoutBankAccountService.isComplete()
                && withdrawalConfigService.isComplete();
            case "projects" -> projectService.isComplete();
            case "reviewLaunch" -> isLaunched();
            default -> false;
        };
    }

    private SetupState currentState() {
        return setupStateRepository.findAll().stream().findFirst()
            .orElseThrow(() -> new IllegalStateException("setup_state row missing - V5 migration seeds it"));
    }

    private record StepDefinition(int number, String key, boolean required) {}
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && mvn -q test -Dtest=SetupStateServiceTest,AuthServiceTest,AuthControllerTest`
Expected: PASS — every existing test in all three classes (including `canGoLiveIsTrueOnceCompanyProfileCompensationAndPaymentsKycAreAllComplete` and `reviewLaunchStepBecomesCompleteOnceLaunched`, which depend on the updated `stubPaymentsKycComplete()` helper) plus the 2 new tests, green.

- [ ] **Step 6: Run the full backend suite once as a regression check**

Run: `cd backend && mvn -q test`
Expected: PASS (aside from the pre-existing, unrelated JDK21/25 Mockito environment noise documented in this session's memory — not caused by this change). In particular confirm `SetupStateControllerTest` still passes unmodified — it wires the real Spring bean graph, so a compile-clean `SetupStateService` is all it needs.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/company/SetupStateService.java \
        backend/src/test/java/com/plotchain/company/SetupStateServiceTest.java \
        backend/src/test/java/com/plotchain/auth/AuthServiceTest.java \
        backend/src/test/java/com/plotchain/auth/AuthControllerTest.java
git commit -m "feat(company): gate paymentsKyc setup step on withdrawalConfigService.isComplete()"
```

---

## Test Strategy Summary

- **Unit level** (`WithdrawalConfigServiceTest`): round-trip of the new field through `updateConfig()`/`getConfig()`; `isComplete()` false-when-null, true-when-set, true-when-explicitly-zero (the load-bearing null-vs-truthiness distinction).
- **Controller level** (`WithdrawalConfigControllerTest`): the existing `GET`/`PUT /api/company/withdrawal` endpoints correctly surface and persist `minimumWithdrawalAmount` end-to-end through MockMvc + real JWT auth, no new route.
- **Integration level** (`SetupStateServiceTest`): the `paymentsKyc` step is independently gated by all three sub-checks — proven by a case where payment config and bank account are complete but the minimum is unset (step must stay incomplete), and a case where the minimum is explicitly `0` (step must be complete). The two pre-existing tests that assert full Go-Live readiness (`canGoLiveIsTrueOnceCompanyProfileCompensationAndPaymentsKycAreAllComplete`, `reviewLaunchStepBecomesCompleteOnceLaunched`) continue to pass because `stubPaymentsKycComplete()` is updated once, centrally.
- **Compile-safety regression** (`AuthServiceTest`, `AuthControllerTest`): both direct `SetupStateService` constructions elsewhere in the codebase are updated in lockstep so the module keeps compiling; neither test's actual behavior (`isLaunched()` only) is affected.
- **Migration safety**: verified indirectly — any `@SpringBootTest` (Task 1's `WithdrawalConfigControllerTest` run, and Task 4's full-suite run) boots Flyway against the test database, so a broken migration file surfaces immediately as a context-load failure rather than silently passing.

## Follow-up — not part of this unit

The Payments & KYC setup-wizard **frontend** (`payments-kyc.service.ts`, already built in an earlier spec) has no form field for `minimum_withdrawal_amount` yet. Once this unit merges, an admin has no UI path to satisfy the new `paymentsKyc` Go-Live clause — `PUT /api/company/withdrawal` is reachable, but only via direct API call, not through the existing wizard screen. This is a small touch-up to an already-shipped screen (not a PRD-named screen in its own right, so spec-slicer correctly did not create a dedicated unit for it — see the source unit-queue file's Excluded section). Whoever owns that screen should add the field before Go-Live is realistically achievable through the UI.
