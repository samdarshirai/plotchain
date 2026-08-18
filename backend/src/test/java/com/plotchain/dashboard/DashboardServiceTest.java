package com.plotchain.dashboard;

import com.plotchain.announcement.AnnouncementRepository;
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
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    @Mock AssociateRepository associateRepository;
    @Mock RankTierRepository rankTierRepository;
    @Mock CycleRepository cycleRepository;
    @Mock LedgerEntryRepository ledgerEntryRepository;
    @Mock LegVolumeRepository legVolumeRepository;
    @Mock WalletRepository walletRepository;
    @Mock AnnouncementRepository announcementRepository;
    @Mock CompensationPlanVersionRepository compensationPlanVersionRepository;
    @Mock RoyaltyBonusRateRepository royaltyBonusRateRepository;
    @Mock SaleRepository saleRepository;

    DashboardService dashboardService;

    @BeforeEach
    void setUp() {
        dashboardService = new DashboardService(
            associateRepository, rankTierRepository, cycleRepository,
            ledgerEntryRepository, legVolumeRepository, walletRepository,
            announcementRepository, compensationPlanVersionRepository,
            royaltyBonusRateRepository, saleRepository);
    }

    @Test
    void aggregatesAllDashboardWidgetsForAnAssociate() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();
        UUID nextRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.PENDING);
        associate.setCumulativeMatchedVolume(BigDecimal.valueOf(4000));
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
        RankTier nextRank = new RankTier(nextRankId, "Sales Executive", 2, BigDecimal.valueOf(10000));

        // Two closed cycles' worth of history. olderRow has no predecessor (incoming carry 0),
        // so its own leftLegVolume (100000) IS that cycle's new left volume, and left > right
        // carries 40000 forward. newerRow's leftLegVolume (300000) = its own new left volume
        // (260000) PLUS that same 40000 carried in -- a naive SUM(leftLegVolume) would count the
        // 40000 twice (100000 + 300000 = 400000); the correct lifetime total subtracts each row's
        // incoming carry first (100000 + (300000 - 40000) = 360000). Right never carries in this
        // fixture, so totalRightBusiness is unaffected by the bug (60000 + 200000 = 260000
        // either way) -- proving the fix doesn't change a leg that was never broken.
        UUID olderCycleId = UUID.randomUUID();
        UUID newerCycleId = UUID.randomUUID();
        Cycle newerClosedCycle = new Cycle();
        newerClosedCycle.setId(newerCycleId);
        newerClosedCycle.setStatus(CycleStatus.CLOSED);
        newerClosedCycle.setPeriodStart(LocalDate.now().minusDays(20));
        newerClosedCycle.setPeriodEnd(LocalDate.now().minusDays(6));

        LegVolume olderRow = new LegVolume(UUID.randomUUID(), associateId, olderCycleId,
            new BigDecimal("100000"), new BigDecimal("60000"), new BigDecimal("40000"), BigDecimal.ZERO);
        LegVolume newerRow = new LegVolume(UUID.randomUUID(), associateId, newerCycleId,
            new BigDecimal("300000"), new BigDecimal("200000"), new BigDecimal("100000"), BigDecimal.ZERO);

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.DIRECT))
            .thenReturn(BigDecimal.valueOf(1000));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.MATCHING))
            .thenReturn(BigDecimal.valueOf(500));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.SPONSOR_MATCHING))
            .thenReturn(BigDecimal.valueOf(300));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.SELF_PERFORMANCE))
            .thenReturn(BigDecimal.valueOf(200));
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycleId))
            .thenReturn(BigDecimal.valueOf(2400));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.of(newerClosedCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, newerCycleId))
            .thenReturn(Optional.of(newerRow));
        when(legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associateId))
            .thenReturn(List.of(olderRow, newerRow));
        when(saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED))
            .thenReturn(BigDecimal.valueOf(1200));
        CompensationPlanVersion planVersion = compensationPlanVersion(new BigDecimal("7.00"));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(planVersion));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.ROYALTY))
            .thenReturn(BigDecimal.valueOf(400));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder())
            .thenReturn(List.of(currentRank, nextRank));
        when(associateRepository.countDownline(associateId)).thenReturn(12L);
        when(associateRepository.countDownlineByPosition(associateId, "L")).thenReturn(7L);
        when(associateRepository.countDownlineByPosition(associateId, "R")).thenReturn(5L);
        when(associateRepository.countActiveToday(any(), any())).thenReturn(3L);
        when(associateRepository.countJoinedBetween(any(), any(), any())).thenReturn(2L);
        when(announcementRepository.findTop5ByOrderByPublishedAtDesc()).thenReturn(List.of());

        DashboardResponse response = dashboardService.getDashboard(associateId);

        assertThat(response.kycPendingBannerVisible()).isTrue();
        assertThat(response.associate().associateId()).isEqualTo("SDI384818");
        assertThat(response.associate().name()).isEqualTo("Asha Kumar");
        assertThat(response.associate().rank()).isEqualTo("Sales Associate");
        assertThat(response.associate().phone()).isEqualTo("9876543210");
        assertThat(response.associate().joinedAt()).isEqualTo(joinedAt);
        assertThat(response.associate().rankChangedAt()).isEqualTo(rankChangedAt);
        assertThat(response.cycleIncome().directIncome()).isEqualByComparingTo("1000");
        assertThat(response.cycleIncome().matchingIncome()).isEqualByComparingTo("500");
        assertThat(response.cycleIncome().sponsorMatchingIncome()).isEqualByComparingTo("300");
        assertThat(response.cycleIncome().selfPerformanceBonus()).isEqualByComparingTo("200");
        assertThat(response.cycleIncome().royaltyBonus()).isEqualByComparingTo("400");
        // matchedVolume is now min(300000, 200000) = 200000 (from newerRow) > 0, so the slab
        // lookup runs; it's left unstubbed here since exercising that path is
        // projectsMatchAmountFromTheDbStoredMatchingIncomePercentNotAHardcodedFraction's job, and
        // an unstubbed Optional-returning Mockito call defaults to Optional.empty() -> 0 pct.
        assertThat(response.cycleIncome().royaltyBonusPct()).isEqualByComparingTo("0");
        assertThat(response.cycleIncome().totalIncome()).isEqualByComparingTo("2400");
        assertThat(response.wallet().balance()).isEqualByComparingTo("0");
        // "Current standing" now comes from the most recently CLOSED cycle (newerRow), not the
        // open cycle's never-existing row.
        assertThat(response.legVolume().leftVolume()).isEqualByComparingTo("300000");
        assertThat(response.legVolume().rightVolume()).isEqualByComparingTo("200000");
        assertThat(response.legVolume().carriedForwardLeft()).isEqualByComparingTo("100000");
        assertThat(response.legVolume().carriedForwardRight()).isEqualByComparingTo("0");
        // min(300000, 200000) * (7.00 / 100) = 200000 * 0.07 = 14000.00
        assertThat(response.legVolume().projectedMatchAmount()).isEqualByComparingTo("14000.00");
        // De-duplicated lifetime totals -- see the fixture comment above.
        assertThat(response.legVolume().totalLeftBusiness()).isEqualByComparingTo("360000");
        assertThat(response.legVolume().totalRightBusiness()).isEqualByComparingTo("260000");
        assertThat(response.legVolume().newBookedAreaSqft()).isEqualByComparingTo("1200");
        assertThat(response.rankProgress().currentRank()).isEqualTo("Sales Associate");
        assertThat(response.rankProgress().currentRankOrder()).isEqualTo(1);
        assertThat(response.rankProgress().nextRank()).isEqualTo("Sales Executive");
        assertThat(response.rankProgress().progressPercent()).isEqualTo(40);
        assertThat(response.rankProgress().volumeToNextRank()).isEqualByComparingTo("6000");
        assertThat(response.teamSnapshot().totalDownline()).isEqualTo(12L);
        assertThat(response.teamSnapshot().activeToday()).isEqualTo(3L);
        assertThat(response.teamSnapshot().newJoinsThisCycle()).isEqualTo(2L);
        assertThat(response.teamSnapshot().leftAssociates()).isEqualTo(7L);
        assertThat(response.teamSnapshot().rightAssociates()).isEqualTo(5L);
        assertThat(response.cycleCountdown().cycleId()).isEqualTo(cycleId);
        assertThat(response.cycleCountdown().daysRemaining()).isEqualTo(10L);
        assertThat(response.announcements()).isEmpty();
    }

    @Test
    void currentLegVolumeDefaultsToZeroWhenTheAssociateHasNeverBeenThroughAClose() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);

        Cycle cycle = new Cycle();
        cycle.setId(cycleId);
        cycle.setStatus(CycleStatus.OPEN);
        cycle.setPeriodStart(LocalDate.now().minusDays(5));
        cycle.setPeriodEnd(LocalDate.now().plusDays(10));

        RankTier currentRank = new RankTier(currentRankId, "Sales Associate", 1, BigDecimal.valueOf(5000));

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        // No cycle has ever closed for this associate's org yet.
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.empty());
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any()))
            .thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any()))
            .thenReturn(BigDecimal.ZERO);
        when(legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associateId))
            .thenReturn(List.of());
        when(saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(any(), any(), any()))
            .thenReturn(BigDecimal.ZERO);
        CompensationPlanVersion planVersion = compensationPlanVersion(new BigDecimal("7.00"));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(planVersion));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder()).thenReturn(List.of(currentRank));
        when(associateRepository.countDownline(any())).thenReturn(0L);
        when(associateRepository.countDownlineByPosition(any(), any())).thenReturn(0L);
        when(associateRepository.countActiveToday(any(), any())).thenReturn(0L);
        when(associateRepository.countJoinedBetween(any(), any(), any())).thenReturn(0L);
        when(announcementRepository.findTop5ByOrderByPublishedAtDesc()).thenReturn(List.of());

        DashboardResponse response = dashboardService.getDashboard(associateId);

        assertThat(response.legVolume().leftVolume()).isEqualByComparingTo("0");
        assertThat(response.legVolume().rightVolume()).isEqualByComparingTo("0");
        assertThat(response.legVolume().carriedForwardLeft()).isEqualByComparingTo("0");
        assertThat(response.legVolume().carriedForwardRight()).isEqualByComparingTo("0");
        assertThat(response.legVolume().totalLeftBusiness()).isEqualByComparingTo("0");
        assertThat(response.legVolume().totalRightBusiness()).isEqualByComparingTo("0");
    }

    @Test
    void projectsMatchAmountFromTheDbStoredMatchingIncomePercentNotAHardcodedFraction() {
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);

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

        LegVolume legVolume = LegVolume.empty(associateId, closedCycleId);
        ReflectionTestUtils.setField(legVolume, "leftLegVolume", new BigDecimal("200000"));
        ReflectionTestUtils.setField(legVolume, "rightLegVolume", new BigDecimal("150000"));

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any()))
            .thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any()))
            .thenReturn(BigDecimal.ZERO);
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED))
            .thenReturn(Optional.of(closedCycle));
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, closedCycleId))
            .thenReturn(Optional.of(legVolume));
        when(legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associateId))
            .thenReturn(List.of());
        when(saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(associateId, cycleId, SaleStatus.RECORDED))
            .thenReturn(BigDecimal.ZERO);
        CompensationPlanVersion planVersion = compensationPlanVersion(new BigDecimal("7.00"));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(planVersion));
        // matchedVolume = min(200000, 150000) = 150000, a positive matched volume -- exercises the
        // real slab-lookup path (as opposed to the zero-matched-volume short-circuit case covered
        // in aggregatesAllDashboardWidgetsForAnAssociate).
        when(royaltyBonusRateRepository
                .findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(
                    planVersion.getId(), new BigDecimal("150000")))
            .thenReturn(Optional.of(new RoyaltyBonusRate(UUID.randomUUID(), planVersion.getId(), BigDecimal.ZERO, new BigDecimal("3.00"))));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder())
            .thenReturn(List.of(currentRank));
        when(associateRepository.countDownline(associateId)).thenReturn(0L);
        when(associateRepository.countDownlineByPosition(any(), any())).thenReturn(0L);
        when(associateRepository.countActiveToday(any(), any())).thenReturn(0L);
        when(associateRepository.countJoinedBetween(any(), any(), any())).thenReturn(0L);
        when(announcementRepository.findTop5ByOrderByPublishedAtDesc()).thenReturn(List.of());

        DashboardResponse response = dashboardService.getDashboard(associateId);

        // min(200000, 150000) * (7.00 / 100) = 150000 * 0.07 = 10500.00
        assertThat(response.legVolume().projectedMatchAmount()).isEqualByComparingTo("10500.00");
        assertThat(response.cycleIncome().sponsorMatchingIncome()).isEqualByComparingTo("0");
        assertThat(response.cycleIncome().selfPerformanceBonus()).isEqualByComparingTo("0");
        assertThat(response.cycleIncome().royaltyBonus()).isEqualByComparingTo("0");
        assertThat(response.cycleIncome().royaltyBonusPct()).isEqualByComparingTo("3.00");
        assertThat(response.legVolume().totalLeftBusiness()).isEqualByComparingTo("0");
        assertThat(response.legVolume().totalRightBusiness()).isEqualByComparingTo("0");
        assertThat(response.legVolume().newBookedAreaSqft()).isEqualByComparingTo("0");
        assertThat(response.associate().rankChangedAt()).isNull();
    }

    @Test
    void rejectsTheDashboardForAnAccountWithNoRank() {
        UUID associateId = UUID.randomUUID();
        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setRankId(null);
        associate.setKycStatus(KycStatus.VERIFIED);
        associate.setCumulativeMatchedVolume(BigDecimal.ZERO);
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

    private static CompensationPlanVersion compensationPlanVersion(BigDecimal matchingIncomePct) {
        return new CompensationPlanVersion(
            UUID.randomUUID(),
            "v1",
            LocalDate.now().minusDays(1),
            new BigDecimal("10.00"),
            matchingIncomePct,
            new BigDecimal("3.00"),
            new BigDecimal("5.00"),
            new BigDecimal("2.00"),
            new BigDecimal("4.00"),
            BigDecimal.ZERO,
            BigDecimal.ZERO,
            SettlementCycle.MONTHLY,
            Instant.now(),
            null,
            BigDecimal.ZERO, new BigDecimal("2000"), BigDecimal.ZERO, new BigDecimal("3000"));
    }
}
