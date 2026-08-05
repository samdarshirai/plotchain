package com.plotchain.cycle;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

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

// Exercises the row-lock/serialization mechanism (Decision #2 of
// docs/superpowers/specs/role-capability/2026-08-03-cycle-management-domain-design.md) directly
// against CycleService, using the real H2 (MODE=PostgreSQL) test datasource -- the behavior
// under test is a property of the database (SELECT ... FOR UPDATE blocking a second transaction
// until the first resolves), not application code, so a mocked repository couldn't exercise it.
//
// Cycle-management unit 4 (the settlement batch) doesn't exist yet, so nothing in this codebase
// currently writes CLOSED/PAID. The second test below manually flips status inside the "holder"
// transaction to stand in for what unit 4 will eventually do at commit time, so the
// blocks-then-409 path can be proven now instead of waiting on unit 4 to exist.
@SpringBootTest
@ActiveProfiles("test")
class CycleCloseConcurrencyTest {

    @Autowired CycleService cycleService;
    @Autowired CycleRepository cycleRepository;
    @Autowired PlatformTransactionManager transactionManager;

    private UUID cycleId;

    @AfterEach
    void cleanUp() {
        if (cycleId != null) {
            cycleRepository.deleteById(cycleId);
        }
    }

    private UUID seedOpenCycle() {
        Cycle cycle = new Cycle();
        cycle.setId(UUID.randomUUID());
        cycle.setPeriodStart(LocalDate.of(2026, 7, 1));
        cycle.setPeriodEnd(LocalDate.of(2026, 7, 15));
        cycle.setStatus(CycleStatus.OPEN);
        new TransactionTemplate(transactionManager).executeWithoutResult(status -> cycleRepository.saveAndFlush(cycle));
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
    void secondCloseBlocksUntilFirstTransactionResolvesThenSucceedsIfStatusIsStillOpen() throws Exception {
        cycleId = seedOpenCycle();

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
            // Transaction commits when this lambda returns, releasing the row lock. No status
            // change here: this stands in for a failed/abandoned first attempt (Decision #3),
            // proving the second caller's own lock-then-recheck succeeds against a still-OPEN row.
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<CycleCloseResponse> second = pool.submit(() -> {
            events.add("second-calling");
            CycleCloseResponse response = cycleService.close(cycleId);
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300); // give the second call time to attempt (and block on) the lock
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);
        CycleCloseResponse response = second.get(5, TimeUnit.SECONDS);

        assertThat(events).containsExactly("holder-locked", "second-calling", "second-returned");
        assertThat(response.status()).isEqualTo(CycleStatus.OPEN);
        pool.shutdownNow();
    }

    @Test
    void secondCloseBlocksUntilFirstTransactionResolvesThenGets409IfFirstClosedTheCycle() throws Exception {
        cycleId = seedOpenCycle();

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            Cycle locked = cycleRepository.findByIdForUpdate(cycleId).orElseThrow();
            // Stands in for unit 4's future CALCULATING -> CLOSED flip at the end of a
            // successful settlement batch, which doesn't exist yet in this codebase.
            locked.setStatus(CycleStatus.CLOSED);
            cycleRepository.save(locked);
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<CycleCloseResponse> second = pool.submit(() -> {
            events.add("second-calling");
            CycleCloseResponse response = cycleService.close(cycleId);
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);

        assertThatThrownBy(second::get).hasCauseInstanceOf(CycleAlreadyClosedException.class);
        pool.shutdownNow();
    }
}
