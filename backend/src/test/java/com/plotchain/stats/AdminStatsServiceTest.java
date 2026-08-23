package com.plotchain.stats;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.projects.PlotRepository;
import com.plotchain.projects.PlotStatus;
import com.plotchain.sales.AdminSalePageResponse;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleResponse;
import com.plotchain.sales.SaleService;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.WalletRepository;
import com.plotchain.withdrawal.WithdrawalRequestRepository;
import com.plotchain.withdrawal.WithdrawalRequestStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
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
    @Mock PlotRepository plotRepository;
    @Mock SaleService saleService;

    AdminStatsService adminStatsService;

    private static final DateTimeFormatter CYCLE_LABEL_FORMAT = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH);

    @BeforeEach
    void setUp() {
        adminStatsService = new AdminStatsService(
            associateRepository, walletRepository, ledgerEntryRepository, cycleRepository,
            saleRepository, withdrawalRequestRepository, plotRepository, saleService);
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
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class)))
            .thenReturn(new PageImpl<>(List.of(cycle)));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycleId, IncomeType.DIRECT))
            .thenReturn(new BigDecimal("1000"));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(cycleId, IncomeType.MATCHING))
            .thenReturn(new BigDecimal("500"));
        when(ledgerEntryRepository.sumNetAmountByCycle(cycleId))
            .thenReturn(new BigDecimal("1500"));
        when(associateRepository.countByRoleAndJoinedBetween(any(), any(), any())).thenReturn(3L);
        when(associateRepository.countByRoleAndJoinedBefore(any(), any())).thenReturn(2L);
        when(withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED)).thenReturn(4L);
        when(saleRepository.countByCycleIdAndStatus(cycleId, SaleStatus.RECORDED)).thenReturn(12L);
        when(saleRepository.sumAmountByCycleIdAndStatus(cycleId, SaleStatus.RECORDED))
            .thenReturn(new BigDecimal("2400000"));
        when(plotRepository.countByStatusNot(PlotStatus.SOLD)).thenReturn(21L);
        when(saleRepository.countByStatus(SaleStatus.RECORDED)).thenReturn(63L);
        when(cycleRepository.countByStatusIn(List.of(CycleStatus.CLOSED, CycleStatus.PAID))).thenReturn(11L);
        when(saleService.list(null, null, null, null, 0, 5))
            .thenReturn(new AdminSalePageResponse(List.of(), 0, 5, 0));

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
        // No CLOSED cycle stubbed -- degrades to zero, same as DashboardService's own fallback.
        assertThat(response.currentCycle().previousCycleTotalIncome()).isEqualByComparingTo("0");
        assertThat(response.currentCycle().incomeTrend()).containsExactly(new BigDecimal("1500"));
        assertThat(response.activePlots()).isEqualTo(21L);
        assertThat(response.totalSalesRecorded()).isEqualTo(63L);
        assertThat(response.cyclesCompleted()).isEqualTo(11L);
        assertThat(response.networkGrowth()).hasSize(1);
        assertThat(response.networkGrowth().get(0).cycleLabel()).isEqualTo(CYCLE_LABEL_FORMAT.format(cycle.getPeriodStart()));
        assertThat(response.networkGrowth().get(0).associateCount()).isEqualTo(2L);
        assertThat(response.recentSales()).isEmpty();
    }

    @Test
    void populatesPreviousCycleTotalIncomeAndRecentSalesWhenTheyExist() {
        UUID cycleId = UUID.randomUUID();
        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        UUID closedCycleId = UUID.randomUUID();
        Cycle closedCycle = new Cycle();
        closedCycle.setId(closedCycleId);
        closedCycle.setStatus(CycleStatus.CLOSED);
        closedCycle.setPeriodStart(LocalDate.now().minusDays(35));
        closedCycle.setPeriodEnd(LocalDate.now().minusDays(6));

        when(associateRepository.countByRole(AssociateRole.ASSOCIATE)).thenReturn(10L);
        when(associateRepository.countByRoleAndKycStatus(any(), any())).thenReturn(0L);
        when(walletRepository.sumAllBalances()).thenReturn(BigDecimal.ZERO);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.of(closedCycle));
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class)))
            .thenReturn(new PageImpl<>(List.of(cycle, closedCycle)));
        when(ledgerEntryRepository.sumNetAmountByCycleAndType(any(), any())).thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByCycle(cycleId)).thenReturn(new BigDecimal("1500"));
        when(ledgerEntryRepository.sumNetAmountByCycle(closedCycleId)).thenReturn(new BigDecimal("1200"));
        when(associateRepository.countByRoleAndJoinedBetween(any(), any(), any())).thenReturn(0L);
        when(associateRepository.countByRoleAndJoinedBefore(any(), any())).thenReturn(0L);
        when(withdrawalRequestRepository.countByStatus(any())).thenReturn(0L);
        when(saleRepository.countByCycleIdAndStatus(any(), any())).thenReturn(0L);
        when(saleRepository.sumAmountByCycleIdAndStatus(any(), any())).thenReturn(BigDecimal.ZERO);
        when(plotRepository.countByStatusNot(any())).thenReturn(0L);
        when(saleRepository.countByStatus(any())).thenReturn(0L);
        when(cycleRepository.countByStatusIn(any())).thenReturn(0L);
        SaleResponse recentSale = new SaleResponse(
            UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID(), "Jane Buyer", "9999999999", null,
            new BigDecimal("600000"), cycleId, "L", "RECORDED", null, Instant.now(), "A-101", "Viraj Greens",
            "VP00001", "Jane Associate");
        when(saleService.list(null, null, null, null, 0, 5))
            .thenReturn(new AdminSalePageResponse(List.of(recentSale), 0, 5, 1));

        AdminStatsResponse response = adminStatsService.getStats();

        assertThat(response.currentCycle().previousCycleTotalIncome()).isEqualByComparingTo("1200");
        // lastCycles is oldest-first (closedCycle, cycle) -- same ordering DashboardService uses.
        assertThat(response.currentCycle().incomeTrend()).containsExactly(new BigDecimal("1200"), new BigDecimal("1500"));
        assertThat(response.recentSales()).hasSize(1);
        assertThat(response.recentSales().get(0).associateUserId()).isEqualTo("VP00001");
        assertThat(response.recentSales().get(0).associateName()).isEqualTo("Jane Associate");
    }

    @Test
    void degradesGracefullyWithANullCurrentCycleWhenNoCycleIsOpen() {
        when(associateRepository.countByRole(AssociateRole.ASSOCIATE)).thenReturn(10L);
        when(associateRepository.countByRoleAndKycStatus(any(), any())).thenReturn(0L);
        when(walletRepository.sumAllBalances()).thenReturn(BigDecimal.ZERO);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.empty());
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class)))
            .thenReturn(Page.empty());
        when(withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED)).thenReturn(0L);
        when(plotRepository.countByStatusNot(PlotStatus.SOLD)).thenReturn(0L);
        when(saleRepository.countByStatus(SaleStatus.RECORDED)).thenReturn(0L);
        when(cycleRepository.countByStatusIn(List.of(CycleStatus.CLOSED, CycleStatus.PAID))).thenReturn(0L);
        when(saleService.list(null, null, null, null, 0, 5))
            .thenReturn(new AdminSalePageResponse(List.of(), 0, 5, 0));

        AdminStatsResponse response = adminStatsService.getStats();

        assertThat(response.totalAssociates()).isEqualTo(10L);
        assertThat(response.pendingWithdrawals()).isEqualTo(0L);
        assertThat(response.currentCycle()).isNull();
        assertThat(response.activePlots()).isEqualTo(0L);
        assertThat(response.totalSalesRecorded()).isEqualTo(0L);
        assertThat(response.cyclesCompleted()).isEqualTo(0L);
        // networkGrowth/recentSales are top-level fields, populated regardless of whether a cycle
        // is currently OPEN -- both degrade to empty here since there are no cycles/sales at all.
        assertThat(response.networkGrowth()).isEmpty();
        assertThat(response.recentSales()).isEmpty();
    }
}
