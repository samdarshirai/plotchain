# Wallet Crediting Batch Step Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `POST /api/admin/cycles/{id}/credit-wallets` (ADMIN-only), a new admin-triggered batch step that credits every `PENDING` `LedgerEntry` of a `CLOSED` cycle into associates' `Wallet.balance`, flips those entries to `PAID`, and advances the cycle to `PAID`.

**Architecture:** A new `WalletCreditingService` (in the existing `wallet` package) is called from a new endpoint method added to the existing `CycleController` (`cycle` package) — a cross-package addition mirroring the precedent Cycle Management itself set. The service row-locks the `Cycle` first (`SELECT ... FOR UPDATE`, reusing `CycleRepository.findByIdForUpdate` unchanged), reads that cycle's `PENDING` entries via a new `LedgerEntryRepository.findByCycleIdAndStatus`, and credits each associate's wallet via a new atomic `WalletRepository.creditBalance` (`@Modifying @Query`, no JPA dirty-checking) so it can be safely reused unmodified by future units (KYC reconciliation sweep, reject/cancel refund). The whole operation is one `@Transactional` method — a mid-batch failure rolls back everything, and a retry re-processes the same `PENDING` set.

**Tech Stack:** Spring Boot 3 / Spring Data JPA, PostgreSQL (H2 `MODE=PostgreSQL` in tests), JUnit 5 + Mockito + AssertJ, MockMvc for controller/security tests.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` (Decisions 1, 2, 3, 5; Data model; Flow "Wallet crediting"; Error handling table; Testing section). Unit slice detail: `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md`, section "### 1."

## Global Constraints

- ADMIN-only: unauthenticated → 401, non-ADMIN authenticated → 403.
- `WalletRepository.creditBalance(UUID, BigDecimal): int` must stay generic (associateId + amount only, no cycle/withdrawal-specific parameters) — units 4 and 7 (not part of this plan) reuse it unmodified.
- No new migration: `wallet` (already `associate_id` PK + `balance`) and `ledger_entry` (already has an unused `PAID` status value) need no schema changes for this unit.
- No `SettingsAuditService` call in this flow — the spec's Flow "Wallet crediting" (steps 1–6) does not call it; only unit 4's reconciliation sweep and unit 5+'s withdrawal endpoints do, both out of scope here.
- `Cycle.status` becomes `PAID` unconditionally once all `PENDING` entries are processed, regardless of any `CARRIED_FORWARD` entries left in the cycle (Decision 3) — never gate the `PAID` transition on anything but "finished iterating the `PENDING` list."
- A JDK21/25 + Mockito mismatch in this environment produces ~55 unrelated spurious errors on a full `mvn test` run — expected and unrelated to this work; run scoped `-Dtest=...` commands per task instead of relying on the full suite's pass/fail count.

---

## File Structure

**Create:**
- `backend/src/main/java/com/plotchain/cycle/CyclePayoutStateException.java` — new exception (409), lives alongside `CycleNotFoundException`/`CycleAlreadyClosedException` since it's fundamentally about `Cycle`'s own state machine, even though it's thrown from `wallet` package code.
- `backend/src/main/java/com/plotchain/wallet/WalletCreditingResult.java` — response record.
- `backend/src/main/java/com/plotchain/wallet/WalletCreditingService.java` — the crediting batch step.
- `backend/src/test/java/com/plotchain/income/` — no new file, existing `LedgerEntryRepositoryTest.java` gains a method.
- `backend/src/test/java/com/plotchain/wallet/WalletRepositoryTest.java` — `creditBalance` repository test.
- `backend/src/test/java/com/plotchain/wallet/WalletCreditingServiceTest.java` — Mockito unit tests.
- `backend/src/test/java/com/plotchain/wallet/WalletCreditingIdempotencyTest.java` — mid-batch-failure rollback + retry integration test.
- `backend/src/test/java/com/plotchain/wallet/WalletCreditingConcurrencyTest.java` — row-lock concurrency integration test.

**Modify:**
- `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java` — add `findByCycleIdAndStatus`.
- `backend/src/main/java/com/plotchain/wallet/WalletRepository.java` — add `creditBalance`.
- `backend/src/main/java/com/plotchain/cycle/CycleController.java` — add `WalletCreditingService` dependency + `POST /{id}/credit-wallets`.
- `backend/src/main/java/com/plotchain/cycle/CycleExceptionHandler.java` — map `CyclePayoutStateException` → 409.
- `backend/src/main/java/com/plotchain/auth/SecurityConfig.java` — add an ADMIN-only matcher for the new route.
- `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java` — add endpoint tests.
- `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java` — add the ADMIN-only parameterized test.

---

## Task 1: `LedgerEntryRepository.findByCycleIdAndStatus`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`
- Test: `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`

**Interfaces:**
- Produces: `LedgerEntryRepository.findByCycleIdAndStatus(UUID cycleId, LedgerEntryStatus status): List<LedgerEntry>` — consumed by Task 4's `WalletCreditingService`.

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java` (this file already has `seedAssociate()`/`seedCycle()`/`newEntry()` helpers — reuse them):

```java
    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // New repository methods section): the crediting step's one read query. Proves entries in a
    // DIFFERENT cycle, or with a different status (CARRIED_FORWARD/PAID/REVERSED), are excluded
    // by the query itself -- not by any extra filtering a caller would otherwise need to do.
    @Test
    void findByCycleIdAndStatusReturnsOnlyMatchingEntriesForThatExactCycleAndStatus() {
        Associate associate = seedAssociate();
        Cycle targetCycle = seedCycle();
        Cycle otherCycle = seedCycle();

        LedgerEntry pendingInTarget = ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), targetCycle.getId(), IncomeType.DIRECT, UUID.randomUUID()));
        LedgerEntry carriedForwardInTarget = newEntry(associate.getId(), targetCycle.getId(), IncomeType.MATCHING, UUID.randomUUID());
        carriedForwardInTarget.setStatus(LedgerEntryStatus.CARRIED_FORWARD);
        ledgerEntryRepository.saveAndFlush(carriedForwardInTarget);
        LedgerEntry reversedInTarget = newEntry(associate.getId(), targetCycle.getId(), IncomeType.ROYALTY, UUID.randomUUID());
        reversedInTarget.setStatus(LedgerEntryStatus.REVERSED);
        ledgerEntryRepository.saveAndFlush(reversedInTarget);
        LedgerEntry pendingInOtherCycle = ledgerEntryRepository.saveAndFlush(
            newEntry(associate.getId(), otherCycle.getId(), IncomeType.DIRECT, UUID.randomUUID()));

        List<LedgerEntry> found = ledgerEntryRepository.findByCycleIdAndStatus(targetCycle.getId(), LedgerEntryStatus.PENDING);

        assertThat(found).extracting(LedgerEntry::getId).containsExactly(pendingInTarget.getId());
        assertThat(pendingInOtherCycle.getId()).isNotIn(found.stream().map(LedgerEntry::getId).toList());
    }

    @Test
    void findByCycleIdAndStatusReturnsAnEmptyListWhenNothingMatches() {
        Cycle cycle = seedCycle();

        assertThat(ledgerEntryRepository.findByCycleIdAndStatus(cycle.getId(), LedgerEntryStatus.PENDING)).isEmpty();
    }
```

Add `import java.util.List;` to the file's imports if not already present (check first — this file already imports `java.util.Optional` and `java.util.UUID`; `List` is not yet imported).

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=LedgerEntryRepositoryTest`
Expected: compile error — `findByCycleIdAndStatus` does not exist on `LedgerEntryRepository`.

- [ ] **Step 3: Add the repository method**

In `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`, add after `findBySourceRef` (before the `search` method):

```java
    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // New repository methods section): the crediting step's one read query -- every PENDING entry
    // for a closed cycle, the exact set WalletCreditingService.creditWallets(...) processes.
    // Entries in other cycles or with CARRIED_FORWARD/PAID/REVERSED status are excluded by the
    // query itself.
    java.util.List<LedgerEntry> findByCycleIdAndStatus(UUID cycleId, LedgerEntryStatus status);
```

(Use a fully-qualified `java.util.List` here to avoid touching the existing import block, matching this file's existing style of minimal diffs — or add `import java.util.List;` alongside the existing `import java.util.Optional;`/`import java.util.UUID;` lines and use the bare `List<LedgerEntry>` return type. Either is acceptable; prefer adding the import for readability, consistent with the rest of the file's un-qualified types.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=LedgerEntryRepositoryTest`
Expected: PASS (all methods in the file, including the two new ones).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java
git commit -m "feat(wallet-withdrawal): add LedgerEntryRepository.findByCycleIdAndStatus"
```

---

## Task 2: `WalletRepository.creditBalance`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/wallet/WalletRepository.java`
- Test (new): `backend/src/test/java/com/plotchain/wallet/WalletRepositoryTest.java`

**Interfaces:**
- Produces: `WalletRepository.creditBalance(UUID associateId, BigDecimal amount): int` — atomic `UPDATE wallet SET balance = balance + :amount WHERE associate_id = :associateId`, returns affected-row count. Returns `0` if no `Wallet` row exists for that associate (does not create one — callers needing a guaranteed row must `save(Wallet.zero(id))` first). Consumed by Task 4's `WalletCreditingService`.

- [ ] **Step 1: Write the failing test**

Create `backend/src/test/java/com/plotchain/wallet/WalletRepositoryTest.java`:

```java
package com.plotchain.wallet;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.boot.test.autoconfigure.orm.jpa.TestEntityManager;
import org.springframework.test.context.ActiveProfiles;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

// Wallet/withdrawal unit 1, Decision 5: proves creditBalance's atomic UPDATE against the real H2
// (MODE=PostgreSQL) test datasource -- a Mockito mock can't exercise a real
// "UPDATE ... WHERE associate_id = :associateId" affected-row-count, which is the entire reason
// this method exists instead of a find-then-save round trip (Wallet has no @Version column, so a
// read-then-write race would silently lose an update under concurrent credits).
@DataJpaTest
@ActiveProfiles("test")
class WalletRepositoryTest {

    @Autowired WalletRepository walletRepository;
    @Autowired TestEntityManager entityManager;

    // ADMIN role, no rankId -- chk_associate_rank_required (V4__user_id_login_and_admin_roles.sql)
    // only requires rank_id for ASSOCIATE, so this avoids needing a RankTier fixture, same
    // shortcut CycleCloseRollbackTest's seedRootAssociate takes.
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

    @Test
    void creditBalanceIncrementsAnExistingWalletsBalanceAndReturnsOneAffectedRow() {
        Associate associate = seedAssociate();
        entityManager.persist(Wallet.zero(associate.getId()));
        entityManager.flush();

        int affected = walletRepository.creditBalance(associate.getId(), new BigDecimal("25.50"));
        entityManager.flush();
        entityManager.clear();

        assertThat(affected).isEqualTo(1);
        Wallet reread = walletRepository.findById(associate.getId()).orElseThrow();
        assertThat(reread.getBalance()).isEqualByComparingTo("25.50");
    }

    @Test
    void creditBalanceCalledTwiceAccumulatesRatherThanOverwriting() {
        Associate associate = seedAssociate();
        entityManager.persist(Wallet.zero(associate.getId()));
        entityManager.flush();

        walletRepository.creditBalance(associate.getId(), new BigDecimal("10.00"));
        entityManager.flush();
        entityManager.clear();
        walletRepository.creditBalance(associate.getId(), new BigDecimal("5.00"));
        entityManager.flush();
        entityManager.clear();

        Wallet reread = walletRepository.findById(associate.getId()).orElseThrow();
        assertThat(reread.getBalance()).isEqualByComparingTo("15.00");
    }

    @Test
    void creditBalanceReturnsZeroAffectedRowsAndCreatesNothingWhenNoWalletRowExists() {
        UUID neverCreditedAssociateId = UUID.randomUUID();

        int affected = walletRepository.creditBalance(neverCreditedAssociateId, new BigDecimal("10.00"));

        assertThat(affected).isZero();
        assertThat(walletRepository.findById(neverCreditedAssociateId)).isEmpty();
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=WalletRepositoryTest`
Expected: compile error — `creditBalance` does not exist on `WalletRepository`.

- [ ] **Step 3: Add the repository method**

Replace `backend/src/main/java/com/plotchain/wallet/WalletRepository.java` in full:

```java
package com.plotchain.wallet;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.UUID;

public interface WalletRepository extends JpaRepository<Wallet, UUID> {

    @Query("SELECT COALESCE(SUM(w.balance), 0) FROM Wallet w")
    BigDecimal sumAllBalances();

    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // Decision 5): atomic UPDATE, not JPA dirty-checking. Wallet has no @Version column, so a
    // plain find->mutate->save round trip is a lost-update race between two concurrent operations
    // touching the same associate's wallet (e.g. two different cycles' crediting runs, or a
    // crediting run overlapping a withdrawal-request debit). Returns 0 affected rows if no Wallet
    // row exists yet for this associate -- callers that need a row to exist first (a first-time
    // associate) must create one via Wallet.zero(...) before calling this. Deliberately generic
    // (associateId + amount only) -- reused unmodified by unit 4's KYC reconciliation sweep and
    // unit 7's reject/cancel refund.
    @Modifying
    @Query("UPDATE Wallet w SET w.balance = w.balance + :amount WHERE w.associateId = :associateId")
    int creditBalance(@Param("associateId") UUID associateId, @Param("amount") BigDecimal amount);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=WalletRepositoryTest`
Expected: PASS (all three tests).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/wallet/WalletRepository.java backend/src/test/java/com/plotchain/wallet/WalletRepositoryTest.java
git commit -m "feat(wallet-withdrawal): add WalletRepository.creditBalance atomic update"
```

---

## Task 3: `CyclePayoutStateException` + exception-handler wiring

**Files:**
- Create: `backend/src/main/java/com/plotchain/cycle/CyclePayoutStateException.java`
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleExceptionHandler.java`

**Interfaces:**
- Produces: `CyclePayoutStateException.alreadyCredited(UUID cycleId): CyclePayoutStateException` and `CyclePayoutStateException.settlementNotClosed(UUID cycleId): CyclePayoutStateException` — both `RuntimeException`s mapped to HTTP 409. Consumed by Task 4's `WalletCreditingService`. HTTP-status verification happens indirectly in Task 5's `CycleControllerTest` additions (this task has no MockMvc test of its own, matching how `CycleAlreadyClosedException`'s handler was never tested in isolation either — see `CycleControllerTest.closeReturns409WhenTheCycleIsNotOpen`).

- [ ] **Step 1: Create the exception class**

Create `backend/src/main/java/com/plotchain/cycle/CyclePayoutStateException.java`:

```java
package com.plotchain.cycle;

import java.util.UUID;

// Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 2): one exception type, two distinct messages -- "already credited" (cycle.status ==
// PAID) vs. "settlement not closed yet" (cycle.status is OPEN or CALCULATING). Both map to HTTP
// 409 via CycleExceptionHandler. Lives in the cycle package (not wallet) because it's fundamentally
// about Cycle's own payout-state machine, the same reasoning CycleNotFoundException/
// CycleAlreadyClosedException already establish for this package, even though it's thrown from
// wallet package code (WalletCreditingService).
public class CyclePayoutStateException extends RuntimeException {

    private CyclePayoutStateException(String message) {
        super(message);
    }

    public static CyclePayoutStateException alreadyCredited(UUID cycleId) {
        return new CyclePayoutStateException("Cycle already credited: " + cycleId);
    }

    public static CyclePayoutStateException settlementNotClosed(UUID cycleId) {
        return new CyclePayoutStateException("Cycle settlement not closed yet: " + cycleId);
    }
}
```

- [ ] **Step 2: Wire the 409 mapping**

In `backend/src/main/java/com/plotchain/cycle/CycleExceptionHandler.java`, add after `handleCycleAlreadyClosed`:

```java

    @ExceptionHandler(CyclePayoutStateException.class)
    public ResponseEntity<Map<String, String>> handleCyclePayoutState(CyclePayoutStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
```

The full file after this edit:

```java
package com.plotchain.cycle;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

@RestControllerAdvice
public class CycleExceptionHandler {

    @ExceptionHandler(CycleNotFoundException.class)
    public ResponseEntity<Map<String, String>> handleCycleNotFound(CycleNotFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(CycleAlreadyClosedException.class)
    public ResponseEntity<Map<String, String>> handleCycleAlreadyClosed(CycleAlreadyClosedException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(CyclePayoutStateException.class)
    public ResponseEntity<Map<String, String>> handleCyclePayoutState(CyclePayoutStateException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", ex.getMessage()));
    }
}
```

- [ ] **Step 3: Compile-check**

Run: `cd backend && mvn compile`
Expected: BUILD SUCCESS (no test coverage for this task in isolation — it's exercised end-to-end in Tasks 4 and 5).

- [ ] **Step 4: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CyclePayoutStateException.java backend/src/main/java/com/plotchain/cycle/CycleExceptionHandler.java
git commit -m "feat(wallet-withdrawal): add CyclePayoutStateException, map to 409"
```

---

## Task 4: `WalletCreditingResult` + `WalletCreditingService`

**Files:**
- Create: `backend/src/main/java/com/plotchain/wallet/WalletCreditingResult.java`
- Create: `backend/src/main/java/com/plotchain/wallet/WalletCreditingService.java`
- Test (new): `backend/src/test/java/com/plotchain/wallet/WalletCreditingServiceTest.java`

**Interfaces:**
- Consumes: `CycleRepository.findByIdForUpdate(UUID): Optional<Cycle>` (existing, `cycle` package), `LedgerEntryRepository.findByCycleIdAndStatus(UUID, LedgerEntryStatus): List<LedgerEntry>` (Task 1), `WalletRepository.creditBalance(UUID, BigDecimal): int` (Task 2), `WalletRepository.existsById`/`save` (existing `JpaRepository` methods), `Wallet.zero(UUID): Wallet` (existing), `CyclePayoutStateException.alreadyCredited`/`settlementNotClosed` (Task 3), `CycleNotFoundException` (existing).
- Produces: `WalletCreditingService.creditWallets(UUID cycleId): WalletCreditingResult` — consumed by Task 5's `CycleController`. `WalletCreditingResult(UUID cycleId, int entriesCredited, BigDecimal totalAmountCredited, CycleStatus newCycleStatus)`.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/test/java/com/plotchain/wallet/WalletCreditingServiceTest.java`:

```java
package com.plotchain.wallet;

import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleNotFoundException;
import com.plotchain.cycle.CyclePayoutStateException;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WalletCreditingServiceTest {

    @Mock CycleRepository cycleRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock WalletRepository walletRepository;

    WalletCreditingService service;

    private Cycle newCycle(UUID id, CycleStatus status) {
        Cycle cycle = new Cycle();
        cycle.setId(id);
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(status);
        return cycle;
    }

    private LedgerEntry pendingEntry(UUID associateId, UUID cycleId, BigDecimal netAmount) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setAssociateId(associateId);
        entry.setCycleId(cycleId);
        entry.setNetAmount(netAmount);
        entry.setStatus(LedgerEntryStatus.PENDING);
        entry.setCreatedAt(Instant.now());
        return entry;
    }

    @Test
    void creditsEveryPendingEntryAcrossMultipleAssociatesAndFlipsEntriesAndCycleToPaid() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository);
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = newCycle(cycleId, CycleStatus.CLOSED);
        UUID associateA = UUID.randomUUID();
        UUID associateB = UUID.randomUUID();
        LedgerEntry entryA = pendingEntry(associateA, cycleId, new BigDecimal("100.00"));
        LedgerEntry entryB = pendingEntry(associateB, cycleId, new BigDecimal("50.00"));

        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.findByCycleIdAndStatus(cycleId, LedgerEntryStatus.PENDING))
            .thenReturn(List.of(entryA, entryB));
        // associateA has no Wallet row yet; associateB already has one -- proves the "create one
        // for a first-time associate" branch only fires when it's actually needed.
        when(walletRepository.existsById(associateA)).thenReturn(false);
        when(walletRepository.existsById(associateB)).thenReturn(true);

        WalletCreditingResult result = service.creditWallets(cycleId);

        ArgumentCaptor<Wallet> walletCaptor = ArgumentCaptor.forClass(Wallet.class);
        verify(walletRepository, times(1)).save(walletCaptor.capture());
        assertThat(walletCaptor.getValue().getAssociateId()).isEqualTo(associateA);

        verify(walletRepository).creditBalance(associateA, new BigDecimal("100.00"));
        verify(walletRepository).creditBalance(associateB, new BigDecimal("50.00"));

        assertThat(entryA.getStatus()).isEqualTo(LedgerEntryStatus.PAID);
        assertThat(entryB.getStatus()).isEqualTo(LedgerEntryStatus.PAID);
        verify(ledgerEntryRepository).save(entryA);
        verify(ledgerEntryRepository).save(entryB);

        assertThat(cycle.getStatus()).isEqualTo(CycleStatus.PAID);
        verify(cycleRepository).save(cycle);

        assertThat(result.cycleId()).isEqualTo(cycleId);
        assertThat(result.entriesCredited()).isEqualTo(2);
        assertThat(result.totalAmountCredited()).isEqualByComparingTo("150.00");
        assertThat(result.newCycleStatus()).isEqualTo(CycleStatus.PAID);
    }

    @Test
    void aCycleWithNoPendingEntriesStillReachesPaidWithZeroCounts() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository);
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = newCycle(cycleId, CycleStatus.CLOSED);
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.findByCycleIdAndStatus(cycleId, LedgerEntryStatus.PENDING))
            .thenReturn(List.of());

        // Decision 3: PAID is reached once the PENDING set (however small -- here, empty) is
        // fully processed, regardless of any CARRIED_FORWARD entries a real cycle might still
        // have sitting in it (findByCycleIdAndStatus's own filtering means this test never needs
        // to construct one to prove the point).
        WalletCreditingResult result = service.creditWallets(cycleId);

        assertThat(result.entriesCredited()).isZero();
        assertThat(result.totalAmountCredited()).isEqualByComparingTo("0");
        assertThat(cycle.getStatus()).isEqualTo(CycleStatus.PAID);
        verify(cycleRepository).save(cycle);
        verify(walletRepository, never()).creditBalance(any(), any());
    }

    @Test
    void creditingAnAlreadyPaidCycleThrowsCyclePayoutStateExceptionAndTouchesNothingElse() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository);
        UUID cycleId = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(newCycle(cycleId, CycleStatus.PAID)));

        assertThatThrownBy(() -> service.creditWallets(cycleId)).isInstanceOf(CyclePayoutStateException.class);

        verify(ledgerEntryRepository, never()).findByCycleIdAndStatus(any(), any());
        verify(walletRepository, never()).creditBalance(any(), any());
    }

    @Test
    void creditingAnOpenCycleThrowsCyclePayoutStateException() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository);
        UUID cycleId = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(newCycle(cycleId, CycleStatus.OPEN)));

        assertThatThrownBy(() -> service.creditWallets(cycleId)).isInstanceOf(CyclePayoutStateException.class);
    }

    @Test
    void creditingACalculatingCycleThrowsCyclePayoutStateException() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository);
        UUID cycleId = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(newCycle(cycleId, CycleStatus.CALCULATING)));

        assertThatThrownBy(() -> service.creditWallets(cycleId)).isInstanceOf(CyclePayoutStateException.class);
    }

    @Test
    void creditingAnUnknownCycleThrowsCycleNotFoundException() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository);
        UUID cycleId = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.creditWallets(cycleId)).isInstanceOf(CycleNotFoundException.class);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn test -Dtest=WalletCreditingServiceTest`
Expected: compile error — `WalletCreditingService`/`WalletCreditingResult` do not exist yet.

- [ ] **Step 3: Create `WalletCreditingResult`**

Create `backend/src/main/java/com/plotchain/wallet/WalletCreditingResult.java`:

```java
package com.plotchain.wallet;

import com.plotchain.cycle.CycleStatus;

import java.math.BigDecimal;
import java.util.UUID;

public record WalletCreditingResult(UUID cycleId, int entriesCredited, BigDecimal totalAmountCredited, CycleStatus newCycleStatus) {
}
```

- [ ] **Step 4: Create `WalletCreditingService`**

Create `backend/src/main/java/com/plotchain/wallet/WalletCreditingService.java`:

```java
package com.plotchain.wallet;

import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleNotFoundException;
import com.plotchain.cycle.CyclePayoutStateException;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

// Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 1, Flow "Wallet crediting"): a separate admin-triggered step from Cycle Management's
// settlement close, deliberately in the wallet package even though it's invoked from a
// cycle-scoped URL (CycleController) -- the logic's job (read LedgerEntry, write Wallet.balance)
// is a wallet-domain concern.
@Service
public class WalletCreditingService {

    private final CycleRepository cycleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final WalletRepository walletRepository;

    public WalletCreditingService(
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        WalletRepository walletRepository
    ) {
        this.cycleRepository = cycleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.walletRepository = walletRepository;
    }

    // Decision 2: row-lock the Cycle FIRST (findByIdForUpdate, the exact method Cycle
    // Management's close() already uses for the same purpose) -- must be this method's first
    // statement, same discipline as CycleService.close(). CLOSED -> proceed; PAID -> already
    // credited (409); OPEN/CALCULATING -> settlement not closed yet (409). A second concurrent
    // call blocks on the row lock, then re-reads status and gets whichever outcome the first
    // call's result implies. No new unique-constraint safety net needed (unlike settlement's
    // idempotency problem): this step only ever UPDATEs existing PENDING rows filtered by status,
    // so a retry after a full rollback finds the exact same uncredited set, and a retry after a
    // real commit finds zero PENDING rows left -- the status transition itself is the idempotency
    // marker.
    @Transactional
    public WalletCreditingResult creditWallets(UUID cycleId) {
        Cycle cycle = cycleRepository.findByIdForUpdate(cycleId)
            .orElseThrow(() -> new CycleNotFoundException(cycleId));

        if (cycle.getStatus() == CycleStatus.PAID) {
            throw CyclePayoutStateException.alreadyCredited(cycleId);
        }
        if (cycle.getStatus() != CycleStatus.CLOSED) {
            throw CyclePayoutStateException.settlementNotClosed(cycleId);
        }

        List<LedgerEntry> entries = ledgerEntryRepository.findByCycleIdAndStatus(cycleId, LedgerEntryStatus.PENDING);

        BigDecimal totalCredited = BigDecimal.ZERO;
        for (LedgerEntry entry : entries) {
            // A first-time associate with no prior Wallet row gets one created rather than
            // erroring -- creditBalance alone would silently affect 0 rows against a
            // non-existent row.
            if (!walletRepository.existsById(entry.getAssociateId())) {
                walletRepository.save(Wallet.zero(entry.getAssociateId()));
            }
            walletRepository.creditBalance(entry.getAssociateId(), entry.getNetAmount());

            entry.setStatus(LedgerEntryStatus.PAID);
            ledgerEntryRepository.save(entry);

            totalCredited = totalCredited.add(entry.getNetAmount());
        }

        // Decision 3: unconditional once the PENDING set above is fully processed, regardless of
        // any CARRIED_FORWARD entries still sitting in this cycle -- PAID means "this cycle's
        // payable-and-KYC-clear income has been released," not "every entry is settled."
        cycle.setStatus(CycleStatus.PAID);
        cycleRepository.save(cycle);

        return new WalletCreditingResult(cycleId, entries.size(), totalCredited, cycle.getStatus());
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=WalletCreditingServiceTest`
Expected: PASS (all six tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/wallet/WalletCreditingResult.java backend/src/main/java/com/plotchain/wallet/WalletCreditingService.java backend/src/test/java/com/plotchain/wallet/WalletCreditingServiceTest.java
git commit -m "feat(wallet-withdrawal): add WalletCreditingService.creditWallets"
```

---

## Task 5: `CycleController` endpoint

**Files:**
- Modify: `backend/src/main/java/com/plotchain/cycle/CycleController.java`
- Modify: `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java`

**Interfaces:**
- Consumes: `WalletCreditingService.creditWallets(UUID): WalletCreditingResult` (Task 4).
- Produces: `POST /api/admin/cycles/{id}/credit-wallets` → 200 with `WalletCreditingResult` body; 404 on `CycleNotFoundException`; 409 on `CyclePayoutStateException`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java`. First, add the mock bean field near the existing `@MockBean CycleService cycleService;` line:

```java
    @MockBean com.plotchain.wallet.WalletCreditingService walletCreditingService;
```

Then add these test methods at the end of the class, before the closing `}`:

```java
    @Test
    void creditWalletsReturnsTheResultForAnAdminToken() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(walletCreditingService.creditWallets(cycleId)).thenReturn(
            new com.plotchain.wallet.WalletCreditingResult(cycleId, 2, java.math.BigDecimal.valueOf(150), CycleStatus.PAID));

        mockMvc.perform(post("/api/admin/cycles/{id}/credit-wallets", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.cycleId").value(cycleId.toString()))
            .andExpect(jsonPath("$.entriesCredited").value(2))
            .andExpect(jsonPath("$.totalAmountCredited").value(150))
            .andExpect(jsonPath("$.newCycleStatus").value("PAID"));
    }

    @Test
    void creditWalletsReturns404WhenTheCycleDoesNotExist() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(walletCreditingService.creditWallets(cycleId)).thenThrow(new CycleNotFoundException(cycleId));

        mockMvc.perform(post("/api/admin/cycles/{id}/credit-wallets", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isNotFound());
    }

    @Test
    void creditWalletsReturns409WhenTheCycleIsAlreadyPaid() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(walletCreditingService.creditWallets(cycleId)).thenThrow(CyclePayoutStateException.alreadyCredited(cycleId));

        mockMvc.perform(post("/api/admin/cycles/{id}/credit-wallets", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isConflict());
    }

    @Test
    void creditWalletsReturns409WhenSettlementIsNotClosedYet() throws Exception {
        UUID cycleId = UUID.randomUUID();
        when(walletCreditingService.creditWallets(cycleId)).thenThrow(CyclePayoutStateException.settlementNotClosed(cycleId));

        mockMvc.perform(post("/api/admin/cycles/{id}/credit-wallets", cycleId)
                .header("Authorization", "Bearer " + tokenFor(AssociateRole.ADMIN)))
            .andExpect(status().isConflict());
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn test -Dtest=CycleControllerTest`
Expected: compile error (`walletCreditingService` field type resolves, but `CycleController`'s constructor doesn't yet accept `WalletCreditingService`, so context loading fails) — or a 404 from the route not existing, depending on how far compilation gets. Confirm the failure is because the route/wiring doesn't exist yet, not a typo.

- [ ] **Step 3: Wire the endpoint**

Replace `backend/src/main/java/com/plotchain/cycle/CycleController.java` in full:

```java
package com.plotchain.cycle;

import com.plotchain.wallet.WalletCreditingResult;
import com.plotchain.wallet.WalletCreditingService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/admin/cycles")
public class CycleController {

    private final CycleService cycleService;
    private final WalletCreditingService walletCreditingService;

    public CycleController(CycleService cycleService, WalletCreditingService walletCreditingService) {
        this.cycleService = cycleService;
        this.walletCreditingService = walletCreditingService;
    }

    @GetMapping
    public CyclePageResponse list(
        @RequestParam(required = false) CycleStatus status,
        @RequestParam(defaultValue = "0") int page,
        @RequestParam(defaultValue = "20") int size
    ) {
        page = Math.max(page, 0);
        size = Math.min(size, 100);
        return cycleService.list(status, page, size);
    }

    @GetMapping("/{id}")
    public CycleDetailResponse detail(@PathVariable UUID id) {
        return cycleService.getDetail(id);
    }

    @PostMapping("/{id}/close")
    public CycleCloseResponse close(@PathVariable UUID id) {
        return cycleService.close(id);
    }

    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // Decision 1): cross-package addition to Cycle Management's own controller, same precedent
    // Cycle Management itself set for SaleRepository.findByCycleIdAndStatus -- the URL is
    // cycle-scoped even though the logic lives in the wallet package's WalletCreditingService.
    @PostMapping("/{id}/credit-wallets")
    public WalletCreditingResult creditWallets(@PathVariable UUID id) {
        return walletCreditingService.creditWallets(id);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=CycleControllerTest`
Expected: PASS (all methods in the file, including the four new ones).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/cycle/CycleController.java backend/src/test/java/com/plotchain/cycle/CycleControllerTest.java
git commit -m "feat(wallet-withdrawal): wire POST /api/admin/cycles/{id}/credit-wallets"
```

---

## Task 6: `SecurityConfig` ADMIN-only matcher

**Files:**
- Modify: `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`
- Modify: `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`

**Interfaces:**
- Consumes: `CycleRepository.findByIdForUpdate`/`save` (existing, real via H2 in this test class — not `@MockBean`'d), `WalletCreditingService`/`LedgerEntryRepository`/`WalletRepository` (real, unmocked — no `PENDING` entries exist in the empty test DB, so the real service runs to completion as a no-op credit).

- [ ] **Step 1: Write the failing test**

Add to `backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java`, directly after `adminCyclesCloseIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`:

```java
    // Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // "POST /api/admin/cycles/{id}/credit-wallets, ADMIN-only"): same target-role-model reasoning
    // and first-match-wins placement as /api/admin/cycles/*/close directly above it in
    // SecurityConfig. cycleRepository.findByIdForUpdate is stubbed to return a CLOSED cycle so an
    // ADMIN token reaches 200; ledgerEntryRepository/walletRepository are NOT @MockBean'd in this
    // class, so the real WalletCreditingService runs against the empty H2 test DB, finds zero
    // PENDING entries, and completes as a legitimate no-op credit (entriesCredited = 0). Every
    // other role, including the soon-to-be-deleted admin-family sub-roles, is blocked at the
    // filter layer before the controller/service ever runs.
    @ParameterizedTest
    @EnumSource(AssociateRole.class)
    void adminCyclesCreditWalletsIsReachableOnlyForAdminAndForbiddenForEveryOtherRole(AssociateRole role) throws Exception {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setPeriodStart(java.time.LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(java.time.LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.CLOSED);
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(cycle));
        when(cycleRepository.save(any(Cycle.class))).thenAnswer(invocation -> invocation.getArgument(0));

        mockMvc.perform(post("/api/admin/cycles/{id}/credit-wallets", cycleId)
                .header("Authorization", "Bearer " + tokenFor(role)))
            .andExpect(status().is(role == AssociateRole.ADMIN ? 200 : 403));
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=SecurityConfigTest#adminCyclesCreditWalletsIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`
Expected: FAIL — every role (including ADMIN) currently gets 403, because the new POST route isn't yet covered by an explicit ADMIN matcher and instead falls through to the blanket `POST /api/**` rule... actually re-check: the blanket rule already grants ADMIN `hasAuthority("ADMIN")`, so ADMIN should already get through to 200 and the test should already pass once Task 5 is merged. Run it anyway to confirm current behavior before adding the explicit matcher, then proceed to Step 3 regardless — the explicit matcher is added for the same readability/grouping reason `POST /api/admin/cycles/*/close` and `POST /api/admin/sales` already have one, not because it's strictly load-bearing.

- [ ] **Step 3: Add the explicit matcher**

In `backend/src/main/java/com/plotchain/auth/SecurityConfig.java`, add directly after the existing block:

```java
                .requestMatchers(HttpMethod.POST, "/api/admin/cycles/*/close")
                    .hasAuthority("ADMIN")
```

insert:

```java
                // Wallet/withdrawal unit 1
                // (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
                // "POST /api/admin/cycles/{id}/credit-wallets, ADMIN-only"): same target-role-model
                // reasoning and first-match-wins placement as the cycle-close matcher directly
                // above -- not load-bearing on its own (the blanket POST rule below already
                // covers it), added for the same readability/grouping reason that matcher
                // documents.
                .requestMatchers(HttpMethod.POST, "/api/admin/cycles/*/credit-wallets")
                    .hasAuthority("ADMIN")
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && mvn test -Dtest=SecurityConfigTest#adminCyclesCreditWalletsIsReachableOnlyForAdminAndForbiddenForEveryOtherRole`
Expected: PASS for every `AssociateRole` value.

- [ ] **Step 5: Run the full `SecurityConfigTest` class to confirm no regression**

Run: `cd backend && mvn test -Dtest=SecurityConfigTest`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/auth/SecurityConfig.java backend/src/test/java/com/plotchain/auth/SecurityConfigTest.java
git commit -m "feat(wallet-withdrawal): restrict credit-wallets route to ADMIN"
```

---

## Task 7: Idempotency test (mid-batch failure rolls back, retry succeeds)

**Files:**
- Create: `backend/src/test/java/com/plotchain/wallet/WalletCreditingIdempotencyTest.java`

**Interfaces:**
- Consumes: `WalletCreditingService.creditWallets` (Task 4, real bean), `CycleRepository`/`AssociateRepository`/`LedgerEntryRepository`/`WalletRepository` (real beans, via full `@SpringBootTest` context).

- [ ] **Step 1: Write the test**

Create `backend/src/test/java/com/plotchain/wallet/WalletCreditingIdempotencyTest.java`:

```java
package com.plotchain.wallet;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

// Wallet/withdrawal unit 1's idempotency test (spec Testing section), mirroring Cycle Management's
// own CycleCloseRollbackTest/CycleCloseRealisticRetryIntegrationTest pattern: mock
// LedgerEntryRepository's save(...) to succeed for the first entry and throw for the second,
// forcing a failure AFTER associateA's wallet has already been credited -- uncommitted -- inside
// the same @Transactional creditWallets(...) call. CycleRepository, AssociateRepository, and
// WalletRepository stay real, so re-reading them afterward proves a genuine rollback (including
// the wallet credit that already executed before the throw), not just that a mock guaranteed no
// side effects.
@SpringBootTest
@ActiveProfiles("test")
class WalletCreditingIdempotencyTest {

    @Autowired WalletCreditingService walletCreditingService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired WalletRepository walletRepository;

    @MockBean LedgerEntryRepository ledgerEntryRepository;

    private UUID cycleId;
    private UUID associateAId;
    private UUID associateBId;

    @AfterEach
    void cleanUp() {
        if (associateAId != null) {
            walletRepository.deleteById(associateAId);
            associateRepository.deleteById(associateAId);
        }
        if (associateBId != null) {
            walletRepository.deleteById(associateBId);
            associateRepository.deleteById(associateBId);
        }
        if (cycleId != null) {
            cycleRepository.deleteById(cycleId);
        }
    }

    private UUID seedAssociate(String userId) {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setName(userId);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId(userId);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        associateRepository.saveAndFlush(associate);
        return id;
    }

    private UUID seedClosedCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.CLOSED);
        cycleRepository.saveAndFlush(cycle);
        return cycle.getId();
    }

    private LedgerEntry pendingEntry(UUID associateId, UUID cycleId, BigDecimal netAmount) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setAssociateId(associateId);
        entry.setCycleId(cycleId);
        entry.setNetAmount(netAmount);
        entry.setStatus(LedgerEntryStatus.PENDING);
        entry.setCreatedAt(Instant.now());
        return entry;
    }

    @Test
    void midBatchFailureRollsBackEveryWalletCreditThenARetryWithoutTheFaultSucceeds() {
        associateAId = seedAssociate("idem-a");
        associateBId = seedAssociate("idem-b");
        cycleId = seedClosedCycle();
        LedgerEntry entryA = pendingEntry(associateAId, cycleId, new BigDecimal("100.00"));
        LedgerEntry entryB = pendingEntry(associateBId, cycleId, new BigDecimal("50.00"));

        when(ledgerEntryRepository.findByCycleIdAndStatus(cycleId, LedgerEntryStatus.PENDING))
            .thenReturn(List.of(entryA, entryB));
        when(ledgerEntryRepository.save(entryA)).thenReturn(entryA);
        when(ledgerEntryRepository.save(entryB)).thenThrow(new RuntimeException("simulated mid-batch failure"));

        assertThatThrownBy(() -> walletCreditingService.creditWallets(cycleId)).isInstanceOf(RuntimeException.class);

        // --- Full rollback: cycle still CLOSED, no Wallet row for either associate (associateA's
        // wallet-create + creditBalance calls both executed before the throw, but were part of the
        // same rolled-back transaction). ---
        Cycle cycleAfterFailure = cycleRepository.findById(cycleId).orElseThrow();
        assertThat(cycleAfterFailure.getStatus()).isEqualTo(CycleStatus.CLOSED);
        assertThat(walletRepository.findById(associateAId)).isEmpty();
        assertThat(walletRepository.findById(associateBId)).isEmpty();

        // --- Retry: same fixture, fault removed. Not double-credited, since the failed attempt
        // left nothing committed to collide with. ---
        when(ledgerEntryRepository.save(entryB)).thenReturn(entryB);

        WalletCreditingResult result = walletCreditingService.creditWallets(cycleId);

        assertThat(result.entriesCredited()).isEqualTo(2);
        assertThat(result.totalAmountCredited()).isEqualByComparingTo("150.00");
        assertThat(result.newCycleStatus()).isEqualTo(CycleStatus.PAID);

        Cycle cycleAfterRetry = cycleRepository.findById(cycleId).orElseThrow();
        assertThat(cycleAfterRetry.getStatus()).isEqualTo(CycleStatus.PAID);
        assertThat(walletRepository.findById(associateAId).orElseThrow().getBalance()).isEqualByComparingTo("100.00");
        assertThat(walletRepository.findById(associateBId).orElseThrow().getBalance()).isEqualByComparingTo("50.00");
    }
}
```

- [ ] **Step 2: Run the test**

Run: `cd backend && mvn test -Dtest=WalletCreditingIdempotencyTest`
Expected: PASS. If it fails on the "full rollback" assertions, check that `WalletCreditingService.creditWallets` is annotated `@Transactional` (Task 4, Step 4) — without it, `associateA`'s wallet writes would commit independently before the exception propagates.

- [ ] **Step 3: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/test/java/com/plotchain/wallet/WalletCreditingIdempotencyTest.java
git commit -m "test(wallet-withdrawal): prove credit-wallets rolls back and retries cleanly"
```

---

## Task 8: Concurrency test (row-lock serialization)

**Files:**
- Create: `backend/src/test/java/com/plotchain/wallet/WalletCreditingConcurrencyTest.java`

**Interfaces:**
- Consumes: `WalletCreditingService.creditWallets` (Task 4, real bean), `CycleRepository.findByIdForUpdate` (existing, real), `AssociateRepository`/`LedgerEntryRepository`/`WalletRepository` (real beans).

- [ ] **Step 1: Write the test**

Create `backend/src/test/java/com/plotchain/wallet/WalletCreditingConcurrencyTest.java`:

```java
package com.plotchain.wallet;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CyclePayoutStateException;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.income.LedgerEntryStatus;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

// Wallet/withdrawal unit 1's concurrency test (spec Testing section), mirroring Cycle Management's
// own CycleCloseConcurrencyTest exactly: exercises the row-lock/serialization mechanism (Decision
// 2) directly against WalletCreditingService, using the real H2 (MODE=PostgreSQL) test datasource
// -- the behavior under test (SELECT ... FOR UPDATE blocking a second transaction until the first
// resolves) is a property of the database, not application code, so a mocked repository couldn't
// exercise it.
@SpringBootTest
@ActiveProfiles("test")
class WalletCreditingConcurrencyTest {

    @Autowired WalletCreditingService walletCreditingService;
    @Autowired CycleRepository cycleRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired WalletRepository walletRepository;
    @Autowired PlatformTransactionManager transactionManager;

    private UUID cycleId;
    private UUID associateId;

    @AfterEach
    void cleanUp() {
        if (cycleId != null) {
            ledgerEntryRepository.deleteAll(ledgerEntryRepository.findAll().stream()
                .filter(e -> cycleId.equals(e.getCycleId())).toList());
            cycleRepository.deleteById(cycleId);
        }
        if (associateId != null) {
            walletRepository.deleteById(associateId);
            associateRepository.deleteById(associateId);
        }
    }

    private UUID seedAssociate() {
        UUID id = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(id);
        associate.setName("Concurrency Test Associate");
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setJoinedAt(Instant.now());
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
        associate.setUserId("conc-" + id);
        associate.setEmail(id + "@test.local");
        associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
        associate.setRole(AssociateRole.ADMIN);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> associateRepository.saveAndFlush(associate));
        return id;
    }

    private UUID seedClosedCycleWithOnePendingEntry(UUID associateId, BigDecimal netAmount) {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.CLOSED);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> cycleRepository.saveAndFlush(cycle));

        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setAssociateId(associateId);
        entry.setCycleId(cycle.getId());
        entry.setNetAmount(netAmount);
        entry.setStatus(LedgerEntryStatus.PENDING);
        entry.setCreatedAt(Instant.now());
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> ledgerEntryRepository.saveAndFlush(entry));

        return cycle.getId();
    }

    private void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Test
    void secondCreditWalletsBlocksUntilFirstTransactionResolvesThenSucceedsIfStatusIsStillClosed() throws Exception {
        associateId = seedAssociate();
        cycleId = seedClosedCycleWithOnePendingEntry(associateId, new BigDecimal("75.00"));

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            cycleRepository.findByIdForUpdate(cycleId).orElseThrow();
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
            // No status change here -- stands in for a failed/abandoned first attempt, proving
            // the second caller's own lock-then-recheck succeeds against a still-CLOSED row.
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<WalletCreditingResult> second = pool.submit(() -> {
            events.add("second-calling");
            WalletCreditingResult response = walletCreditingService.creditWallets(cycleId);
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300); // give the second call time to attempt (and block on) the lock
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);
        WalletCreditingResult response = second.get(5, TimeUnit.SECONDS);

        assertThat(events).containsExactly("holder-locked", "second-calling", "second-returned");
        assertThat(response.newCycleStatus()).isEqualTo(CycleStatus.PAID);
        assertThat(response.entriesCredited()).isEqualTo(1);
        // Credited exactly once -- not doubled by the holder's own (non-crediting) lock hold.
        assertThat(walletRepository.findById(associateId).orElseThrow().getBalance()).isEqualByComparingTo("75.00");
        pool.shutdownNow();
    }

    @Test
    void secondCreditWalletsBlocksUntilFirstTransactionResolvesThenGets409IfFirstAlreadyCredited() throws Exception {
        associateId = seedAssociate();
        cycleId = seedClosedCycleWithOnePendingEntry(associateId, new BigDecimal("75.00"));

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            Cycle locked = cycleRepository.findByIdForUpdate(cycleId).orElseThrow();
            // Stands in for a first credit-wallets call that already completed successfully.
            locked.setStatus(CycleStatus.PAID);
            cycleRepository.save(locked);
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<WalletCreditingResult> second = pool.submit(() -> {
            events.add("second-calling");
            WalletCreditingResult response = walletCreditingService.creditWallets(cycleId);
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);

        assertThatThrownBy(second::get).hasCauseInstanceOf(CyclePayoutStateException.class);
        // The would-be-credited entry stays untouched -- no double-credit and no orphaned Wallet
        // row from the second (rejected) attempt.
        assertThat(walletRepository.findById(associateId)).isEmpty();
        pool.shutdownNow();
    }
}
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && mvn test -Dtest=WalletCreditingConcurrencyTest`
Expected: PASS (both tests). These are timing-sensitive but deterministic by construction (the `CountDownLatch` pair forces strict ordering, same as `CycleCloseConcurrencyTest`) — if either flakes, increase the `Thread.sleep(300)` window slightly rather than restructuring the synchronization.

- [ ] **Step 3: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/test/java/com/plotchain/wallet/WalletCreditingConcurrencyTest.java
git commit -m "test(wallet-withdrawal): prove credit-wallets serializes via the cycle row lock"
```

---

## Final verification

- [ ] Run the full targeted set once more to confirm nothing regressed across tasks:

```bash
cd backend && mvn test -Dtest=LedgerEntryRepositoryTest,WalletRepositoryTest,WalletCreditingServiceTest,CycleControllerTest,SecurityConfigTest,WalletCreditingIdempotencyTest,WalletCreditingConcurrencyTest
```

Expected: BUILD SUCCESS, all tests green. (Do not rely on a full unscoped `mvn test` run's aggregate pass/fail count in this environment — see Global Constraints re: the JDK21/25 Mockito mismatch producing unrelated spurious failures.)

- [ ] Confirm `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md`'s unit-1 row is updated by the coordinator (not this plan's own execution) once merged — per this project's own convention, marking units merged in the `-units.md` tracking file is the coordinator's job, not the implementer's.
