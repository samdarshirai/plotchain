package com.plotchain.sales;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.income.LedgerEntry;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.projects.Plot;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.projects.PlotType;
import com.plotchain.projects.Project;
import com.plotchain.projects.ProjectRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.math.BigDecimal;
import java.time.Instant;
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

// Exercises the row-lock/serialization mechanism added to fix a code-review finding (pre-merge
// review of sales unit 3): SaleService.recordSale read Plot via a plain unlocked findById before
// checking status == AVAILABLE and flipping it to SOLD, so two concurrent POST
// /api/admin/sales requests against the same plot could both pass the guard before either
// committed -- a double-sold plot and a double-credited Direct Income ledger entry. Uses the real
// H2 (MODE=PostgreSQL) test datasource, same as CycleCloseConcurrencyTest (cycle-management unit
// 3's equivalent fix) -- the behavior under test is a property of the database (SELECT ... FOR
// UPDATE blocking a second transaction until the first resolves), not application code, so a
// mocked repository couldn't exercise it.
//
// Mirrors CycleCloseConcurrencyTest's structure: the "holder" thread acquires the row lock and
// manually flips (or doesn't flip) Plot status inside its own transaction, standing in for what a
// real concurrent recordSale call would do at commit time, so both branches -- "second call
// proceeds once the row is still AVAILABLE" and "second call gets PlotNotAvailableException once
// the row was sold" -- can be proven directly against SaleService.recordSale without needing a
// second real caller under precise timing control.
@SpringBootTest
@ActiveProfiles("test")
class SaleRecordConcurrencyTest {

    @Autowired SaleService saleService;
    @Autowired PlotRepository plotRepository;
    @Autowired ProjectRepository projectRepository;
    @Autowired AssociateRepository associateRepository;
    @Autowired SaleRepository saleRepository;
    @Autowired LedgerEntryRepository ledgerEntryRepository;
    @Autowired PlatformTransactionManager transactionManager;

    private UUID plotId;
    private UUID projectId;
    private UUID associateId;

    @AfterEach
    void cleanUp() {
        // Delete child rows first: the "succeeds" test lets a real recordSale() commit a Sale
        // (FK -> plot, associate) and a LedgerEntry (FK -> associate), which must go before
        // their parents.
        if (associateId != null) {
            List<com.plotchain.sales.Sale> sales = saleRepository.findAll().stream()
                .filter(sale -> associateId.equals(sale.getAssociateId())).toList();
            saleRepository.deleteAll(sales);
            List<LedgerEntry> ledgerEntries = ledgerEntryRepository.findAll().stream()
                .filter(entry -> associateId.equals(entry.getAssociateId())).toList();
            ledgerEntryRepository.deleteAll(ledgerEntries);
        }
        if (plotId != null) {
            plotRepository.deleteById(plotId);
        }
        if (projectId != null) {
            projectRepository.deleteById(projectId);
        }
        if (associateId != null) {
            associateRepository.deleteById(associateId);
        }
    }

    private UUID seedAvailablePlot() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        return tx.execute(status -> {
            Project project = new Project(UUID.randomUUID(), "Green Valley", "Hyderabad", null, null, Instant.now());
            projectRepository.saveAndFlush(project);
            projectId = project.getId();

            Plot plot = new Plot(UUID.randomUUID(), project.getId(), "A-101", PlotType.NORMAL,
                new BigDecimal("1200.00"), new BigDecimal("500.00"), new BigDecimal("600000.00"),
                PlotStatus.AVAILABLE);
            plotRepository.saveAndFlush(plot);
            return plot.getId();
        });
    }

    private UUID seedAssociate() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        return tx.execute(status -> {
            UUID id = UUID.randomUUID();
            Associate associate = new Associate();
            associate.setId(id);
            associate.setPosition("L");
            associate.setName("Test Associate");
            associate.setKycStatus(KycStatus.VERIFIED);
            associate.setJoinedAt(Instant.now());
            associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
            associate.setUserId("u-" + id);
            associate.setEmail(id + "@test.local");
            associate.setPasswordHash("$2y$10$m1anhr1Y8va62ZGafTcLOODFQNYTpJDdbbnuriSLpRSELJIkV8J5C");
            // ADMIN, not ASSOCIATE: chk_associate_rank_required (V4) demands a rank_id for any
            // ASSOCIATE row, and this test only needs a persistable, FK-satisfying associate row
            // to exercise the Plot row lock -- not a real rank-tiered sales associate.
            associate.setRole(AssociateRole.ADMIN);
            associateRepository.saveAndFlush(associate);
            return id;
        });
    }

    private CreateSaleRequest saleRequestFor(UUID plotId, UUID associateId) {
        return new CreateSaleRequest(plotId, associateId, "Jane Buyer", "9999999999", null,
            projectId, new BigDecimal("600000.00"), "Sold to Jane Buyer");
    }

    private void awaitQuietly(CountDownLatch latch) {
        try {
            latch.await(5, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Test
    void secondRecordSaleBlocksUntilFirstTransactionResolvesThenSucceedsIfPlotIsStillAvailable() throws Exception {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            plotRepository.findByIdForUpdate(plotId).orElseThrow();
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
            // Transaction commits when this lambda returns, releasing the row lock. No status
            // change here: this stands in for a failed/abandoned first attempt, proving the
            // second caller's own lock-then-recheck succeeds against a still-AVAILABLE row.
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<SaleResponse> second = pool.submit(() -> {
            events.add("second-calling");
            SaleResponse response = saleService.recordSale(saleRequestFor(plotId, associateId));
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300); // give the second call time to attempt (and block on) the lock
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);
        SaleResponse response = second.get(5, TimeUnit.SECONDS);

        assertThat(events).containsExactly("holder-locked", "second-calling", "second-returned");
        assertThat(response.status()).isEqualTo("RECORDED");
        assertThat(response.plotId()).isEqualTo(plotId);
        pool.shutdownNow();
    }

    @Test
    void secondRecordSaleBlocksUntilFirstTransactionResolvesThenGetsPlotNotAvailableIfFirstSoldThePlot() throws Exception {
        plotId = seedAvailablePlot();
        associateId = seedAssociate();

        CountDownLatch lockHeld = new CountDownLatch(1);
        CountDownLatch releaseLock = new CountDownLatch(1);
        List<String> events = Collections.synchronizedList(new ArrayList<>());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        TransactionTemplate holderTx = new TransactionTemplate(transactionManager);

        Future<?> holder = pool.submit(() -> holderTx.executeWithoutResult(status -> {
            Plot locked = plotRepository.findByIdForUpdate(plotId).orElseThrow();
            // Stands in for a real first recordSale call's Plot -> SOLD flip (SaleService.java,
            // flow step 4), which happens inside the same locked transaction in production code.
            locked.setStatus(PlotStatus.SOLD);
            plotRepository.save(locked);
            events.add("holder-locked");
            lockHeld.countDown();
            awaitQuietly(releaseLock);
        }));

        lockHeld.await(5, TimeUnit.SECONDS);

        Future<SaleResponse> second = pool.submit(() -> {
            events.add("second-calling");
            SaleResponse response = saleService.recordSale(saleRequestFor(plotId, associateId));
            events.add("second-returned");
            return response;
        });

        Thread.sleep(300);
        assertThat(events).containsExactly("holder-locked", "second-calling");

        releaseLock.countDown();
        holder.get(5, TimeUnit.SECONDS);

        assertThatThrownBy(second::get).hasCauseInstanceOf(PlotNotAvailableException.class);
        pool.shutdownNow();
    }
}
