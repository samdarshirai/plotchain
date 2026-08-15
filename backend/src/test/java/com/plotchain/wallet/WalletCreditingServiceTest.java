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
