# Wallet/Withdrawal Unit 5: Admin Submits a Withdrawal Request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `POST /api/admin/withdrawals` (ADMIN-only) — an admin submits a withdrawal request on a named associate's behalf, atomically debiting the associate's wallet at request-creation time and either auto-approving the request or leaving it queued for later decision.

**Architecture:** A new top-level `com.plotchain.withdrawal` package (sibling to `wallet`/`payments`, following this codebase's one-package-per-domain convention) gets a `WithdrawalRequest` entity/enum/repository, a `WithdrawalService` that runs the full guard-clause chain from the spec (associate lookup → suspended → KYC → minimum amount → atomic debit → auto-approval decision → save → audit log), and a thin `WithdrawalController`. `WalletRepository` (existing, `wallet` package) gains one new atomic `@Modifying @Query` method, `debitIfSufficient`, as a sibling to unit 1's `creditBalance`. `WithdrawalConfigService` (existing, `payments` package, merged in unit 3) is read via its existing public `getConfig()` method — no changes to the `payments` package are needed. This unit builds submission only; the list/decision/disburse endpoints (units 6-8) will read/modify the same `withdrawal_request` rows later, so the entity and `WithdrawalRequestStatus` enum are built with the full four-value state machine from day one even though this unit only ever writes `REQUESTED` or auto-approved `APPROVED` rows.

**Tech Stack:** Spring Boot, Spring Data JPA, Flyway (PostgreSQL in prod, H2 MODE=PostgreSQL in the `test` profile), Spring Security (JWT bearer + `hasAuthority("ADMIN")`), JUnit 5 + Mockito + AssertJ + MockMvc.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` (Decisions 5, 6, 7, 9, 10, 11, 12, 14, 15; Data model; Flow "Submit a withdrawal request"; Error handling table). Unit definition: `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md`, section "### 5."

## Global Constraints

- Next available Flyway migration version is **V22** (`V21__withdrawal_config_minimum.sql` is the latest on disk, from unit 3).
- New Java package: `com.plotchain.withdrawal` (top-level, sibling to `wallet`/`payments`/`income` — not nested under `wallet`), matching the units file's own file-overlap-check language treating `wallet` and `withdrawal` as distinct domains.
- Funds are debited **at request-creation time** (this endpoint), not at approval/disbursement (Decision 10) — `WalletRepository.debitIfSufficient` is the only wallet mutation this unit performs.
- `WithdrawalRequestStatus` must carry all four values (`REQUESTED`, `APPROVED`, `REJECTED`, `DISBURSED`) even though this unit only ever writes `REQUESTED` or `APPROVED` — units 6-9 depend on the other two already existing.
- `WithdrawalRequestRepository` gets **no query methods beyond what `JpaRepository` provides** in this unit — `search(...)` is unit 6's addition (units file, Excluded section: "not a standalone repository-query unit").
- Reuse, do not duplicate: `AssociateNotFoundException` (`com.plotchain.associate`, already mapped to 404 by the existing app-wide `DashboardExceptionHandler`) and `WithdrawalConfigService.getConfig()` (`com.plotchain.payments`, merged unit 3) are consumed as-is — no changes to `associate` or `payments` package files in this unit.
- Test commands run from the `backend/` directory (`cd backend && mvn test -Dtest=<ClassName>`). Per project memory, a full `mvn test` run may show ~55 spurious Mockito failures from a local JDK21/25 mismatch unrelated to any code in this repo — run scoped `-Dtest=<ClassName>` per task instead of a full-suite run, and don't treat pre-existing unrelated failures as a regression this plan introduced.
- All new BigDecimal amount comparisons use `.compareTo(...)`, never `.equals(...)` (scale-sensitive) — matches every existing money comparison in this codebase (e.g. `WalletRepository.creditBalance`'s callers, `WithdrawalConfigService.validate`).

## A note on `AssociateSuspendedException` naming (flag for reviewer)

`com.plotchain.auth.AssociateSuspendedException` **already exists**, but it is not reusable here: it is a no-arg exception thrown by `AuthService` when a `SUSPENDED` associate tries to **log in themselves**, mapped by `AuthExceptionHandler` to **403 Forbidden**, with a fixed self-addressed message ("Your account has been suspended. Please contact your administrator."). This unit needs a **409 Conflict** thrown when an **admin submits a request on behalf of** a suspended associate — different actor, different HTTP status, different message, and the source spec's own Error handling table lists it as "(new)". This plan creates a **second class with the same simple name** (`AssociateSuspendedException`) in the new `com.plotchain.withdrawal` package — legal Java (distinct FQCN, different package) and matches the spec's literal naming, but flagged here explicitly since it's a judgment call, not a mechanical one. Task 4 below documents this in the class's own comment so nobody later "deduplicates" the two by mistake.

---

## Task 1: Migration — create the `withdrawal_request` table

**Files:**
- Create: `backend/src/main/resources/db/migration/V22__withdrawal_request.sql`

**Interfaces:**
- Produces: a `withdrawal_request` table with columns `id`, `associate_id`, `amount`, `status`, `reason`, `bank_reference`, `requested_at`, `decided_at`, `disbursed_at`, matching the Data model section of the spec exactly. Task 3's entity maps onto this schema.

- [ ] **Step 1: Write the migration file**

```sql
-- withdrawal_request: the runtime request/approval/disbursement lifecycle. Admin submits on an
-- associate's behalf (role-capability spec: associates have no self-serve write action here).
-- Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
-- Data model section). Full four-value status check constraint is included even though unit 5
-- (this migration's own unit) only ever writes REQUESTED or APPROVED rows -- units 6-9 need
-- REJECTED/DISBURSED to already be valid values.
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
```

- [ ] **Step 2: Verify the migration applies cleanly against the test datasource**

Run: `cd backend && mvn test -Dtest=WalletRepositoryTest`
Expected: PASS (this test's `@DataJpaTest` context load runs every migration in `classpath:db/migration`, including the new V22 file — a syntax error here would fail context startup, not just this test's assertions). This is a smoke check that the SQL is valid; Task 3 adds a dedicated test that actually exercises the new table's constraints.

- [ ] **Step 3: Commit**

```bash
git add backend/src/main/resources/db/migration/V22__withdrawal_request.sql
git commit -m "feat(withdrawal): add withdrawal_request table migration"
```

---

## Task 2: `WalletRepository.debitIfSufficient` — atomic conditional debit

**Files:**
- Modify: `backend/src/main/java/com/plotchain/wallet/WalletRepository.java`
- Test: `backend/src/test/java/com/plotchain/wallet/WalletRepositoryTest.java` (append to existing file — do not remove the existing `creditBalance` tests)

**Interfaces:**
- Consumes: nothing new (sibling to the existing `creditBalance` method on the same repository interface).
- Produces: `WalletRepository.debitIfSufficient(UUID associateId, BigDecimal amount): int` — Task 5's `WithdrawalService` calls this directly.

- [ ] **Step 1: Write the failing tests**

Append to `backend/src/test/java/com/plotchain/wallet/WalletRepositoryTest.java` (inside the existing `WalletRepositoryTest` class, after the last `creditBalance` test):

```java
    @Test
    void debitIfSufficientDecrementsAnExistingWalletsBalanceAndReturnsOneAffectedRowWhenBalanceCovers() {
        Associate associate = seedAssociate();
        Wallet wallet = Wallet.zero(associate.getId());
        entityManager.persist(wallet);
        walletRepository.creditBalance(associate.getId(), new BigDecimal("100.00"));
        entityManager.flush();
        entityManager.clear();

        int affected = walletRepository.debitIfSufficient(associate.getId(), new BigDecimal("40.00"));
        entityManager.flush();
        entityManager.clear();

        assertThat(affected).isEqualTo(1);
        Wallet reread = walletRepository.findById(associate.getId()).orElseThrow();
        assertThat(reread.getBalance()).isEqualByComparingTo("60.00");
    }

    @Test
    void debitIfSufficientReturnsZeroAndLeavesTheBalanceUnchangedWhenBalanceIsTooLow() {
        Associate associate = seedAssociate();
        entityManager.persist(Wallet.zero(associate.getId()));
        walletRepository.creditBalance(associate.getId(), new BigDecimal("10.00"));
        entityManager.flush();
        entityManager.clear();

        int affected = walletRepository.debitIfSufficient(associate.getId(), new BigDecimal("10.01"));
        entityManager.flush();
        entityManager.clear();

        assertThat(affected).isZero();
        Wallet reread = walletRepository.findById(associate.getId()).orElseThrow();
        assertThat(reread.getBalance()).isEqualByComparingTo("10.00");
    }

    @Test
    void debitIfSufficientReturnsZeroWhenNoWalletRowExistsAtAll() {
        UUID neverCreditedAssociateId = UUID.randomUUID();

        int affected = walletRepository.debitIfSufficient(neverCreditedAssociateId, new BigDecimal("0.01"));

        assertThat(affected).isZero();
        assertThat(walletRepository.findById(neverCreditedAssociateId)).isEmpty();
    }
```

- [ ] **Step 2: Run tests to verify they fail (method doesn't exist yet)**

Run: `cd backend && mvn test -Dtest=WalletRepositoryTest`
Expected: FAIL — compile error, `debitIfSufficient` is not a method on `WalletRepository`.

- [ ] **Step 3: Add the method to `WalletRepository`**

Add to `backend/src/main/java/com/plotchain/wallet/WalletRepository.java`, directly below the existing `creditBalance` method:

```java
    // Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // Decision 5, Decision 10): atomic conditional UPDATE, sibling to creditBalance above and for
    // the same reason -- Wallet has no @Version column, so a plain find-then-check-then-save round
    // trip would race two concurrent withdrawal requests against the same balance. The WHERE
    // clause folds the sufficiency check into the UPDATE itself: Postgres's row-level write lock
    // makes the check-and-decrement atomic. Returns 0 affected rows in two cases the caller must
    // treat identically -- balance too low, or no Wallet row exists at all yet (an associate with
    // zero credited income has an implicit balance of zero, and "0 >= amount" is false for any
    // positive amount) -- so WithdrawalService needs no separate "wallet doesn't exist" branch.
    @Modifying
    @Query("UPDATE Wallet w SET w.balance = w.balance - :amount WHERE w.associateId = :associateId AND w.balance >= :amount")
    int debitIfSufficient(@Param("associateId") UUID associateId, @Param("amount") BigDecimal amount);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=WalletRepositoryTest`
Expected: PASS (all `creditBalance` tests plus the three new `debitIfSufficient` tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/wallet/WalletRepository.java backend/src/test/java/com/plotchain/wallet/WalletRepositoryTest.java
git commit -m "feat(wallet): add atomic debitIfSufficient to WalletRepository"
```

---

## Task 3: `WithdrawalRequestStatus` enum, `WithdrawalRequest` entity, `WithdrawalRequestRepository`

**Files:**
- Create: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestStatus.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequest.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalRequestRepositoryTest.java`

**Interfaces:**
- Consumes: `withdrawal_request` table from Task 1.
- Produces: `WithdrawalRequest` (entity, getters/setters), `WithdrawalRequestStatus` enum (`REQUESTED`, `APPROVED`, `REJECTED`, `DISBURSED`), `WithdrawalRequestRepository extends JpaRepository<WithdrawalRequest, UUID>`. Task 5's `WithdrawalService` constructs/saves `WithdrawalRequest` rows and reads `WithdrawalRequestStatus` values.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/withdrawal/WithdrawalRequestRepositoryTest.java`:

```java
package com.plotchain.withdrawal;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Wallet/withdrawal unit 5 -- proves WithdrawalRequest maps correctly onto
// V22__withdrawal_request.sql's real H2 (MODE=PostgreSQL) test schema, including its CHECK
// constraints, the same way WalletRepositoryTest proves creditBalance/debitIfSufficient against
// the real wallet table (a Mockito mock can't exercise a database CHECK constraint).
@DataJpaTest
@ActiveProfiles("test")
class WithdrawalRequestRepositoryTest {

    @Autowired WithdrawalRequestRepository withdrawalRequestRepository;
    @Autowired TestEntityManager entityManager;

    // ADMIN role, no rankId -- chk_associate_rank_required only requires rank_id for ASSOCIATE,
    // same shortcut WalletRepositoryTest's seedAssociate already takes.
    private Associate seedAssociate() {
        Associate associate = new Associate();
        UUID id = UUID.randomUUID();
        associate.setId(id);
        associate.setName("Test Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("u-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        entityManager.persist(associate);
        return associate;
    }

    private WithdrawalRequest requestFor(UUID associateId, BigDecimal amount, WithdrawalRequestStatus status) {
        WithdrawalRequest request = new WithdrawalRequest();
        request.setId(UUID.randomUUID());
        request.setAssociateId(associateId);
        request.setAmount(amount);
        request.setStatus(status);
        request.setRequestedAt(Instant.now());
        return request;
    }

    @Test
    void savesAndReloadsARequestedWithdrawalRequest() {
        Associate associate = seedAssociate();
        WithdrawalRequest request = requestFor(associate.getId(), new BigDecimal("1000.00"), WithdrawalRequestStatus.REQUESTED);

        withdrawalRequestRepository.save(request);
        entityManager.flush();
        entityManager.clear();

        WithdrawalRequest reread = withdrawalRequestRepository.findById(request.getId()).orElseThrow();
        assertThat(reread.getAssociateId()).isEqualTo(associate.getId());
        assertThat(reread.getAmount()).isEqualByComparingTo("1000.00");
        assertThat(reread.getStatus()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
        assertThat(reread.getDecidedAt()).isNull();
        assertThat(reread.getDisbursedAt()).isNull();
    }

    @Test
    void savesAnAutoApprovedRequestWithADecidedAtTimestamp() {
        Associate associate = seedAssociate();
        WithdrawalRequest request = requestFor(associate.getId(), new BigDecimal("500.00"), WithdrawalRequestStatus.APPROVED);
        request.setDecidedAt(Instant.now());

        withdrawalRequestRepository.save(request);
        entityManager.flush();
        entityManager.clear();

        WithdrawalRequest reread = withdrawalRequestRepository.findById(request.getId()).orElseThrow();
        assertThat(reread.getStatus()).isEqualTo(WithdrawalRequestStatus.APPROVED);
        assertThat(reread.getDecidedAt()).isNotNull();
    }

    @Test
    void rejectsAZeroAmountViaTheDatabaseCheckConstraint() {
        Associate associate = seedAssociate();
        WithdrawalRequest request = requestFor(associate.getId(), BigDecimal.ZERO, WithdrawalRequestStatus.REQUESTED);

        assertThatThrownBy(() -> {
            withdrawalRequestRepository.save(request);
            entityManager.flush();
        }).isInstanceOf(DataIntegrityViolationException.class);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=WithdrawalRequestRepositoryTest`
Expected: FAIL — compile error, `WithdrawalRequest`/`WithdrawalRequestStatus`/`WithdrawalRequestRepository` don't exist yet.

- [ ] **Step 3: Write the enum**

Create `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestStatus.java`:

```java
package com.plotchain.withdrawal;

// Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Data model section): the full four-value state machine, even though this unit (5) only ever
// creates rows in REQUESTED or auto-approved APPROVED. REJECTED (units 7's reject/cancel) and
// DISBURSED (unit 8) are built later, but the enum -- and the withdrawal_request table's own
// chk_withdrawal_request_status CHECK constraint (V22) -- carry all four from day one so later
// units don't need a schema change just to add a status value.
public enum WithdrawalRequestStatus {
    REQUESTED, APPROVED, REJECTED, DISBURSED
}
```

- [ ] **Step 4: Write the entity**

Create `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequest.java`:

```java
package com.plotchain.withdrawal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "withdrawal_request")
public class WithdrawalRequest {

    @Id
    private UUID id;

    @Column(name = "associate_id", nullable = false)
    private UUID associateId;

    @Column(nullable = false)
    private BigDecimal amount;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private WithdrawalRequestStatus status;

    private String reason;

    @Column(name = "bank_reference")
    private String bankReference;

    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;

    @Column(name = "decided_at")
    private Instant decidedAt;

    @Column(name = "disbursed_at")
    private Instant disbursedAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }
    public UUID getAssociateId() { return associateId; }
    public void setAssociateId(UUID associateId) { this.associateId = associateId; }
    public BigDecimal getAmount() { return amount; }
    public void setAmount(BigDecimal amount) { this.amount = amount; }
    public WithdrawalRequestStatus getStatus() { return status; }
    public void setStatus(WithdrawalRequestStatus status) { this.status = status; }
    public String getReason() { return reason; }
    public void setReason(String reason) { this.reason = reason; }
    public String getBankReference() { return bankReference; }
    public void setBankReference(String bankReference) { this.bankReference = bankReference; }
    public Instant getRequestedAt() { return requestedAt; }
    public void setRequestedAt(Instant requestedAt) { this.requestedAt = requestedAt; }
    public Instant getDecidedAt() { return decidedAt; }
    public void setDecidedAt(Instant decidedAt) { this.decidedAt = decidedAt; }
    public Instant getDisbursedAt() { return disbursedAt; }
    public void setDisbursedAt(Instant disbursedAt) { this.disbursedAt = disbursedAt; }
}
```

- [ ] **Step 5: Write the repository**

Create `backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java`:

```java
package com.plotchain.withdrawal;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

// Wallet/withdrawal unit 5: this unit only needs save()/findById(), both inherited from
// JpaRepository. search(associateId, status, Pageable) -- the approval-queue/history query -- is
// unit 6's addition (units file, Excluded section: "a standalone repository query method unit...
// not an observable outcome on its own; built as part of unit 6 and reused unmodified by unit
// 9"), deliberately not added here ahead of need.
public interface WithdrawalRequestRepository extends JpaRepository<WithdrawalRequest, UUID> {
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=WithdrawalRequestRepositoryTest`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestStatus.java backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequest.java backend/src/main/java/com/plotchain/withdrawal/WithdrawalRequestRepository.java backend/src/test/java/com/plotchain/withdrawal/WithdrawalRequestRepositoryTest.java
git commit -m "feat(withdrawal): add WithdrawalRequest entity, status enum, and repository"
```

---

## Task 4: New exceptions + `WithdrawalExceptionHandler`

**Files:**
- Create: `backend/src/main/java/com/plotchain/withdrawal/AssociateSuspendedException.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/KycNotVerifiedException.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/BelowMinimumWithdrawalException.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/InsufficientWalletBalanceException.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalExceptionHandler.java`

**Interfaces:**
- Produces: four exception types, each mapped to HTTP 409 by `WithdrawalExceptionHandler`. Task 5's `WithdrawalService` throws these; Task 6's `WithdrawalController` relies on this handler (plus the pre-existing `DashboardExceptionHandler` for `AssociateNotFoundException` → 404) to translate them.

No dedicated test for this task — these are exercised end-to-end by Task 5's `WithdrawalServiceTest` (which asserts the exception *type* is thrown) and Task 6's `WithdrawalControllerTest` (which asserts the HTTP *status* the handler produces). Writing a standalone test here would just re-assert "this class extends RuntimeException," which the compiler already guarantees.

- [ ] **Step 1: Write the four exception classes**

Create `backend/src/main/java/com/plotchain/withdrawal/AssociateSuspendedException.java`:

```java
package com.plotchain.withdrawal;

import java.util.UUID;

// Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Flow "Submit a withdrawal request" step 2, Error handling table). Deliberately a SEPARATE type
// from com.plotchain.auth.AssociateSuspendedException: that one is a no-arg, 403-mapped exception
// AuthService throws when a SUSPENDED associate tries to log in THEMSELVES ("Your account has
// been suspended..."). This one is thrown when an ADMIN submits a withdrawal request ON BEHALF OF
// a SUSPENDED associate -- different actor, different HTTP status (409, not 403 -- the request
// itself is well-formed and authorized, it just targets an associate in the wrong state),
// different message. Same simple class name, different package/FQCN -- matches the source spec's
// literal naming rather than inventing a name the spec doesn't use. Do not merge these two types.
public class AssociateSuspendedException extends RuntimeException {
    public AssociateSuspendedException(UUID associateId) {
        super("Cannot submit a withdrawal for a suspended associate: " + associateId);
    }
}
```

Create `backend/src/main/java/com/plotchain/withdrawal/KycNotVerifiedException.java`:

```java
package com.plotchain.withdrawal;

import java.util.UUID;

// Wallet/withdrawal unit 5 (Decision 9, Flow step 3): submission-time KYC gate. Decision 9 also
// calls for the SAME check to be re-run at approval-decision time (unit 7) -- this type is
// intentionally reusable there too, not unit-5-specific in name.
public class KycNotVerifiedException extends RuntimeException {
    public KycNotVerifiedException(UUID associateId) {
        super("Associate KYC is not verified: " + associateId);
    }
}
```

Create `backend/src/main/java/com/plotchain/withdrawal/BelowMinimumWithdrawalException.java`:

```java
package com.plotchain.withdrawal;

import java.math.BigDecimal;

// Wallet/withdrawal unit 5 (Decision 6, Flow step 5): amount < withdrawalConfig.minimumWithdrawalAmount.
public class BelowMinimumWithdrawalException extends RuntimeException {
    public BelowMinimumWithdrawalException(BigDecimal amount, BigDecimal minimum) {
        super("Withdrawal amount " + amount + " is below the minimum withdrawal amount " + minimum);
    }
}
```

Create `backend/src/main/java/com/plotchain/withdrawal/InsufficientWalletBalanceException.java`:

```java
package com.plotchain.withdrawal;

import java.util.UUID;

// Wallet/withdrawal unit 5 (Decision 5, Decision 10, Flow step 6): WalletRepository.debitIfSufficient
// returned 0 affected rows -- covers both "balance too low" and "no Wallet row exists at all"
// identically, per debitIfSufficient's own contract.
public class InsufficientWalletBalanceException extends RuntimeException {
    public InsufficientWalletBalanceException(UUID associateId) {
        super("Insufficient wallet balance for associate: " + associateId);
    }
}
```

- [ ] **Step 2: Write the exception handler**

Create `backend/src/main/java/com/plotchain/withdrawal/WithdrawalExceptionHandler.java`:

```java
package com.plotchain.withdrawal;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

// com.plotchain.associate.AssociateNotFoundException (existing, thrown by WithdrawalService on
// an unknown associateId) is already mapped to 404 by the app-wide
// com.plotchain.dashboard.DashboardExceptionHandler -- @RestControllerAdvice beans apply across
// every controller in the application regardless of which package throws the exception, so no
// duplicate handler is added here for it.
@RestControllerAdvice
public class WithdrawalExceptionHandler {

    @ExceptionHandler(AssociateSuspendedException.class)
    public ResponseEntity<Map<String, String>> handleAssociateSuspended(AssociateSuspendedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(KycNotVerifiedException.class)
    public ResponseEntity<Map<String, String>> handleKycNotVerified(KycNotVerifiedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(BelowMinimumWithdrawalException.class)
    public ResponseEntity<Map<String, String>> handleBelowMinimumWithdrawal(BelowMinimumWithdrawalException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(InsufficientWalletBalanceException.class)
    public ResponseEntity<Map<String, String>> handleInsufficientWalletBalance(InsufficientWalletBalanceException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
```

- [ ] **Step 3: Compile check**

Run: `cd backend && mvn -q compile`
Expected: BUILD SUCCESS (no test yet exercises these — this just confirms they compile before Task 5/6 wire them in).

- [ ] **Step 4: Commit**

```bash
git add backend/src/main/java/com/plotchain/withdrawal/AssociateSuspendedException.java backend/src/main/java/com/plotchain/withdrawal/KycNotVerifiedException.java backend/src/main/java/com/plotchain/withdrawal/BelowMinimumWithdrawalException.java backend/src/main/java/com/plotchain/withdrawal/InsufficientWalletBalanceException.java backend/src/main/java/com/plotchain/withdrawal/WithdrawalExceptionHandler.java
git commit -m "feat(withdrawal): add withdrawal-submission exceptions and 409 handler"
```

---

## Task 5: `WithdrawalService.submitRequest(...)` (TDD)

**Files:**
- Create: `backend/src/main/java/com/plotchain/withdrawal/CreateWithdrawalRequest.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/AdminWithdrawalResponse.java`
- Create: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`

**Interfaces:**
- Consumes: `AssociateRepository.findById` (existing, `associate` package), `WalletRepository.debitIfSufficient` (Task 2), `WithdrawalConfigService.getConfig(): WithdrawalConfigResponse` (existing, `payments` package, merged unit 3 — fields `approvalMode(): String`, `autoApproveLimit(): BigDecimal`, `minimumWithdrawalAmount(): BigDecimal`), `WithdrawalRequestRepository.save` (Task 3), `SettingsAuditService.record(String section, String summary, Object detail, UUID actorId)` (existing, `company` package).
- Produces: `WithdrawalService.submitRequest(CreateWithdrawalRequest request, UUID actorId): AdminWithdrawalResponse`. Task 6's `WithdrawalController` calls this directly.

- [ ] **Step 1: Write the DTOs**

Create `backend/src/main/java/com/plotchain/withdrawal/CreateWithdrawalRequest.java`:

```java
package com.plotchain.withdrawal;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.util.UUID;

public record CreateWithdrawalRequest(
    @NotNull UUID associateId,
    @NotNull @Positive BigDecimal amount
) {}
```

Create `backend/src/main/java/com/plotchain/withdrawal/AdminWithdrawalResponse.java`:

```java
package com.plotchain.withdrawal;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

// Wallet/withdrawal unit 5 (Decision 14): mirrors Income/Ledger's AdminLedgerEntryResponse
// pattern -- associateUserId/associateName are resolved server-side, not left as a bare
// associateId for the caller to look up separately. A single submission needs only a single
// associate lookup (no batching); units 6/9's list endpoints are where a batch-load pattern
// (associateRepository.findAllById over a page) actually pays for itself.
public record AdminWithdrawalResponse(
    UUID id,
    UUID associateId,
    String associateUserId,
    String associateName,
    BigDecimal amount,
    WithdrawalRequestStatus status,
    String reason,
    String bankReference,
    Instant requestedAt,
    Instant decidedAt,
    Instant disbursedAt
) {}
```

- [ ] **Step 2: Write the failing tests**

Create `backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java`:

```java
package com.plotchain.withdrawal;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.payments.WithdrawalConfigResponse;
import com.plotchain.payments.WithdrawalConfigService;
import com.plotchain.wallet.WalletRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WithdrawalServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock WalletRepository walletRepository;
    @Mock WithdrawalConfigService withdrawalConfigService;
    @Mock WithdrawalRequestRepository withdrawalRequestRepository;
    @Mock SettingsAuditService settingsAuditService;

    WithdrawalService withdrawalService;

    private static final UUID ADMIN_ACTOR_ID = UUID.randomUUID();
    private static final UUID ASSOCIATE_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        withdrawalService = new WithdrawalService(
            associateRepository, walletRepository, withdrawalConfigService,
            withdrawalRequestRepository, settingsAuditService);
    }

    private Associate verifiedActiveAssociate() {
        Associate associate = new Associate();
        associate.setId(ASSOCIATE_ID);
        associate.setUserId("VP00001");
        associate.setName("Jane Doe");
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setStatus(AssociateStatus.ACTIVE);
        associate.setKycStatus(KycStatus.VERIFIED);
        return associate;
    }

    private WithdrawalConfigResponse configWith(String approvalMode, BigDecimal autoApproveLimit, BigDecimal minimum) {
        return new WithdrawalConfigResponse(approvalMode, autoApproveLimit, minimum, Instant.now());
    }

    private CreateWithdrawalRequest requestFor(UUID associateId, BigDecimal amount) {
        return new CreateWithdrawalRequest(associateId, amount);
    }

    @Test
    void submitRequestThrowsWhenAssociateIsUnknown() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("1000")), ADMIN_ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);

        verify(walletRepository, never()).debitIfSufficient(any(), any());
    }

    @Test
    void submitRequestThrowsWhenAssociateIsSuspended() {
        Associate associate = verifiedActiveAssociate();
        associate.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("1000")), ADMIN_ACTOR_ID))
            .isInstanceOf(AssociateSuspendedException.class);

        verify(walletRepository, never()).debitIfSufficient(any(), any());
    }

    @Test
    void submitRequestThrowsWhenKycIsNotVerified() {
        Associate associate = verifiedActiveAssociate();
        associate.setKycStatus(KycStatus.PENDING);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("1000")), ADMIN_ACTOR_ID))
            .isInstanceOf(KycNotVerifiedException.class);

        verify(walletRepository, never()).debitIfSufficient(any(), any());
    }

    @Test
    void submitRequestThrowsWhenAmountIsBelowTheConfiguredMinimum() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, new BigDecimal("500.00")));

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("100.00")), ADMIN_ACTOR_ID))
            .isInstanceOf(BelowMinimumWithdrawalException.class);

        verify(walletRepository, never()).debitIfSufficient(any(), any());
    }

    @Test
    void submitRequestThrowsWhenWalletBalanceIsInsufficient() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("1000.00"))).thenReturn(0);

        assertThatThrownBy(() -> withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("1000.00")), ADMIN_ACTOR_ID))
            .isInstanceOf(InsufficientWalletBalanceException.class);

        verify(withdrawalRequestRepository, never()).save(any());
    }

    @Test
    void submitRequestCreatesARequestedRowWhenApprovalModeIsAlwaysManual() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("1000.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.submitRequest(
            requestFor(ASSOCIATE_ID, new BigDecimal("1000.00")), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
        assertThat(response.decidedAt()).isNull();
        assertThat(response.associateUserId()).isEqualTo("VP00001");
        assertThat(response.associateName()).isEqualTo("Jane Doe");
    }

    @Test
    void submitRequestAutoApprovesWhenApprovalModeIsAutoUnderLimitAndAmountIsAtOrUnderTheLimit() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("AUTO_UNDER_LIMIT", new BigDecimal("5000.00"), BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("5000.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.submitRequest(
            requestFor(ASSOCIATE_ID, new BigDecimal("5000.00")), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.APPROVED);
        assertThat(response.decidedAt()).isNotNull();
    }

    @Test
    void submitRequestDoesNotAutoApproveWhenAmountExceedsTheAutoApproveLimit() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("AUTO_UNDER_LIMIT", new BigDecimal("5000.00"), BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("5000.01"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.submitRequest(
            requestFor(ASSOCIATE_ID, new BigDecimal("5000.01")), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
        assertThat(response.decidedAt()).isNull();
    }

    @Test
    void submitRequestAllowsAnAssociateWithAdminRoleWithNoSpecialCasing() {
        Associate adminAssociate = verifiedActiveAssociate();
        adminAssociate.setRole(AssociateRole.ADMIN);
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(adminAssociate));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("100.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        AdminWithdrawalResponse response = withdrawalService.submitRequest(
            requestFor(ASSOCIATE_ID, new BigDecimal("100.00")), ADMIN_ACTOR_ID);

        assertThat(response.status()).isEqualTo(WithdrawalRequestStatus.REQUESTED);
    }

    @Test
    void submitRequestRecordsASettingsAuditEntry() {
        when(associateRepository.findById(ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        when(withdrawalConfigService.getConfig()).thenReturn(configWith("ALWAYS_MANUAL", null, BigDecimal.ZERO));
        when(walletRepository.debitIfSufficient(ASSOCIATE_ID, new BigDecimal("100.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        withdrawalService.submitRequest(requestFor(ASSOCIATE_ID, new BigDecimal("100.00")), ADMIN_ACTOR_ID);

        ArgumentCaptor<String> summaryCaptor = ArgumentCaptor.forClass(String.class);
        verify(settingsAuditService).record(eq("withdrawal"), summaryCaptor.capture(), any(), eq(ADMIN_ACTOR_ID));
        assertThat(summaryCaptor.getValue()).contains("VP00001");
    }
}
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=WithdrawalServiceTest`
Expected: FAIL — compile error, `WithdrawalService` doesn't exist yet.

- [ ] **Step 4: Write `WithdrawalService`**

Create `backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java`:

```java
package com.plotchain.withdrawal;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.payments.WithdrawalConfigResponse;
import com.plotchain.payments.WithdrawalConfigService;
import com.plotchain.wallet.WalletRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

// Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Flow "Submit a withdrawal request"): one service for the withdrawal-request lifecycle
// (Decision 12) -- this unit implements submission only; approve/reject/disburse (units 6-8) are
// added to this same class by later units, not split into separate service classes.
@Service
public class WithdrawalService {

    private final AssociateRepository associateRepository;
    private final WalletRepository walletRepository;
    private final WithdrawalConfigService withdrawalConfigService;
    private final WithdrawalRequestRepository withdrawalRequestRepository;
    private final SettingsAuditService settingsAuditService;

    public WithdrawalService(
            AssociateRepository associateRepository,
            WalletRepository walletRepository,
            WithdrawalConfigService withdrawalConfigService,
            WithdrawalRequestRepository withdrawalRequestRepository,
            SettingsAuditService settingsAuditService) {
        this.associateRepository = associateRepository;
        this.walletRepository = walletRepository;
        this.withdrawalConfigService = withdrawalConfigService;
        this.withdrawalRequestRepository = withdrawalRequestRepository;
        this.settingsAuditService = settingsAuditService;
    }

    // Flow steps 1-10. Guard clauses run in the exact order the spec's flow lists them: unknown
    // associate (404) -> suspended (409) -> KYC unverified (409) -> below minimum (409) ->
    // insufficient balance (409, via the atomic debit itself). @Positive on CreateWithdrawalRequest
    // handles amount <= 0 as a 400 before this method is even called (Bean Validation, not a guard
    // clause here).
    @Transactional
    public AdminWithdrawalResponse submitRequest(CreateWithdrawalRequest request, UUID actorId) {
        Associate associate = associateRepository.findById(request.associateId())
            .orElseThrow(() -> new AssociateNotFoundException(request.associateId()));

        if (associate.getStatus() == AssociateStatus.SUSPENDED) {
            throw new AssociateSuspendedException(associate.getId());
        }
        if (associate.getKycStatus() != KycStatus.VERIFIED) {
            throw new KycNotVerifiedException(associate.getId());
        }

        WithdrawalConfigResponse config = withdrawalConfigService.getConfig();
        // A null minimumWithdrawalAmount can only occur pre-Go-Live (SetupStateService blocks
        // launch until an admin explicitly sets it, including to exactly 0 -- unit 3, Decision 18);
        // treated as "no minimum" here rather than rejecting every request, since this endpoint has
        // no other way to signal "the platform isn't configured yet" and the spec's own flow
        // assumes the value is always available by the time this runs.
        BigDecimal minimum = config.minimumWithdrawalAmount() == null ? BigDecimal.ZERO : config.minimumWithdrawalAmount();
        if (request.amount().compareTo(minimum) < 0) {
            throw new BelowMinimumWithdrawalException(request.amount(), minimum);
        }

        int debited = walletRepository.debitIfSufficient(associate.getId(), request.amount());
        if (debited == 0) {
            throw new InsufficientWalletBalanceException(associate.getId());
        }

        // Decision 7: auto-approval at request-creation time, the first real use of these
        // long-dead-setting fields. autoApproveLimit is null-checked defensively even though
        // WithdrawalConfigService.validate() already requires it whenever approvalMode is
        // AUTO_UNDER_LIMIT -- this method has no visibility into that invariant holding.
        boolean autoApproved = "AUTO_UNDER_LIMIT".equals(config.approvalMode())
            && config.autoApproveLimit() != null
            && request.amount().compareTo(config.autoApproveLimit()) <= 0;

        Instant now = Instant.now();
        WithdrawalRequest withdrawalRequest = new WithdrawalRequest();
        withdrawalRequest.setId(UUID.randomUUID());
        withdrawalRequest.setAssociateId(associate.getId());
        withdrawalRequest.setAmount(request.amount());
        withdrawalRequest.setStatus(autoApproved ? WithdrawalRequestStatus.APPROVED : WithdrawalRequestStatus.REQUESTED);
        withdrawalRequest.setRequestedAt(now);
        withdrawalRequest.setDecidedAt(autoApproved ? now : null);
        withdrawalRequestRepository.save(withdrawalRequest);

        settingsAuditService.record("withdrawal",
            "Submitted withdrawal for " + associate.getUserId(),
            Map.of("amount", request.amount(), "status", withdrawalRequest.getStatus().name()),
            actorId);

        return toResponse(withdrawalRequest, associate);
    }

    private AdminWithdrawalResponse toResponse(WithdrawalRequest withdrawalRequest, Associate associate) {
        return new AdminWithdrawalResponse(
            withdrawalRequest.getId(),
            withdrawalRequest.getAssociateId(),
            associate.getUserId(),
            associate.getName(),
            withdrawalRequest.getAmount(),
            withdrawalRequest.getStatus(),
            withdrawalRequest.getReason(),
            withdrawalRequest.getBankReference(),
            withdrawalRequest.getRequestedAt(),
            withdrawalRequest.getDecidedAt(),
            withdrawalRequest.getDisbursedAt());
    }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=WithdrawalServiceTest`
Expected: PASS (all 9 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/withdrawal/CreateWithdrawalRequest.java backend/src/main/java/com/plotchain/withdrawal/AdminWithdrawalResponse.java backend/src/main/java/com/plotchain/withdrawal/WithdrawalService.java backend/src/test/java/com/plotchain/withdrawal/WithdrawalServiceTest.java
git commit -m "feat(withdrawal): add WithdrawalService.submitRequest with full guard chain and auto-approval"
```

---

## Task 6: `WithdrawalController` — `POST /api/admin/withdrawals`

**Files:**
- Create: `backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java`
- Test: `backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java`

**Interfaces:**
- Consumes: `WithdrawalService.submitRequest` (Task 5).
- Produces: `POST /api/admin/withdrawals` — 201 with `AdminWithdrawalResponse` body on success.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java`:

```java
package com.plotchain.withdrawal;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.AssociateStatus;
import com.plotchain.associate.KycStatus;
import com.plotchain.auth.JwtService;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.payments.WithdrawalConfig;
import com.plotchain.payments.WithdrawalConfigRepository;
import com.plotchain.wallet.WalletRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

// @SpringBootTest + real Spring Security filter chain, mirroring KycReviewControllerTest's
// pattern -- proves auth/validation/exception-mapping wiring end to end. Business-logic branch
// coverage (every guard clause, auto-approval math) lives in WithdrawalServiceTest; this class
// only needs one representative case per HTTP outcome.
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class WithdrawalControllerTest {

    @Autowired MockMvc mockMvc;
    @Autowired JwtService jwtService;

    @MockBean AssociateRepository associateRepository;
    @MockBean WalletRepository walletRepository;
    @MockBean WithdrawalConfigRepository withdrawalConfigRepository;
    @MockBean WithdrawalRequestRepository withdrawalRequestRepository;
    @MockBean SettingsAuditLogRepository settingsAuditLogRepository;

    private static final UUID TARGET_ASSOCIATE_ID = UUID.randomUUID();

    private String tokenFor(AssociateRole role) {
        Associate associate = new Associate();
        associate.setId(UUID.randomUUID());
        associate.setRole(role);
        when(associateRepository.findById(associate.getId())).thenReturn(Optional.of(associate));
        return jwtService.generateToken(associate);
    }

    private Associate verifiedActiveAssociate() {
        Associate associate = new Associate();
        associate.setId(TARGET_ASSOCIATE_ID);
        associate.setUserId("VP00001");
        associate.setName("Jane Doe");
        associate.setRole(AssociateRole.ASSOCIATE);
        associate.setStatus(AssociateStatus.ACTIVE);
        associate.setKycStatus(KycStatus.VERIFIED);
        return associate;
    }

    private void stubAlwaysManualNoMinimum() {
        WithdrawalConfig config = new WithdrawalConfig();
        config.setApprovalMode("ALWAYS_MANUAL");
        config.setMinimumWithdrawalAmount(BigDecimal.ZERO);
        when(withdrawalConfigRepository.findAll()).thenReturn(List.of(config));
    }

    @Test
    void submitReturns201AndTheCreatedRequestForAnAdminToken() throws Exception {
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        stubAlwaysManualNoMinimum();
        when(walletRepository.debitIfSufficient(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"))).thenReturn(1);
        when(withdrawalRequestRepository.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("REQUESTED"))
            .andExpect(jsonPath("$.associateUserId").value("VP00001"));
    }

    @Test
    void submitIsForbiddenForAnAssociateToken() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ASSOCIATE))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isForbidden());
    }

    @Test
    void submitReturns400WhenAmountIsNotPositive() throws Exception {
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, BigDecimal.ZERO));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isBadRequest())
            .andExpect(jsonPath("$.fields.amount").isNotEmpty());
    }

    @Test
    void submitReturns404ForAnUnknownAssociate() throws Exception {
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.empty());
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isNotFound());
    }

    @Test
    void submitReturns409ForASuspendedAssociate() throws Exception {
        Associate suspended = verifiedActiveAssociate();
        suspended.setStatus(AssociateStatus.SUSPENDED);
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(suspended));
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isConflict());
    }

    @Test
    void submitReturns409WhenWalletBalanceIsInsufficient() throws Exception {
        when(associateRepository.findById(TARGET_ASSOCIATE_ID)).thenReturn(Optional.of(verifiedActiveAssociate()));
        stubAlwaysManualNoMinimum();
        when(walletRepository.debitIfSufficient(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00"))).thenReturn(0);
        String body = new ObjectMapper().writeValueAsString(new CreateWithdrawalRequest(TARGET_ASSOCIATE_ID, new BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN))
                .contentType("application/json")
                .content(body))
            .andExpect(status().isConflict());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && mvn test -Dtest=WithdrawalControllerTest`
Expected: FAIL — compile error, `WithdrawalController` doesn't exist yet.

- [ ] **Step 3: Write `WithdrawalController`**

Create `backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java`:

```java
package com.plotchain.withdrawal;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

// Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// "POST /api/admin/withdrawals, ADMIN-only"). Only this one endpoint exists in this unit; units
// 6-8 add GET (list) and the /{id}/decision, /{id}/disburse POSTs to this same
// @RequestMapping("/api/admin/withdrawals") class. ADMIN-only enforcement is via SecurityConfig's
// explicit matcher (Task 7) plus the blanket POST "/api/**" rule, same as CycleController's
// close()/creditWallets() -- no @PreAuthorize needed on the method itself.
@RestController
@RequestMapping("/api/admin/withdrawals")
public class WithdrawalController {

    private final WithdrawalService withdrawalService;

    public WithdrawalController(WithdrawalService withdrawalService) {
        this.withdrawalService = withdrawalService;
    }

    @PostMapping
    public ResponseEntity<AdminWithdrawalResponse> submit(
            @Valid @RequestBody CreateWithdrawalRequest request,
            @AuthenticationPrincipal UUID actorId) {
        return ResponseEntity.status(HttpStatus.CREATED).body(withdrawalService.submitRequest(request, actorId));
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd backend && mvn test -Dtest=WithdrawalControllerTest`
Expected: PASS (all 6 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/main/java/com/plotchain/withdrawal/WithdrawalController.java backend/src/test/java/com/plotchain/withdrawal/WithdrawalControllerTest.java
git commit -m "feat(withdrawal): add POST /api/admin/withdrawals controller"
```

---

## Task 7: `SecurityConfig` matcher + `SecurityConfigTest` addition

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `WithdrawalController` (Task 6) — this task only adds a route-authorization matcher and its test, no new production logic.

Note: `POST /api/admin/withdrawals` is already covered by the existing blanket `POST /api/**` → `hasAuthority("ADMIN")` rule (declared near the bottom of `authorizeHttpRequests`), so this task is **not load-bearing for correctness** — the endpoint is already ADMIN-only without it. It's added purely for the same readability/grouping reason the `credit-wallets` and `admin/sales` matchers document (explicit narrower rules grouped near the controller's own domain, first-match-wins-safe since it's placed above the blanket rule).

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, directly after the existing `adminCyclesCreditWalletsIsReachableOnlyForAdminAndForbiddenForEveryOtherRole` test (see that test for the exact neighboring code — same file, same class):

```java
    // Wallet/withdrawal unit 5 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "POST /api/admin/withdrawals, ADMIN-only"): same target-role-model reasoning as
    // /api/admin/cycles/*/credit-wallets directly above. A random, never-configured
    // associateId reaches the real (H2, unmocked-in-this-class) AssociateRepository... no --
    // AssociateRepository IS @MockBean'd class-wide here (see class-level @MockBean list), and
    // findById on an unstubbed UUID returns Optional.empty() by default, so an ADMIN token 404s
    // (AssociateNotFoundException) -- proof the request passed the security layer, not proof of
    // any particular business outcome, same "assert not 403" reasoning as
    // adminSalesRecordIsReachableOnlyForAdminAndForbiddenForEveryOtherRole above. Every other
    // role is blocked at the filter layer before the controller/service ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminWithdrawalsSubmitIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        String body = new ObjectMapper().writeValueAsString(
            new com.plotchain.withdrawal.CreateWithdrawalRequest(UUID.randomUUID(), new java.math.BigDecimal("1000.00")));

        mockMvc.perform(post("/api/admin/withdrawals")
                .header("Authorization", "Bearer " + tokenFor(role))
                .contentType("application/json")
                .content(body))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 404 : 403));
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && mvn test -Dtest=SecurityConfigTest#adminWithdrawalsSubmitIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`
Expected: FAIL — for the ADMIN case, without a `WithdrawalController` route existing at all yet the request would 404 for a different reason (no mapping) before this task's SecurityConfig change; since Task 6 already created the controller, this specific test should actually already pass once Task 6 lands even before Step 3 below (the blanket POST rule already grants ADMIN access). Run it anyway to confirm the current (pre-Step-3) behavior matches expectations, then proceed to Step 3 for the explicit matcher.

- [ ] **Step 3: Add the explicit matcher to `SecurityConfig`**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, insert directly after the existing `credit-wallets` matcher block (after the line `.hasAuthority("ADMIN")` that closes the `POST /api/admin/cycles/*/credit-wallets` matcher, and before the `// Record a sale` comment):

```java
                // Wallet/withdrawal unit 5
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "POST /api/admin/withdrawals, ADMIN-only"): same target-role-model reasoning and
                // first-match-wins placement as the credit-wallets matcher directly above -- not
                // load-bearing on its own (the blanket POST rule below already covers it), added
                // for the same readability/grouping reason that matcher documents.
                .requestMatchers(HttpMethod.POST, "/api/admin/withdrawals")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && mvn test -Dtest=SecurityConfigTest#adminWithdrawalsSubmitIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`
Expected: PASS.

- [ ] **Step 5: Run the full withdrawal test slice**

Run: `cd backend && mvn test -Dtest=WalletRepositoryTest,WithdrawalRequestRepositoryTest,WithdrawalServiceTest,WithdrawalControllerTest,SecurityConfigTest`
Expected: PASS across all five classes — this is the final verification that Tasks 1-7 compose correctly.

- [ ] **Step 6: Commit**

```bash
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(withdrawal): add explicit ADMIN-only SecurityConfig matcher for POST /api/admin/withdrawals"
```

---

## Self-review notes (carried over from plan authoring, not a step to execute)

- **Spec coverage:** every acceptance-criteria bullet from the units file's section 5 maps to a task above — migration (Task 1), `debitIfSufficient` (Task 2), entity/enum/repository (Task 3), all six named exceptions minus the two reused-as-is (`AssociateNotFoundException`, existing) or deferred-to-later-units (`WithdrawalRequestNotFoundException`, `InvalidWithdrawalStateException` — not thrown by this unit's flow, left for units 7/8) (Task 4), guard-clause chain + atomic debit + auto-approval + audit log (Task 5), 201/403 endpoint (Task 6), ADMIN-only route wiring (Task 7).
- **Deliberately not built in this unit** (confirmed against the units file's own scope note): `WithdrawalRequestRepository.search(...)` (unit 6), the decision/disburse/history endpoints (units 6-9), `WithdrawalRequestNotFoundException`/`InvalidWithdrawalStateException` (thrown only by units 7/8's flows).
- **Type consistency check:** `WithdrawalRequestStatus` (Task 3) is used identically in `WithdrawalService` (Task 5), `AdminWithdrawalResponse` (Task 5), and both test files (Tasks 3, 5, 6) — no renamed variants. `CreateWithdrawalRequest`/`AdminWithdrawalResponse` field names match between the DTO definitions (Task 5) and every test that constructs/asserts them (Tasks 5, 6, 7).
