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

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doReturn;
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
        // left nothing committed to collide with. Deliberately doReturn(...).when(...), not
        // when(...).thenReturn(...): the latter would re-invoke ledgerEntryRepository.save(entryB)
        // as part of setting up the new stub, and since the PREVIOUS stub (thenThrow above) is
        // still active at that instant, it would throw immediately -- before .thenReturn() could
        // ever attach. doReturn(...).when(...) never invokes the mocked method during setup, so
        // it safely overrides a throwing stub.
        doReturn(entryB).when(ledgerEntryRepository).save(entryB);

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
