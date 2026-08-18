package com.plotchain.dashboard;

import com.plotchain.announcement.Announcement;
import com.plotchain.announcement.AnnouncementRepository;
import com.plotchain.associate.Associate;
import com.plotchain.associate.AssociateNotFoundException;
import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.KycStatus;
import com.plotchain.compensation.CompensationPlanVersion;
import com.plotchain.compensation.CompensationPlanVersionRepository;
import com.plotchain.compensation.RoyaltyBonusRate;
import com.plotchain.compensation.RoyaltyBonusRateRepository;
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
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
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
    private final CompensationPlanVersionRepository compensationPlanVersionRepository;
    private final RoyaltyBonusRateRepository royaltyBonusRateRepository;
    private final SaleRepository saleRepository;

    public DashboardService(
        AssociateRepository associateRepository,
        RankTierRepository rankTierRepository,
        CycleRepository cycleRepository,
        LedgerEntryRepository ledgerEntryRepository,
        LegVolumeRepository legVolumeRepository,
        WalletRepository walletRepository,
        AnnouncementRepository announcementRepository,
        CompensationPlanVersionRepository compensationPlanVersionRepository,
        RoyaltyBonusRateRepository royaltyBonusRateRepository,
        SaleRepository saleRepository
    ) {
        this.associateRepository = associateRepository;
        this.rankTierRepository = rankTierRepository;
        this.cycleRepository = cycleRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.legVolumeRepository = legVolumeRepository;
        this.walletRepository = walletRepository;
        this.announcementRepository = announcementRepository;
        this.compensationPlanVersionRepository = compensationPlanVersionRepository;
        this.royaltyBonusRateRepository = royaltyBonusRateRepository;
        this.saleRepository = saleRepository;
    }

    public DashboardResponse getDashboard(UUID associateId) {
        Associate associate = associateRepository.findById(associateId)
            .orElseThrow(() -> new AssociateNotFoundException(associateId));

        if (associate.getRankId() == null) {
            throw new NoRankAssignedException(associateId);
        }

        Cycle cycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .orElseThrow(NoOpenCycleException::new);

        BigDecimal direct = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.DIRECT);
        BigDecimal matching = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.MATCHING);
        BigDecimal sponsorMatching = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.SPONSOR_MATCHING);
        BigDecimal selfPerformance = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.SELF_PERFORMANCE);
        BigDecimal total = ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, cycle.getId());
        BigDecimal royaltyBonus = ledgerEntryRepository.sumNetAmountByAssociateCycleAndType(associateId, cycle.getId(), IncomeType.ROYALTY);

        // leg_volume rows are written only at cycle CLOSE (CycleService#rollUpSubtree), keyed to
        // the cycle being closed -- the currently OPEN cycle this dashboard is showing never has a
        // row of its own, so findByAssociateIdAndCycleId(associateId, cycle.getId()) against it was
        // a structural no-op that always fell through to LegVolume.empty(). Reading the associate's
        // most-recently-CLOSED cycle instead is "current standing as of the last close" -- the
        // freshest real figure available without a live in-cycle recompute.
        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        LegVolume legVolume = latestClosedCycle
            .flatMap(closed -> legVolumeRepository.findByAssociateIdAndCycleId(associateId, closed.getId()))
            .orElseGet(() -> LegVolume.empty(associateId, cycle.getId()));

        // Lifetime Total Left/Right Business: each row's leftLegVolume/rightLegVolume already has
        // the PRIOR cycle's carriedForward baked in (rollUpSubtree: leftLegVolume =
        // leftSubtreeVolume + carriedForwardLeft-from-last-close), and an unmatched carry keeps
        // re-appearing in every subsequent row until it's finally matched down -- a naive
        // SUM(leftLegVolume) across all rows counts that same still-unmatched volume once per
        // cycle it survives, not once. Subtracting each row's own incoming carry (its
        // predecessor's outgoing carriedForwardLeft/Right, 0 for the associate's first row)
        // before summing leaves exactly the new subtree volume each cycle actually contributed.
        List<LegVolume> legVolumeHistory = legVolumeRepository.findByAssociateIdOrderByCyclePeriodStartAsc(associateId);
        BigDecimal totalLeftBusiness = BigDecimal.ZERO;
        BigDecimal totalRightBusiness = BigDecimal.ZERO;
        BigDecimal incomingCarryLeft = BigDecimal.ZERO;
        BigDecimal incomingCarryRight = BigDecimal.ZERO;
        for (LegVolume row : legVolumeHistory) {
            totalLeftBusiness = totalLeftBusiness.add(row.getLeftLegVolume().subtract(incomingCarryLeft));
            totalRightBusiness = totalRightBusiness.add(row.getRightLegVolume().subtract(incomingCarryRight));
            incomingCarryLeft = row.getCarriedForwardLeft();
            incomingCarryRight = row.getCarriedForwardRight();
        }
        BigDecimal newBookedAreaSqft = saleRepository.sumPlotAreaSqftByAssociateIdAndCycleIdAndStatus(
            associateId, cycle.getId(), SaleStatus.RECORDED);
        CompensationPlanVersion planVersion = compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .orElseThrow(() -> new IllegalStateException("compensation_plan_version row missing - V8 migration seeds it"));
        BigDecimal matchingIncomePct = planVersion.getMatchingIncomePct();
        BigDecimal matchedVolume = legVolume.getLeftLegVolume().min(legVolume.getRightLegVolume());
        BigDecimal projectedMatch = matchedVolume.multiply(matchingIncomePct.divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP));
        // Mirror CycleService#creditRoyalty's own guard (matchedVolume.compareTo(BigDecimal.ZERO) <= 0
        // -> skip): a non-positive matched volume must never reach the slab lookup, so the
        // dashboard can never advertise a percentage the cycle-close engine would not actually pay.
        BigDecimal royaltyBonusPct = matchedVolume.compareTo(BigDecimal.ZERO) > 0
            ? royaltyBonusRateRepository
                .findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(planVersion.getId(), matchedVolume)
                .map(RoyaltyBonusRate::getRoyaltyPct)
                .orElse(BigDecimal.ZERO)
            : BigDecimal.ZERO;

        Wallet wallet = walletRepository.findById(associateId)
            .orElseGet(() -> Wallet.zero(associateId));

        List<RankTier> ranks = rankTierRepository.findAllByOrderByRankOrder();
        RankTier currentRank = ranks.stream()
            .filter(r -> r.getId().equals(associate.getRankId()))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("Associate's rank not found in rank table: " + associate.getRankId()));
        // ranks is ordered ascending by rankOrder, and rankOrder values are not necessarily
        // consecutive (e.g. seeded as 10/20/30/40) -- the next rank is the first one strictly
        // above the current, not "current + 1".
        Optional<RankTier> nextRank = ranks.stream()
            .filter(r -> r.getRankOrder() > currentRank.getRankOrder())
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

        long totalDownline = associateRepository.countDownline(associateId);
        long activeToday = associateRepository.countActiveToday(associateId, LocalDate.now());
        // Upper bound is exclusive, so pass the day *after* the cycle's last day to include
        // associates who joined on periodEnd itself (see AssociateRepository#countJoinedBetween).
        long newJoins = associateRepository.countJoinedBetween(
            associateId, cycle.getPeriodStart(), cycle.getPeriodEnd().plusDays(1));

        long daysRemaining = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), cycle.getPeriodEnd()));

        List<Announcement> announcements = announcementRepository.findTop5ByOrderByPublishedAtDesc();

        return new DashboardResponse(
            new DashboardResponse.AssociateSummary(
                associate.getUserId(), associate.getName(), currentRank.getName(),
                associate.getPhone(), associate.getJoinedAt(), associate.getRankChangedAt()),
            associate.getKycStatus() != KycStatus.VERIFIED,
            new DashboardResponse.CycleIncome(cycle.getId(), direct, matching, sponsorMatching, selfPerformance, royaltyBonus, royaltyBonusPct, total),
            new DashboardResponse.WalletSummary(wallet.getBalance()),
            new DashboardResponse.LegVolumeSummary(
                legVolume.getLeftLegVolume(), legVolume.getRightLegVolume(),
                legVolume.getCarriedForwardLeft(), legVolume.getCarriedForwardRight(),
                projectedMatch, totalLeftBusiness, totalRightBusiness, newBookedAreaSqft),
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
