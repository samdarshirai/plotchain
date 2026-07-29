package com.plotchain.dashboard;

import com.plotchain.announcement.Announcement;
import com.plotchain.announcement.AnnouncementRepository;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.cycle.NoOpenCycleException;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.legvolume.LegVolume;
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class DashboardService {

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final CycleRepository cycleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final WalletRepository walletRepository;
    private final AnnouncementRepository announcementRepository;
    private final BigDecimal previewMatchingRate;

    public DashboardService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        LegVolumeRepository legVolumeRepository,
        WalletRepository walletRepository,
        AnnouncementRepository announcementRepository,
        @Value("${compensation.preview-matching-rate}") BigDecimal previewMatchingRate
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.walletRepository = walletRepository;
        this.announcementRepository = announcementRepository;
        this.previewMatchingRate = previewMatchingRate;
    }

    public DashboardResponse getDashboard(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        Cycle cycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .orElseThrow(NoOpenCycleException::new);

        BigDecimal direct = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.DIRECT);
        BigDecimal matching = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.MATCHING);
        BigDecimal total = ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycle.getId());

        LegVolume legVolume = legVolumeRepository.findByAssociateIdAndCycleId(associateId, cycle.getId())
            .orElseGet(() -> LegVolume.empty(associateId, cycle.getId(), associate.getTenantId()));
        BigDecimal projectedMatch = legVolume.getLeftLegVolume()
            .min(legVolume.getRightLegVolume())
            .multiply(previewMatchingRate);

        Wallet wallet = walletRepository.findById(associateId)
            .orElseGet(() -> Wallet.zero(associateId, associate.getTenantId()));

        List<RankTier> ranks = rankTierRepository.findAllByOrderByRankOrder();
        RankTier currentRank = ranks.stream()
            .filter(r -> r.getId().equals(associate.getRankId()))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("Associate's rank not found in tenant's rank table: " + associate.getRankId()));
        Optional<RankTier> nextRank = ranks.stream()
            .filter(r -> r.getRankOrder() == currentRank.getRankOrder() + 1)
            .findFirst();

        int progressPercent = nextRank
            .map(nr -> associate.getCumulativeMatchedVolume()
                .multiply(BigDecimal.valueOf(100))
                .divide(nr.getVolumeThreshold(), 0, RoundingMode.DOWN)
                .min(BigDecimal.valueOf(100))
                .intValue())
            .orElse(100);
        BigDecimal volumeToNextRank = nextRank
            .map(nr -> nr.getVolumeThreshold().subtract(associate.getCumulativeMatchedVolume()).max(BigDecimal.ZERO))
            .orElse(BigDecimal.ZERO);

        long totalDownline = associateRepository.countDownline(associateId, associate.getTenantId());
        long activeToday = associateRepository.countActiveToday(associateId, associate.getTenantId(), LocalDate.now());
        // Upper bound is exclusive, so pass the day *after* the cycle's last day to include
        // associates who joined on periodEnd itself (see AssociateRepository#countJoinedBetween).
        long newJoins = associateRepository.countJoinedBetween(
            associateId, associate.getTenantId(), cycle.getPeriodStart(), cycle.getPeriodEnd().plusDays(1));

        long daysRemaining = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), cycle.getPeriodEnd()));

        List<Announcement> announcements = announcementRepository.findTop5ByTenantIdOrderByPublishedAtDesc(associate.getTenantId());

        return new DashboardResponse(
            associate.getKycStatus() != KycStatus.VERIFIED,
            new DashboardResponse.CycleIncome(cycle.getId(), direct, matching, total),
            new DashboardResponse.WalletSummary(wallet.getBalance()),
            new DashboardResponse.LegVolumeSummary(
                legVolume.getLeftLegVolume(), legVolume.getRightLegVolume(),
                legVolume.getCarriedForwardLeft(), legVolume.getCarriedForwardRight(),
                projectedMatch),
            new DashboardResponse.RankProgress(
                currentRank.getName(), currentRank.getRankOrder(),
                nextRank.map(RankTier::getName).orElse(null),
                progressPercent, volumeToNextRank),
            new DashboardResponse.TeamSnapshot(totalDownline, activeToday, newJoins),
            new DashboardResponse.CycleCountdown(cycle.getId(), daysRemaining),
            announcements.stream()
                .map(a -> new DashboardResponse.AnnouncementSummary(a.getId(), a.getTitle(), a.getPublishedAt()))
                .toList()
        );
    }
}
