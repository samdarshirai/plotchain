package com.plotchain.stats;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.WalletRepository;
import com.plotchain.withdrawal.WithdrawalRequestRepository;
import com.plotchain.withdrawal.WithdrawalRequestStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminStatsServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock WalletRepository walletRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock CycleRepository cycleRepository;
    @Mock SaleRepository saleRepository;
    @Mock WithdrawalRequestRepository withdrawalRequestRepository;

    AdminStatsService adminStatsService;

    @BeforeEach
    void setUp() {
        adminStatsService = new AdminStatsService(
            associateRepository, walletRepository, ledgerEntryRepository, cycleRepository,
            saleRepository, withdrawalRequestRepository);
    }

    @Test
    void aggregatesCompanyWideStatsWhenACycleIsOpen() {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        when(associateRepository.countByRole(AssociateRole.ASSOCIATE)).thenReturn(42L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING)).thenReturn(5L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED)).thenReturn(30L);
        when(associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)).thenReturn(7L);
        when(walletRepository.sumAllBalances()).thenReturn(new BigDecimal("125000.50"));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycleId, IncomeType.DIRECT))
            .thenReturn(new BigDecimal("1000"));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycleId, IncomeType.MATCHING))
            .thenReturn(new BigDecimal("500"));
        when(ledgerEntryRepository.sumNetAmountByCycle(cycleId))
            .thenReturn(new BigDecimal("1500"));
        when(associateRepository.countByRoleAndJoinedBetween(any(), any(), any())).thenReturn(3L);
        when(withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED)).thenReturn(4L);
        when(saleRepository.countByCycleIdAndStatus(cycleId, SaleStatus.RECORDED)).thenReturn(12L);
        when(saleRepository.sumAmountByCycleIdAndStatus(cycleId, SaleStatus.RECORDED))
            .thenReturn(new BigDecimal("2400000"));

        AdminStatsResponse response = adminStatsService.getStats();

        assertThat(response.totalAssociates()).isEqualTo(42L);
        assertThat(response.kycBreakdown().pending()).isEqualTo(5L);
        assertThat(response.kycBreakdown().verified()).isEqualTo(30L);
        assertThat(response.kycBreakdown().rejected()).isEqualTo(7L);
        assertThat(response.totalWalletBalance()).isEqualByComparingTo("125000.50");
        assertThat(response.pendingWithdrawals()).isEqualTo(4L);
        assertThat(response.currentCycle()).isNotNull();
        assertThat(response.currentCycle().cycleId()).isEqualTo(cycleId);
        assertThat(response.currentCycle().periodStart()).isEqualTo(cycle.getPeriodStart());
        assertThat(response.currentCycle().periodEnd()).isEqualTo(cycle.getPeriodEnd());
        assertThat(response.currentCycle().daysRemaining()).isEqualTo(10L);
        assertThat(response.currentCycle().directIncome()).isEqualByComparingTo("1000");
        assertThat(response.currentCycle().matchingIncome()).isEqualByComparingTo("500");
        assertThat(response.currentCycle().totalIncome()).isEqualByComparingTo("1500");
        assertThat(response.currentCycle().newAssociatesThisCycle()).isEqualTo(3L);
        assertThat(response.currentCycle().salesThisCycle()).isEqualTo(12L);
        assertThat(response.currentCycle().revenueThisCycle()).isEqualByComparingTo("2400000");
    }

    @Test
    void degradesGracefullyWithANullCurrentCycleWhenNoCycleIsOpen() {
        when(associateRepository.countByRole(AssociateRole.ASSOCIATE)).thenReturn(10L);
        when(associateRepository.countByRoleAndKycStatus(any(), any())).thenReturn(0L);
        when(walletRepository.sumAllBalances()).thenReturn(BigDecimal.ZERO);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.empty());
        when(withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED)).thenReturn(0L);

        AdminStatsResponse response = adminStatsService.getStats();

        assertThat(response.totalAssociates()).isEqualTo(10L);
        assertThat(response.pendingWithdrawals()).isEqualTo(0L);
        assertThat(response.currentCycle()).isNull();
    }
}
