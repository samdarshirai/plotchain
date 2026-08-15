# KYC-Verification-Triggered Reconciliation Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `KycReviewService.decide()` transitions an associate to `VERIFIED`, automatically credit every `LedgerEntry` that associate has sitting in `CARRIED_FORWARD` (across any past cycle) into their `Wallet.balance`, flipping each entry to `PAID`. No sweep on a `REJECTED` decision. No new endpoint — this hooks into the existing KYC decision flow.

**Architecture:** `WalletCreditingService` (existing, `wallet` package, merged as unit 1) gains a second public method, `reconcileCarriedForward`, alongside the existing `creditWallets`. It reuses the exact same atomic `WalletRepository.creditBalance` + per-entry status-flip mechanism as `creditWallets`, driven by a new `LedgerEntryRepository.findByAssociateIdAndStatus` query (deliberately unscoped by `cycleId`). Unlike `creditWallets`, this method never touches `Cycle` at all — no row lock, no status read or write. `KycReviewService` (existing, `associate` package) gains a `WalletCreditingService` constructor dependency and calls the sweep from inside `decide()`'s existing `@Transactional` method, only on a `VERIFIED` decision, passing through the associate's id/userId and the KYC decision's own `actorId` so the sweep's audit entry is attributed correctly. This is the first cross-package call from `associate` into `wallet` in the codebase (Decision 16), but structurally no different from the many services that already call `SettingsAuditService`.

**Tech Stack:** Spring Boot 3 / Spring Data JPA, PostgreSQL (H2 `MODE=PostgreSQL` in tests), JUnit 5 + Mockito + AssertJ.

**Spec:** `docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md` (Decision 16; Data model — `ReconciliationResult`; Entity changes — `KycReviewService` gains a `WalletCreditingService` dependency; New repository methods — `LedgerEntryRepository.findByAssociateIdAndStatus`; Flow "KYC-verification-triggered reconciliation sweep"; Testing section — `KycReviewServiceTest` addition, `WalletCreditingServiceTest` addition). Unit slice detail: `docs/superpowers/plans/2026-08-04-wallet-withdrawal-units.md`, section "### 4."

## Global Constraints

- This is a backend-only, no-new-endpoint unit — no controller, no route, no `SecurityConfig` change. It hooks into `KycReviewService.decide()`, which is already ADMIN-only via `@PreAuthorize("hasAuthority('ADMIN')")` on `KycReviewController.decide()`; nothing here changes that.
- `WalletRepository.creditBalance(UUID, BigDecimal): int` (merged unit 1) is reused **unmodified** — do not add parameters or overloads to it.
- `Cycle.status` is never read or written by `reconcileCarriedForward` — no `CycleRepository` dependency, no row lock, regardless of which (possibly already-`PAID`) cycles the swept entries belonged to.
- The sweep query has **no `cycleId` filter**, deliberately: `LedgerEntryRepository.findByAssociateIdAndStatus(associateId, CARRIED_FORWARD)` must return entries from every cycle that associate has ever had one in.
- Audit entries from this sweep use `section = "wallet"` (not `"kyc"` — that section is already used by `decide()`'s own existing audit call, which stays as-is) and `actorId` = the same `actorId` `decide()` already receives from its caller. No audit entry is written when zero `CARRIED_FORWARD` entries are found — a true no-op, not an empty-detail audit row.
- `KycQueueEntryResponse`'s shape is unchanged — the sweep's return value (`ReconciliationResult`) is used only for internal/audit purposes, never serialized to any endpoint response.
- A JDK21/25 + Mockito mismatch in this environment produces ~55 unrelated spurious errors on a full `mvn test` run — expected and unrelated to this work; run scoped `-Dtest=...` commands per task instead of relying on the full suite's pass/fail count.
- `WalletCreditingConcurrencyTest` and `WalletCreditingIdempotencyTest` (both `@SpringBootTest`, `@Autowired WalletCreditingService`) need **no changes** — Spring autowires the new `SettingsAuditService` constructor dependency into the real bean automatically. Only the Mockito-based `WalletCreditingServiceTest`, which constructs `WalletCreditingService` by hand in every test method, needs its constructor call sites updated.

---

## File Structure

**Create:**
- `backend/src/main/java/com/plotchain/wallet/ReconciliationResult.java` — sweep's internal return-value record.

**Modify:**
- `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java` — add `findByAssociateIdAndStatus`.
- `backend/src/main/java/com/plotchain/wallet/WalletCreditingService.java` — add `SettingsAuditService` dependency + `reconcileCarriedForward` method.
- `backend/src/main/java/com/plotchain/associate/KycReviewService.java` — add `WalletCreditingService` dependency + sweep call in `decide()`.
- `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java` — add `findByAssociateIdAndStatus` tests.
- `backend/src/test/java/com/plotchain/wallet/WalletCreditingServiceTest.java` — add `SettingsAuditService` mock, update the 6 existing constructor call sites, add `reconcileCarriedForward` tests.
- `backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java` — add `WalletCreditingService` mock, update `setUp()`, add sweep-triggering tests.

---

## Task 1: `LedgerEntryRepository.findByAssociateIdAndStatus`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`
- Test: `backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java`

**Interfaces:**
- Produces: `LedgerEntryRepository.findByAssociateIdAndStatus(UUID associateId, LedgerEntryStatus status): List<LedgerEntry>` — consumed by Task 2's `WalletCreditingService.reconcileCarriedForward`.

- [ ] **Step 1: Write the failing test**

The file already has `seedAssociate()`, `seedCycle()`, and `newEntry(UUID associateId, UUID cycleId, IncomeType incomeType, UUID sourceRef)` helpers (used by the existing `findByCycleIdAndStatus` tests at the bottom of the file) — reuse them. Add these two tests immediately before the file's closing `}` (after `findByCycleIdAndStatusReturnsAnEmptyListWhenNothingMatches`):

```java
    // Wallet/withdrawal unit 4 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // Decision 16, New repository methods section): the KYC-triggered reconciliation sweep's one
    // read query -- every CARRIED_FORWARD entry for one associate, deliberately unscoped by
    // cycleId (unlike findByCycleIdAndStatus above). Proves entries in a DIFFERENT cycle for the
    // SAME associate are still found (the sweep must catch withheld income from any past cycle),
    // entries for a DIFFERENT associate are excluded even with a matching status, and a different
    // status for the same associate/cycle is excluded too.
    @Test
    void findByAssociateIdAndStatusReturnsEveryMatchingEntryForThatAssociateAcrossAnyCycle() {
        Associate targetAssociate = seedAssociate();
        Associate otherAssociate = seedAssociate();
        Cycle cycleOne = seedCycle();
        Cycle cycleTwo = seedCycle();

        LedgerEntry carriedForwardInCycleOne = newEntry(targetAssociate.getId(), cycleOne.getId(), IncomeType.DIRECT, UUID.randomUUID());
        carriedForwardInCycleOne.setStatus(LedgerEntryStatus.CARRIED_FORWARD);
        ledgerEntryRepository.saveAndFlush(carriedForwardInCycleOne);

        LedgerEntry carriedForwardInCycleTwo = newEntry(targetAssociate.getId(), cycleTwo.getId(), IncomeType.MATCHING, UUID.randomUUID());
        carriedForwardInCycleTwo.setStatus(LedgerEntryStatus.CARRIED_FORWARD);
        ledgerEntryRepository.saveAndFlush(carriedForwardInCycleTwo);

        LedgerEntry pendingForTargetAssociate = ledgerEntryRepository.saveAndFlush(
            newEntry(targetAssociate.getId(), cycleOne.getId(), IncomeType.SPONSOR_MATCHING, UUID.randomUUID()));

        LedgerEntry carriedForwardForOtherAssociate = newEntry(otherAssociate.getId(), cycleOne.getId(), IncomeType.DIRECT, UUID.randomUUID());
        carriedForwardForOtherAssociate.setStatus(LedgerEntryStatus.CARRIED_FORWARD);
        ledgerEntryRepository.saveAndFlush(carriedForwardForOtherAssociate);

        List<LedgerEntry> found = ledgerEntryRepository.findByAssociateIdAndStatus(targetAssociate.getId(), LedgerEntryStatus.CARRIED_FORWARD);

        assertThat(found).extracting(LedgerEntry::getId)
            .containsExactlyInAnyOrder(carriedForwardInCycleOne.getId(), carriedForwardInCycleTwo.getId());
        assertThat(pendingForTargetAssociate.getId()).isNotIn(found.stream().map(LedgerEntry::getId).toList());
    }

    @Test
    void findByAssociateIdAndStatusReturnsAnEmptyListWhenNothingMatches() {
        Associate associate = seedAssociate();

        assertThat(ledgerEntryRepository.findByAssociateIdAndStatus(associate.getId(), LedgerEntryStatus.CARRIED_FORWARD)).isEmpty();
    }
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && mvn test -Dtest=LedgerEntryRepositoryTest`
Expected: compile error — `findByAssociateIdAndStatus` does not exist on `LedgerEntryRepository`.

- [ ] **Step 3: Add the repository method**

In `backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java`, add directly after `findByCycleIdAndStatus` (before the `search` method):

```java

    // Wallet/withdrawal unit 4 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
    // Decision 16, New repository methods section): the KYC-triggered reconciliation sweep's one
    // read query -- every CARRIED_FORWARD entry for one associate, deliberately unscoped by
    // cycleId (unlike findByCycleIdAndStatus above), since a sweep must catch withheld income from
    // any past cycle, not just the associate's most recent one.
    List<LedgerEntry> findByAssociateIdAndStatus(UUID associateId, LedgerEntryStatus status);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=LedgerEntryRepositoryTest`
Expected: PASS (all methods in the file, including the two new ones).

- [ ] **Step 5: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/income/LedgerEntryRepository.java backend/src/test/java/com/plotchain/income/LedgerEntryRepositoryTest.java
git commit -m "feat(wallet-withdrawal): add LedgerEntryRepository.findByAssociateIdAndStatus"
```

---

## Task 2: `ReconciliationResult` + `WalletCreditingService.reconcileCarriedForward`

**Files:**
- Create: `backend/src/main/java/com/plotchain/wallet/ReconciliationResult.java`
- Modify: `backend/src/main/java/com/plotchain/wallet/WalletCreditingService.java`
- Modify: `backend/src/test/java/com/plotchain/wallet/WalletCreditingServiceTest.java`

**Interfaces:**
- Consumes: `LedgerEntryRepository.findByAssociateIdAndStatus` (Task 1), `WalletRepository.creditBalance`/`existsById`/`save` (existing, unit 1), `Wallet.zero(UUID)` (existing), `SettingsAuditService.record(String section, String summary, Object detail, UUID actorId)` (existing, `company` package).
- Produces: `WalletCreditingService.reconcileCarriedForward(UUID associateId, String associateUserId, UUID actorId): ReconciliationResult` — consumed by Task 3's `KycReviewService.decide()`. `ReconciliationResult(UUID associateId, int entriesCredited, BigDecimal totalAmountCredited)`. The `associateUserId` parameter exists because `WalletCreditingService` has no `AssociateRepository` dependency of its own (and unit 1 never needed one) — the caller (`KycReviewService`, which already has the loaded `Associate`) passes the display name straight through for the audit message rather than this service doing a redundant lookup.

- [ ] **Step 1: Write the failing tests**

Create `backend/src/main/java/com/plotchain/wallet/ReconciliationResult.java` first so the test file compiles against it:

```java
package com.plotchain.wallet;

import java.math.BigDecimal;
import java.util.UUID;

public record ReconciliationResult(UUID associateId, int entriesCredited, BigDecimal totalAmountCredited) {
}
```

Now replace `backend/src/test/java/com/plotchain/wallet/WalletCreditingServiceTest.java` in full:

```java
package com.plotchain.wallet;

import com.plotchain.company.SettingsAuditService;
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
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WalletCreditingServiceTest {

    @Mock CycleRepository cycleRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock WalletRepository walletRepository;
    @Mock SettingsAuditService settingsAuditService;

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

    private LedgerEntry carriedForwardEntry(UUID associateId, UUID cycleId, BigDecimal netAmount) {
        LedgerEntry entry = new LedgerEntry();
        entry.setId(UUID.randomUUID());
        entry.setAssociateId(associateId);
        entry.setCycleId(cycleId);
        entry.setNetAmount(netAmount);
        entry.setStatus(LedgerEntryStatus.CARRIED_FORWARD);
        entry.setCreatedAt(Instant.now());
        return entry;
    }

    @Test
    void creditsEveryPendingEntryAcrossMultipleAssociatesAndFlipsEntriesAndCycleToPaid() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
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
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
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
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
        UUID cycleId = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(newCycle(cycleId, CycleStatus.PAID)));

        assertThatThrownBy(() -> service.creditWallets(cycleId)).isInstanceOf(CyclePayoutStateException.class);

        verify(ledgerEntryRepository, never()).findByCycleIdAndStatus(any(), any());
        verify(walletRepository, never()).creditBalance(any(), any());
    }

    @Test
    void creditingAnOpenCycleThrowsCyclePayoutStateException() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
        UUID cycleId = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(newCycle(cycleId, CycleStatus.OPEN)));

        assertThatThrownBy(() -> service.creditWallets(cycleId)).isInstanceOf(CyclePayoutStateException.class);
    }

    @Test
    void creditingACalculatingCycleThrowsCyclePayoutStateException() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
        UUID cycleId = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.of(newCycle(cycleId, CycleStatus.CALCULATING)));

        assertThatThrownBy(() -> service.creditWallets(cycleId)).isInstanceOf(CyclePayoutStateException.class);
    }

    @Test
    void creditingAnUnknownCycleThrowsCycleNotFoundException() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
        UUID cycleId = UUID.randomUUID();
        when(cycleRepository.findByIdForUpdate(cycleId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.creditWallets(cycleId)).isInstanceOf(CycleNotFoundException.class);
    }

    // --- Wallet/withdrawal unit 4 (Decision 16): reconcileCarriedForward ---

    @Test
    void reconcileCarriedForwardCreditsEntriesAcrossMultipleCyclesInASingleCallAndNeverTouchesCycle() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
        UUID associateId = UUID.randomUUID();
        UUID cycleOneId = UUID.randomUUID();
        UUID cycleTwoId = UUID.randomUUID();
        LedgerEntry entryFromCycleOne = carriedForwardEntry(associateId, cycleOneId, new BigDecimal("40.00"));
        LedgerEntry entryFromCycleTwo = carriedForwardEntry(associateId, cycleTwoId, new BigDecimal("60.00"));
        when(ledgerEntryRepository.findByAssociateIdAndStatus(associateId, LedgerEntryStatus.CARRIED_FORWARD))
            .thenReturn(List.of(entryFromCycleOne, entryFromCycleTwo));
        when(walletRepository.existsById(associateId)).thenReturn(true);

        ReconciliationResult result = service.reconcileCarriedForward(associateId, "VP00099", UUID.randomUUID());

        verify(walletRepository).creditBalance(associateId, new BigDecimal("40.00"));
        verify(walletRepository).creditBalance(associateId, new BigDecimal("60.00"));
        assertThat(entryFromCycleOne.getStatus()).isEqualTo(LedgerEntryStatus.PAID);
        assertThat(entryFromCycleTwo.getStatus()).isEqualTo(LedgerEntryStatus.PAID);
        verify(ledgerEntryRepository).save(entryFromCycleOne);
        verify(ledgerEntryRepository).save(entryFromCycleTwo);
        // Never touches Cycle at all -- no row lock, no status read, no status write, regardless
        // of which (possibly already-PAID) cycles these entries came from.
        verify(cycleRepository, never()).findByIdForUpdate(any());
        verify(cycleRepository, never()).save(any());

        assertThat(result.associateId()).isEqualTo(associateId);
        assertThat(result.entriesCredited()).isEqualTo(2);
        assertThat(result.totalAmountCredited()).isEqualByComparingTo("100.00");
    }

    @Test
    void reconcileCarriedForwardCreatesAWalletRowWhenTheAssociateHasNoPriorOne() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
        UUID associateId = UUID.randomUUID();
        LedgerEntry entry = carriedForwardEntry(associateId, UUID.randomUUID(), new BigDecimal("25.00"));
        when(ledgerEntryRepository.findByAssociateIdAndStatus(associateId, LedgerEntryStatus.CARRIED_FORWARD))
            .thenReturn(List.of(entry));
        when(walletRepository.existsById(associateId)).thenReturn(false);

        service.reconcileCarriedForward(associateId, "VP00099", UUID.randomUUID());

        ArgumentCaptor<Wallet> walletCaptor = ArgumentCaptor.forClass(Wallet.class);
        verify(walletRepository, times(1)).save(walletCaptor.capture());
        assertThat(walletCaptor.getValue().getAssociateId()).isEqualTo(associateId);
        verify(walletRepository).creditBalance(associateId, new BigDecimal("25.00"));
    }

    @Test
    void reconcileCarriedForwardIsANoOpWithNoAuditEntryWhenNothingIsCarriedForward() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
        UUID associateId = UUID.randomUUID();
        when(ledgerEntryRepository.findByAssociateIdAndStatus(associateId, LedgerEntryStatus.CARRIED_FORWARD))
            .thenReturn(List.of());

        ReconciliationResult result = service.reconcileCarriedForward(associateId, "VP00099", UUID.randomUUID());

        assertThat(result.entriesCredited()).isZero();
        assertThat(result.totalAmountCredited()).isEqualByComparingTo("0");
        verify(walletRepository, never()).creditBalance(any(), any());
        verify(walletRepository, never()).save(any());
        verify(settingsAuditService, never()).record(any(), any(), any(), any());
    }

    @Test
    void runningReconcileCarriedForwardTwiceInARowFindsNothingLeftTheSecondTime() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
        UUID associateId = UUID.randomUUID();
        LedgerEntry entry = carriedForwardEntry(associateId, UUID.randomUUID(), new BigDecimal("30.00"));
        // First call finds one CARRIED_FORWARD entry; the second stubbed return value (empty)
        // simulates the DB state after the first call committed the entry's flip to PAID -- the
        // exact "already gone" state a real second invocation would see.
        when(ledgerEntryRepository.findByAssociateIdAndStatus(associateId, LedgerEntryStatus.CARRIED_FORWARD))
            .thenReturn(List.of(entry), List.of());
        when(walletRepository.existsById(associateId)).thenReturn(true);

        ReconciliationResult first = service.reconcileCarriedForward(associateId, "VP00099", UUID.randomUUID());
        ReconciliationResult second = service.reconcileCarriedForward(associateId, "VP00099", UUID.randomUUID());

        assertThat(first.entriesCredited()).isEqualTo(1);
        assertThat(second.entriesCredited()).isZero();
        verify(walletRepository, times(1)).creditBalance(associateId, new BigDecimal("30.00"));
    }

    @Test
    void reconcileCarriedForwardRecordsAnAuditEntryUnderTheWalletSectionAttributedToTheKycActor() {
        service = new WalletCreditingService(cycleRepository, ledgerEntryRepository, walletRepository, settingsAuditService);
        UUID associateId = UUID.randomUUID();
        UUID actorId = UUID.randomUUID();
        LedgerEntry entry = carriedForwardEntry(associateId, UUID.randomUUID(), new BigDecimal("15.00"));
        when(ledgerEntryRepository.findByAssociateIdAndStatus(associateId, LedgerEntryStatus.CARRIED_FORWARD))
            .thenReturn(List.of(entry));
        when(walletRepository.existsById(associateId)).thenReturn(true);

        service.reconcileCarriedForward(associateId, "VP00042", actorId);

        ArgumentCaptor<String> sectionCaptor = ArgumentCaptor.forClass(String.class);
        ArgumentCaptor<String> summaryCaptor = ArgumentCaptor.forClass(String.class);
        verify(settingsAuditService).record(sectionCaptor.capture(), summaryCaptor.capture(), any(), eq(actorId));
        assertThat(sectionCaptor.getValue()).isEqualTo("wallet");
        assertThat(summaryCaptor.getValue()).contains("VP00042");
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn test -Dtest=WalletCreditingServiceTest`
Expected: compile error — `reconcileCarriedForward` does not exist on `WalletCreditingService`, and the constructor doesn't yet accept a fourth `SettingsAuditService` argument.

- [ ] **Step 3: Add the `SettingsAuditService` dependency and `reconcileCarriedForward` method**

Replace `backend/src/main/java/com/plotchain/wallet/WalletCreditingService.java` in full:

```java
package com.plotchain.wallet;

import com.plotchain.company.SettingsAuditService;
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
import java.util.Map;
import java.util.UUID;

// Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 1, Flow "Wallet crediting"): a separate admin-triggered step from Cycle Management's
// settlement close, deliberately in the wallet package even though it's invoked from a
// cycle-scoped URL (CycleController) -- the logic's job (read LedgerEntry, write Wallet.balance)
// is a wallet-domain concern. Unit 4 (Decision 16) adds a second entry point,
// reconcileCarriedForward, invoked from KycReviewService.decide() rather than an HTTP endpoint --
// the same atomic creditBalance + per-entry status-flip mechanism, reused unmodified.
@Service
public class WalletCreditingService {

    private final CycleRepository cycleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final WalletRepository walletRepository;
    private final SettingsAuditService settingsAuditService;

    public WalletCreditingService(
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        WalletRepository walletRepository,
        SettingsAuditService settingsAuditService
    ) {
        this.cycleRepository = cycleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.walletRepository = walletRepository;
        this.settingsAuditService = settingsAuditService;
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

    // Wallet/withdrawal unit 4 (Decision 16, Flow "KYC-verification-triggered reconciliation
    // sweep"): invoked from KycReviewService.decide()'s VERIFIED branch only -- no cycleId filter,
    // deliberately unscoped, since withheld income can span any number of past cycles (including
    // ones already PAID for every other associate). Cycle.status is never read or written here --
    // no CycleRepository call at all, matching Decision 16's "never reopen a closed cycle"
    // requirement. associateUserId/actorId are passed straight through by the caller
    // (KycReviewService already has both in scope from its own lookup and its own actorId
    // parameter) rather than adding an AssociateRepository dependency to this package just to
    // resolve a display name for the audit message.
    @Transactional
    public ReconciliationResult reconcileCarriedForward(UUID associateId, String associateUserId, UUID actorId) {
        List<LedgerEntry> entries = ledgerEntryRepository.findByAssociateIdAndStatus(associateId, LedgerEntryStatus.CARRIED_FORWARD);

        BigDecimal totalCredited = BigDecimal.ZERO;
        for (LedgerEntry entry : entries) {
            // Same "create a Wallet row for a first-time associate" guard as creditWallets above
            // -- an associate whose only income was ever CARRIED_FORWARD (never had a PENDING
            // entry credited before now) may not have a Wallet row yet.
            if (!walletRepository.existsById(associateId)) {
                walletRepository.save(Wallet.zero(associateId));
            }
            walletRepository.creditBalance(associateId, entry.getNetAmount());

            entry.setStatus(LedgerEntryStatus.PAID);
            ledgerEntryRepository.save(entry);

            totalCredited = totalCredited.add(entry.getNetAmount());
        }

        // Zero CARRIED_FORWARD entries is the common case -- most associates verify KYC before
        // ever having withheld income. That's a true no-op: no wallet mutation, and (per this
        // guard) no audit entry either, not an empty-detail audit row logged for nothing.
        if (!entries.isEmpty()) {
            settingsAuditService.record("wallet",
                "Reconciled " + entries.size() + " carried-forward entries for " + associateUserId + " after KYC verification",
                Map.of("entriesCredited", entries.size(), "totalAmount", totalCredited),
                actorId);
        }

        return new ReconciliationResult(associateId, entries.size(), totalCredited);
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=WalletCreditingServiceTest`
Expected: PASS (all 12 tests — 6 existing `creditWallets` tests + 6 new `reconcileCarriedForward` tests).

- [ ] **Step 5: Confirm the existing integration tests still pass unmodified**

Run: `cd backend && mvn test -Dtest=WalletCreditingIdempotencyTest,WalletCreditingConcurrencyTest`
Expected: PASS with no source changes to either file — both are `@SpringBootTest`s that `@Autowired WalletCreditingService`, so Spring wires the real `SettingsAuditService` bean into the constructor automatically.

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/wallet/ReconciliationResult.java backend/src/main/java/com/plotchain/wallet/WalletCreditingService.java backend/src/test/java/com/plotchain/wallet/WalletCreditingServiceTest.java
git commit -m "feat(wallet-withdrawal): add WalletCreditingService.reconcileCarriedForward"
```

---

## Task 3: `KycReviewService.decide()` calls the sweep on `VERIFIED`

**Files:**
- Modify: `backend/src/main/java/com/plotchain/associate/KycReviewService.java`
- Modify: `backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java`

**Interfaces:**
- Consumes: `WalletCreditingService.reconcileCarriedForward(UUID, String, UUID): ReconciliationResult` (Task 2).
- Produces: no new public method — `KycReviewService.decide(UUID associateId, KycDecisionRequest request, UUID actorId): KycQueueEntryResponse` keeps its existing signature and return shape; a `VERIFIED` decision now has the side effect of invoking the sweep.

- [ ] **Step 1: Write the failing tests**

Replace `backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java` in full:

```java
package com.plotchain.associate;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.plotchain.company.SettingsAuditLog;
import com.plotchain.company.SettingsAuditLogRepository;
import com.plotchain.company.SettingsAuditService;
import com.plotchain.wallet.WalletCreditingService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class KycReviewServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock SettingsAuditLogRepository settingsAuditLogRepository;
    @Mock WalletCreditingService walletCreditingService;

    KycReviewService service;
    private static final UUID ACTOR_ID = UUID.randomUUID();

    @BeforeEach
    void setUp() {
        SettingsAuditService settingsAuditService = new SettingsAuditService(
            settingsAuditLogRepository, associateRepository, new ObjectMapper().findAndRegisterModules());
        service = new KycReviewService(associateRepository, settingsAuditService, walletCreditingService);
    }

    private Associate newAssociate(UUID id, String userId, KycStatus kycStatus) {
        Associate a = new Associate();
        a.setId(id);
        a.setUserId(userId);
        a.setName("Jane Doe");
        a.setRole(AssociateRole.ASSOCIATE);
        a.setKycStatus(kycStatus);
        a.setJoinedAt(Instant.now());
        return a;
    }

    @Test
    void listReturnsAPageOfEntriesForTheGivenStatus() {
        Associate associate = newAssociate(UUID.randomUUID(), "VP00001", KycStatus.PENDING);
        when(associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(
            AssociateRole.ASSOCIATE, KycStatus.PENDING, PageRequest.of(0, 20)))
            .thenReturn(new PageImpl<>(List.of(associate), PageRequest.of(0, 20), 1));

        KycPageResponse response = service.list(KycStatus.PENDING, 0, 20);

        assertThat(response.entries()).hasSize(1);
        assertThat(response.entries().get(0).userId()).isEqualTo("VP00001");
    }

    @Test
    void decideApprovesAndRecordsAudit() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        KycQueueEntryResponse response = service.decide(id, new KycDecisionRequest(KycStatus.VERIFIED, null), ACTOR_ID);

        assertThat(associate.getKycStatus()).isEqualTo(KycStatus.VERIFIED);
        assertThat(response.kycStatus()).isEqualTo(KycStatus.VERIFIED);
        verify(associateRepository).save(associate);

        ArgumentCaptor<SettingsAuditLog> captor = ArgumentCaptor.forClass(SettingsAuditLog.class);
        verify(settingsAuditLogRepository).save(captor.capture());
        assertThat(captor.getValue().getSection()).isEqualTo("kyc");
    }

    @Test
    void decideRejectsWithoutAReasonThrows() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, ""), ACTOR_ID))
            .isInstanceOf(InvalidKycDecisionException.class);
        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, null), ACTOR_ID))
            .isInstanceOf(InvalidKycDecisionException.class);
    }

    @Test
    void decideWithReasonAcceptsRejection() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        KycQueueEntryResponse response =
            service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, "Blurry PAN photo"), ACTOR_ID);

        assertThat(response.kycStatus()).isEqualTo(KycStatus.REJECTED);
    }

    @Test
    void decideRejectsAPendingDecisionValue() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.PENDING, null), ACTOR_ID))
            .isInstanceOf(InvalidKycDecisionException.class);
    }

    @Test
    void decideThrowsWhenAssociateNotFound() {
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.VERIFIED, null), ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void decideThrowsAssociateNotFoundEvenWhenDecisionIsAlsoInvalid() {
        // Precedence check: when BOTH the associateId is bogus AND the decision body is
        // invalid (PENDING is never a valid decision value), the lookup runs first, so the
        // associate-not-found case wins -- callers see 404, not 400. This locks in the
        // lookup-first ordering (see KycReviewService.decide) against ever silently flipping
        // back to validate-first, which none of the other tests here would catch.
        UUID id = UUID.randomUUID();
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.decide(id, new KycDecisionRequest(KycStatus.PENDING, null), ACTOR_ID))
            .isInstanceOf(AssociateNotFoundException.class);
    }

    @Test
    void countsReturnsCountsPerStatus() {
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING)).thenReturn(3L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED)).thenReturn(10L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)).thenReturn(2L);

        KycCountsResponse response = service.counts();

        assertThat(response.pending()).isEqualTo(3L);
        assertThat(response.verified()).isEqualTo(10L);
        assertThat(response.rejected()).isEqualTo(2L);
    }

    // --- Wallet/withdrawal unit 4 (Decision 16): reconciliation sweep triggered on VERIFIED ---

    @Test
    void decideVerifiedTriggersTheReconciliationSweepWithTheAssociatesIdentityAndTheKycActor() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        service.decide(id, new KycDecisionRequest(KycStatus.VERIFIED, null), ACTOR_ID);

        verify(walletCreditingService).reconcileCarriedForward(id, "VP00001", ACTOR_ID);
    }

    @Test
    void decideRejectedNeverTriggersTheReconciliationSweep() {
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        service.decide(id, new KycDecisionRequest(KycStatus.REJECTED, "Blurry PAN photo"), ACTOR_ID);

        verify(walletCreditingService, never()).reconcileCarriedForward(any(), any(), any());
    }

    @Test
    void decideStillSucceedsAndReturnsTheUnchangedResponseShapeWhenTheSweepIsANoOp() {
        // walletCreditingService is a mock here -- its own no-op behavior for zero CARRIED_FORWARD
        // entries is proven by WalletCreditingServiceTest, not re-proven here. This test locks in
        // the KycReviewService side of the contract: calling the sweep must never change decide()'s
        // own return shape or throw, regardless of what the sweep finds.
        UUID id = UUID.randomUUID();
        Associate associate = newAssociate(id, "VP00001", KycStatus.PENDING);
        when(associateRepository.findByIdAndRole(id, AssociateRole.ASSOCIATE)).thenReturn(Optional.of(associate));

        KycQueueEntryResponse response = service.decide(id, new KycDecisionRequest(KycStatus.VERIFIED, null), ACTOR_ID);

        assertThat(response.id()).isEqualTo(id);
        assertThat(response.userId()).isEqualTo("VP00001");
        assertThat(response.kycStatus()).isEqualTo(KycStatus.VERIFIED);
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && mvn test -Dtest=KycReviewServiceTest`
Expected: compile error — `KycReviewService`'s constructor doesn't yet accept a `WalletCreditingService` third argument.

- [ ] **Step 3: Wire the dependency and the sweep call**

Replace `backend/src/main/java/com/plotchain/associate/KycReviewService.java` in full:

```java
package com.plotchain.associate;

import com.plotchain.company.SettingsAuditService;
import com.plotchain.wallet.WalletCreditingService;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@Service
public class KycReviewService {

    private final AssociateRepository associateRepository;
    private final SettingsAuditService settingsAuditService;
    private final WalletCreditingService walletCreditingService;

    public KycReviewService(AssociateRepository associateRepository, SettingsAuditService settingsAuditService,
                             WalletCreditingService walletCreditingService) {
        this.associateRepository = associateRepository;
        this.settingsAuditService = settingsAuditService;
        this.walletCreditingService = walletCreditingService;
    }

    public KycPageResponse list(KycStatus status, int page, int size) {
        Page<Associate> result = associateRepository.findByRoleAndKycStatusOrderByJoinedAtAsc(
            AssociateRole.ASSOCIATE, status, PageRequest.of(page, size));
        List<KycQueueEntryResponse> entries = result.getContent().stream().map(KycReviewService::toEntry).toList();
        return new KycPageResponse(entries, page, size, result.getTotalElements());
    }

    @Transactional
    public KycQueueEntryResponse decide(UUID associateId, KycDecisionRequest request, UUID actorId) {
        // Look up the associate before validating the decision body, matching the
        // findOrThrow-first pattern used by AdminAssociateService.suspend/reactivate/
        // resetPassword: an unknown associateId should surface as AssociateNotFoundException
        // regardless of what the (possibly also invalid) request body contains.
        Associate associate = associateRepository.findByIdAndRole(associateId, AssociateRole.ASSOCIATE)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        if (request.decision() != KycStatus.VERIFIED && request.decision() != KycStatus.REJECTED) {
            throw new InvalidKycDecisionException("decision must be VERIFIED or REJECTED");
        }
        if (request.decision() == KycStatus.REJECTED && (request.reason() == null || request.reason().isBlank())) {
            throw new InvalidKycDecisionException("reason is required when rejecting");
        }

        associate.setKycStatus(request.decision());
        associateRepository.save(associate);

        settingsAuditService.record("kyc",
            "KYC " + request.decision().name() + " for " + associate.getUserId(),
            Map.of("decision", request.decision().name(), "reason", request.reason() == null ? "" : request.reason()),
            actorId);

        // Wallet/withdrawal unit 4 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
        // Decision 16): a VERIFIED decision triggers the reconciliation sweep for any
        // CARRIED_FORWARD entries this associate has withheld across any past cycle -- no sweep
        // on REJECTED. Cross-package call from associate into wallet, the first one in this
        // direction in the codebase, structurally no different from the many services that
        // already call settingsAuditService. Does not affect this method's return value or
        // transaction outcome beyond the sweep's own wallet/ledger-entry writes, which run inside
        // this same @Transactional method.
        if (request.decision() == KycStatus.VERIFIED) {
            walletCreditingService.reconcileCarriedForward(associate.getId(), associate.getUserId(), actorId);
        }

        return toEntry(associate);
    }

    public KycCountsResponse counts() {
        return new KycCountsResponse(
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)
        );
    }

    private static KycQueueEntryResponse toEntry(Associate a) {
        return new KycQueueEntryResponse(a.getId(), a.getUserId(), a.getName(), a.getKycStatus(), a.getJoinedAt());
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && mvn test -Dtest=KycReviewServiceTest`
Expected: PASS (all 12 tests — 9 existing + 3 new).

- [ ] **Step 5: Run the full KYC controller test to confirm no regression from the constructor change**

Run: `cd backend && mvn test -Dtest=KycReviewControllerTest`
Expected: PASS. (This is a `@WebMvcTest`/MockMvc test that `@MockBean`s `KycReviewService` directly, so it's unaffected by the constructor signature change — this step just confirms that assumption holds.)

- [ ] **Step 6: Commit**

```bash
cd /Users/ronalisenapati/Ronali/plotchain
git add backend/src/main/java/com/plotchain/associate/KycReviewService.java backend/src/test/java/com/plotchain/associate/KycReviewServiceTest.java
git commit -m "feat(wallet-withdrawal): KycReviewService triggers reconciliation sweep on VERIFIED"
```

---

## Final verification

- [ ] Run the full set of touched test classes together:

Run: `cd backend && mvn test -Dtest=LedgerEntryRepositoryTest,WalletCreditingServiceTest,WalletCreditingIdempotencyTest,WalletCreditingConcurrencyTest,KycReviewServiceTest,KycReviewControllerTest`
Expected: PASS across all six classes.

- [ ] Confirm the full build still compiles (ignore pre-existing unrelated Mockito/JDK spurious failures per Global Constraints):

Run: `cd backend && mvn compile`
Expected: BUILD SUCCESS.
