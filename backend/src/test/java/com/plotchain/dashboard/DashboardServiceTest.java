package com.plotchain.dashboard;

import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RoyaltyBonusRate;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
import com.plotchain.compensation.SettlementCycle;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock CycleRepository cycleRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock WalletRepository walletRepository;
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Mock SaleRepository saleRepository;

    DashboardService dashboardService;

    @BeforeEach
    void setUp() {
        dashboardService = new DashboardService(
            associateRepository, rankTierRepository, cycleRepository,
            ledgerEntryRepository, legVolumeRepository, walletRepository,
            compensationPlanVersionRepository, royaltyBonusRateRepository, saleRepository);
    }

    private static CompensationPlanVersion compensationPlanVersion(BigDecimal matchingIncomePct) {
        return new CompensationPlanVersion(
            UUID.randomUUID(), "v1", LocalDate.now().minusDays(1),
            new BigDecimal("10.00"), matchingIncomePct, new BigDecimal("3.00"), new BigDecimal("5.00"),
            new BigDecimal("2.00"), new BigDecimal("4.00"), BigDecimal.ZERO, BigDecimal.ZERO,
            SettlementCycle.MONTHLY, Instant.now(), null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
    }

    // Stubs every call this method makes unconditionally regardless of fixture specifics: the
    // last-8-cycles lookup (incomeTrend/networkGrowth) and the three downline-count/KYC-breakdown
    // reads. Individual tests override any of these with their own when(...) after calling this.
    // lenient() because these are defaults that some callers (e.g.
    // aggregatesTheDashboardForAnAssociate) immediately override with a more specific stub,
    // which would otherwise trip Mockito's strict-stubbing "unnecessary stubbing" check.
    private void stubUnconditionalCalls(UUID associateId) {
        lenient().when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class))).thenReturn(Page.empty());
        lenient().when(associateRepository.countDownline(associateId)).thenReturn(0L);
        lenient().when(associateRepository.countByParentId(associateId)).thenReturn(0L);
        lenient().when(associateRepository.countDownlineByKycStatus(any(), any())).thenReturn(0L);
    }

    @Test
    void aggregatesTheDashboardForAnAssociate() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.PENDING);
        associate.setUserId("SDI384818");
        associate.setName("Asha Kumar");
        associate.setPhone("9876543210");
        Instant joinedAt = Instant.parse("2025-09-05T05:25:42Z");
        Instant rankChangedAt = Instant.parse("2026-01-10T09:00:00Z");
        associate.setJoinedAt(joinedAt);
        associate.setRankChangedAt(rankChangedAt);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        UUID closedCycleId = UUID.randomUUID();
        Cycle closedCycle = new Cycle();
        closedCycle.setId(closedCycleId);
        closedCycle.setStatus(CycleStatus.CLOSED);
        closedCycle.setPeriodStart(LocalDate.now().minusDays(20));
        closedCycle.setPeriodEnd(LocalDate.now().minusDays(6));

        LegVolume legVolume = new LegVolume(UUID.randomUUID(), associateId, closedCycleId,
            new BigDecimal("300000"), new BigDecimal("200000"), new BigDecimal("100000"), BigDecimal.ZERO);

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.of(closedCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, closedCycleId)).thenReturn(Optional.of(legVolume));

        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.DIRECT)).thenReturn(BigDecimal.valueOf(1000));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.MATCHING)).thenReturn(BigDecimal.valueOf(500));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.SPONSOR_MATCHING)).thenReturn(BigDecimal.valueOf(300));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.SELF_PERFORMANCE)).thenReturn(BigDecimal.valueOf(200));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.ROYALTY)).thenReturn(BigDecimal.valueOf(400));
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycleId)).thenReturn(BigDecimal.valueOf(2400));
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, closedCycleId)).thenReturn(BigDecimal.valueOf(1800));

        CompensationPlanVersion planVersion = compensationPlanVersion(new BigDecimal("7.00"));
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any())).thenReturn(Optional.of(planVersion));
        // matchedVolume = min(300000, 200000) = 200000 > 0, exercises the real slab lookup.
        when(royaltyBonusRateRepository.findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(planVersion.getId(), new BigDecimal("200000")))
            .thenReturn(Optional.of(new RoyaltyBonusRate(UUID.randomUUID(), planVersion.getId(), BigDecimal.ZERO, new BigDecimal("3.00"))));

        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));

        stubUnconditionalCalls(associateId);
        when(cycleRepository.findAllByOrderByPeriodStartDesc(any(PageRequest.class))).thenReturn(new PageImpl<>(List.of(cycle, closedCycle)));
        when(associateRepository.countDownlineJoinedBefore(any(), any())).thenReturn(3L);
        when(associateRepository.countDownline(associateId)).thenReturn(12L);
        when(associateRepository.countByParentId(associateId)).thenReturn(8L);
        when(associateRepository.countDownlineByKycStatus(associateId, "VERIFIED")).thenReturn(9L);
        when(associateRepository.countDownlineByKycStatus(associateId, "PENDING")).thenReturn(2L);
        when(associateRepository.countDownlineByKycStatus(associateId, "REJECTED")).thenReturn(1L);

        when(saleRepository.countByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED)).thenReturn(6L);
        when(saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED)).thenReturn(new BigDecimal("3850000"));
        when(saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, closedCycleId, SaleStatus.RECORDED)).thenReturn(new BigDecimal("3260000"));

        DashboardResponse response = dashboardService.getDashboard(associateId);

        assertThat(response.kycPendingBannerVisible()).isTrue();
        assertThat(response.associate().associateId()).isEqualTo("SDI384818");
        assertThat(response.associate().name()).isEqualTo("Asha Kumar");
        assertThat(response.associate().rank()).isEqualTo("Sales Associate");
        assertThat(response.associate().rankChangedAt()).isEqualTo(rankChangedAt);
        assertThat(response.cycleIncome().directIncome()).isEqualByComparingTo("1000");
        assertThat(response.cycleIncome().sponsorMatchingIncome()).isEqualByComparingTo("300");
        assertThat(response.cycleIncome().selfPerformanceBonus()).isEqualByComparingTo("200");
        assertThat(response.cycleIncome().royaltyBonus()).isEqualByComparingTo("400");
        assertThat(response.cycleIncome().royaltyBonusPct()).isEqualByComparingTo("3.00");
        assertThat(response.cycleIncome().totalIncome()).isEqualByComparingTo("2400");
        assertThat(response.cycleIncome().previousCycleTotalIncome()).isEqualByComparingTo("1800");
        assertThat(response.cycleIncome().incomeTrend()).hasSize(2);
        assertThat(response.wallet().balance()).isEqualByComparingTo("0");
        assertThat(response.cycleCountdown().daysRemaining()).isEqualTo(10L);
        assertThat(response.salesSummary().salesThisCycle()).isEqualTo(6);
        assertThat(response.salesSummary().revenueBookedThisCycle()).isEqualByComparingTo("3850000");
        // (3850000 - 3260000) / 3260000 * 100 = 18.09... -> rounds to 18.
        assertThat(response.salesSummary().revenueBookedChangePct()).isEqualByComparingTo("18");
        assertThat(response.networkSummary().totalDownline()).isEqualTo(12L);
        assertThat(response.networkSummary().directCount()).isEqualTo(8L);
        assertThat(response.networkGrowth()).hasSize(2);
        DateTimeFormatter cycleLabelFormat = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH);
        assertThat(response.networkGrowth().get(0).cycleLabel()).isEqualTo(cycleLabelFormat.format(closedCycle.getPeriodStart()));
        assertThat(response.networkGrowth().get(1).cycleLabel()).isEqualTo(cycleLabelFormat.format(cycle.getPeriodStart()));
        assertThat(response.kycBreakdown().verified()).isEqualTo(9L);
        assertThat(response.kycBreakdown().pending()).isEqualTo(2L);
        assertThat(response.kycBreakdown().rejected()).isEqualTo(1L);
        assertThat(response.legVolumeSummary().leftLegVolume()).isEqualByComparingTo("300000");
        assertThat(response.legVolumeSummary().rightLegVolume()).isEqualByComparingTo("200000");
    }

    @Test
    void royaltyBonusPctIsZeroWhenNoCycleHasEverClosed() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.VERIFIED);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)).thenReturn(Optional.of(cycle));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED)).thenReturn(Optional.empty());

        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any())).thenReturn(BigDecimal.ZERO);
        when(compensationPlanVersionRepository.findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion(new BigDecimal("7.00"))));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(saleRepository.countByAssociateIdAndCycleIdAndStatus(any(), any(), any())).thenReturn(0L);
        when(saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(any(), any(), any())).thenReturn(BigDecimal.ZERO);

        stubUnconditionalCalls(associateId);

        DashboardResponse response = dashboardService.getDashboard(associateId);

        assertThat(response.cycleIncome().royaltyBonusPct()).isEqualByComparingTo("0");
        assertThat(response.cycleIncome().previousCycleTotalIncome()).isEqualByComparingTo("0");
        assertThat(response.salesSummary().revenueBookedChangePct()).isEqualByComparingTo("0");
        assertThat(response.legVolumeSummary().leftLegVolume()).isEqualByComparingTo("0");
        assertThat(response.legVolumeSummary().rightLegVolume()).isEqualByComparingTo("0");
    }

    @Test
    void rejectsTheDashboardForAnAccountWithNoRank() {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(null);
        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));

        assertThatThrownBy(() -> dashboardService.getDashboard(associateId))
            .isInstanceOf(NoRankAssignedException.class);
    }

    @Test
    void throwsAssociateNotFoundExceptionWhenAssociateDoesNotExist() {
        UUID associateId = UUID.randomUUID();
        when(associateRepository.findById(associateId)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> dashboardService.getDashboard(associateId))
            .isInstanceOf(AssociateNotFoundException.class);
    }
}
