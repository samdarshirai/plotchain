package com.plotchain.wallet;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CyclePayoutStateException;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
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
        // Real LedgerEntryRepository persistence in this test (unlike WalletCreditingIdempotencyTest's
        // mocked one) hits ledger_entry's NOT NULL constraints on incomeType/grossAmount/
        // tdsDeduction/adminDeduction -- these aren't otherwise relevant to what this test proves
        // (row-lock serialization), so gross == net and zero deductions is the simplest valid fixture.
        entry.setIncomeType(IncomeType.DIRECT);
        entry.setGrossAmount(netAmount);
        entry.setTdsDeduction(BigDecimal.ZERO);
        entry.setAdminDeduction(BigDecimal.ZERO);
        entry.setNetAmount(netAmount);
        // source_ref carries a DB-level NOT NULL (V17 migration) even though the entity itself
        // doesn't declare nullable=false -- same gap LedgerEntryRepositoryTest's own
        // notNullConstraintRejectsANullSourceRef proves. Any UUID satisfies it here; this test
        // doesn't exercise sourceRef-based lookups.
        entry.setSourceRef(UUID.randomUUID());
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
