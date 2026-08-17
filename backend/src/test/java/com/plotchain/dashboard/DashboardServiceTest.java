package com.plotchain.dashboard;

import com.plotchain.announcement.AnnouncementRepository;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
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

    DashboardService dashboardService;

    @BeforeEach
    void setUp() {
        dashboardService = new DashboardService(
            associateRepository, rankTierRepository, cycleRepository,
            ledgerEntryRepository, legVolumeRepository, walletRepository,
            announcementRepository, compensationPlanVersionRepository);
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

        LegVolume legVolume = LegVolume.empty(associateId, cycleId);

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.DIRECT))
            .thenReturn(BigDecimal.valueOf(1000));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycleId, IncomeType.MATCHING))
            .thenReturn(BigDecimal.valueOf(500));
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycleId))
            .thenReturn(BigDecimal.valueOf(1500));
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycleId))
            .thenReturn(Optional.of(legVolume));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion(new BigDecimal("7.00"))));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder())
            .thenReturn(List.of(currentRank, nextRank));
        when(associateRepository.countDownline(associateId)).thenReturn(12L);
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
        assertThat(response.cycleIncome().totalIncome()).isEqualByComparingTo("1500");
        assertThat(response.wallet().balance()).isEqualByComparingTo("0");
        assertThat(response.legVolume().leftVolume()).isEqualByComparingTo("0");
        assertThat(response.legVolume().rightVolume()).isEqualByComparingTo("0");
        assertThat(response.legVolume().carriedForwardLeft()).isEqualByComparingTo("0");
        assertThat(response.legVolume().carriedForwardRight()).isEqualByComparingTo("0");
        assertThat(response.legVolume().projectedMatchAmount()).isEqualByComparingTo("0");
        assertThat(response.rankProgress().currentRank()).isEqualTo("Sales Associate");
        assertThat(response.rankProgress().currentRankOrder()).isEqualTo(1);
        assertThat(response.rankProgress().nextRank()).isEqualTo("Sales Executive");
        assertThat(response.rankProgress().progressPercent()).isEqualTo(40);
        assertThat(response.rankProgress().volumeToNextRank()).isEqualByComparingTo("6000");
        assertThat(response.teamSnapshot().totalDownline()).isEqualTo(12L);
        assertThat(response.teamSnapshot().activeToday()).isEqualTo(3L);
        assertThat(response.teamSnapshot().newJoinsThisCycle()).isEqualTo(2L);
        assertThat(response.cycleCountdown().cycleId()).isEqualTo(cycleId);
        assertThat(response.cycleCountdown().daysRemaining()).isEqualTo(10L);
        assertThat(response.announcements()).isEmpty();
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

        LegVolume legVolume = LegVolume.empty(associateId, cycleId);
        ReflectionTestUtils.setField(legVolume, "leftLegVolume", new BigDecimal("200000"));
        ReflectionTestUtils.setField(legVolume, "rightLegVolume", new BigDecimal("150000"));

        when(associateRepository.findById(associateId)).thenReturn(Optional.of(associate));
        when(cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN))
            .thenReturn(Optional.of(cycle));
        when(ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(any(), any(), any()))
            .thenReturn(BigDecimal.ZERO);
        when(ledgerEntryRepository.sumNetAmountByAssociateAndCycle(any(), any()))
            .thenReturn(BigDecimal.ZERO);
        when(legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycleId))
            .thenReturn(Optional.of(legVolume));
        when(compensationPlanVersionRepository
                .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(any()))
            .thenReturn(Optional.of(compensationPlanVersion(new BigDecimal("7.00"))));
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder())
            .thenReturn(List.of(currentRank));
        when(associateRepository.countDownline(associateId)).thenReturn(0L);
        when(associateRepository.countActiveToday(any(), any())).thenReturn(0L);
        when(associateRepository.countJoinedBetween(any(), any(), any())).thenReturn(0L);
        when(announcementRepository.findTop5ByOrderByPublishedAtDesc()).thenReturn(List.of());

        DashboardResponse response = dashboardService.getDashboard(associateId);

        // min(200000, 150000) * (7.00 / 100) = 150000 * 0.07 = 10500.00
        assertThat(response.legVolume().projectedMatchAmount()).isEqualByComparingTo("10500.00");
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
