package com.plotchain.dashboard;

import com.plotchain.announcement.AnnouncementRepository;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
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

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
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

    DashboardService dashboardService;

    @BeforeEach
    void setUp() {
        dashboardService = new DashboardService(
            associateRepository, rankTierRepository, cycleRepository,
            ledgerEntryRepository, legVolumeRepository, walletRepository,
            announcementRepository, new BigDecimal("0.07"));
    }

    @Test
    void aggregatesAllDashboardWidgetsForAnAssociate() {
        UUID tenantId = UUID.randomUUID();
        UUID associateId = UUID.randomUUID();
        UUID cycleId = UUID.randomUUID();
        UUID currentRankId = UUID.randomUUID();
        UUID nextRankId = UUID.randomUUID();

        Associate associate = new Associate();
        associate.setId(associateId);
        associate.setTenantId(tenantId);
        associate.setRankId(currentRankId);
        associate.setKycStatus(KycStatus.PENDING);
        associate.setCumulativeMatchedVolume(BigDecimal.valueOf(4000));

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
        when(walletRepository.findById(associateId)).thenReturn(Optional.of(Wallet.zero(associateId)));
        when(rankTierRepository.findAllByOrderByRankOrder())
            .thenReturn(List.of(currentRank, nextRank));
        when(associateRepository.countDownline(associateId, tenantId)).thenReturn(12L);
        when(associateRepository.countActiveToday(any(), any(), any())).thenReturn(3L);
        when(associateRepository.countJoinedBetween(any(), any(), any(), any())).thenReturn(2L);
        when(announcementRepository.findTop5ByTenantIdOrderByPublishedAtDesc(tenantId)).thenReturn(List.of());

        DashboardResponse response = dashboardService.getDashboard(associateId);

        assertThat(response.kycPendingBannerVisible()).isTrue();
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
}
