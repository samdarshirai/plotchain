package com.plotchain.dashboard;

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
import com.plotchain.legvolume.LegVolumeRepository;
import com.plotchain.rank.RankTier;
import com.plotchain.rank.RankTierRepository;
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.Wallet;
import com.plotchain.wallet.WalletRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Service
public class DashboardService {

    // Network Growth chart x-axis: short month name of each cycle's periodStart, not a bare
    // positional index -- "01".."08" read as arbitrary ticks, a month name reads as a timeline.
    private static final DateTimeFormatter CYCLE_LABEL_FORMAT = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH);

    private final AssociateRepository associateRepository;
    private final RankTierRepository rankTierRepository;
    private final CycleRepository cycleRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final LegVolumeRepository legVolumeRepository;
    private final WalletRepository walletRepository;
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

        // Royalty slab lookup needs matched volume from the associate's most-recently-CLOSED
        // cycle -- the currently OPEN cycle never has a leg_volume row of its own (rows are only
        // written at cycle close, CycleService#rollUpSubtree). This is the one LegVolume read
        // this dashboard still needs after dashboard-mockup spec §3.1 dropped the rest of
        // LegVolumeSummary; latestClosedCycle is also reused below for the income/revenue deltas.
        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        BigDecimal matchedVolume = latestClosedCycle
            .flatMap(closed -> legVolumeRepository.findByAssociateIdAndCycleId(associateId, closed.getId()))
            .map(lv -> lv.getLeftLegVolume().min(lv.getRightLegVolume()))
            .orElse(BigDecimal.ZERO);

        CompensationPlanVersion planVersion = compensationPlanVersionRepository
            .findFirstByEffectiveFromLessThanEqualOrderByEffectiveFromDesc(LocalDate.now())
            .orElseThrow(() -> new IllegalStateException("compensation_plan_version row missing - V8 migration seeds it"));
        // Mirrors CycleService#creditRoyalty's own guard (matchedVolume <= 0 -> skip): a
        // non-positive matched volume must never reach the slab lookup.
        BigDecimal royaltyBonusPct = matchedVolume.compareTo(BigDecimal.ZERO) > 0
            ? royaltyBonusRateRepository
                .findFirstByPlanVersionIdAndVolumeThresholdLessThanEqualOrderByVolumeThresholdDesc(planVersion.getId(), matchedVolume)
                .map(RoyaltyBonusRate::getRoyaltyPct)
                .orElse(BigDecimal.ZERO)
            : BigDecimal.ZERO;

        BigDecimal previousCycleTotalIncome = latestClosedCycle
            .map(closed -> ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, closed.getId()))
            .orElse(BigDecimal.ZERO);

        // Seal Card sparkline and Network Growth chart both plot the last 8 cycles, oldest first
        // -- findAllByOrderByPeriodStartDesc comes back newest-first, so it's reversed once here
        // and shared by both loops below.
        List<Cycle> lastCycles = new ArrayList<>(
            cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 8)).getContent());
        Collections.reverse(lastCycles);

        List<BigDecimal> incomeTrend = lastCycles.stream()
            .map(c -> ledgerEntryRepository.sumNetAmountByAssociateAndCycle(associateId, c.getId()))
            .toList();

        List<DashboardResponse.NetworkGrowthPoint> networkGrowth = new ArrayList<>();
        for (int i = 0; i < lastCycles.size(); i++) {
            Cycle c = lastCycles.get(i);
            // Exclusive upper bound: the day AFTER this cycle's periodEnd, so a join on the
            // close date itself counts.
            Instant cutoffExclusive = c.getPeriodEnd().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
            networkGrowth.add(new DashboardResponse.NetworkGrowthPoint(
                CYCLE_LABEL_FORMAT.format(c.getPeriodStart()),
                associateRepository.countDownlineJoinedBefore(associateId, cutoffExclusive)));
        }

        int salesThisCycle = (int) saleRepository.countByAssociateIdAndCycleIdAndStatus(associateId, cycle.getId(), SaleStatus.RECORDED);
        BigDecimal revenueBookedThisCycle = saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, cycle.getId(), SaleStatus.RECORDED);
        BigDecimal revenueBookedPreviousCycle = latestClosedCycle
            .map(closed -> saleRepository.sumAmountByAssociateIdAndCycleIdAndStatus(associateId, closed.getId(), SaleStatus.RECORDED))
            .orElse(BigDecimal.ZERO);
        BigDecimal revenueBookedChangePct = revenueBookedPreviousCycle.compareTo(BigDecimal.ZERO) > 0
            ? revenueBookedThisCycle.subtract(revenueBookedPreviousCycle)
                .multiply(BigDecimal.valueOf(100))
                .divide(revenueBookedPreviousCycle, 0, RoundingMode.HALF_UP)
            : BigDecimal.ZERO;

        Wallet wallet = walletRepository.findById(associateId)
            .orElseGet(() -> Wallet.zero(associateId));

        List<RankTier> ranks = rankTierRepository.findAllByOrderByRankOrder();
        RankTier currentRank = ranks.stream()
            .filter(r -> r.getId().equals(associate.getRankId()))
            .findFirst()
            .orElseThrow(() -> new IllegalStateException("Associate's rank not found in rank table: " + associate.getRankId()));

        long totalDownline = associateRepository.countDownline(associateId);
        long directCount = associateRepository.countByParentId(associateId);

        long verified = associateRepository.countDownlineByKycStatus(associateId, KycStatus.VERIFIED.name());
        long pending = associateRepository.countDownlineByKycStatus(associateId, KycStatus.PENDING.name());
        long rejected = associateRepository.countDownlineByKycStatus(associateId, KycStatus.REJECTED.name());

        long daysRemaining = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), cycle.getPeriodEnd()));

        return new DashboardResponse(
            new DashboardResponse.AssociateSummary(
                associate.getUserId(), associate.getName(), currentRank.getName(),
                associate.getPhone(), associate.getJoinedAt(), associate.getRankChangedAt()),
            associate.getKycStatus() != KycStatus.VERIFIED,
            new DashboardResponse.CycleIncome(
                cycle.getId(), direct, matching, sponsorMatching, selfPerformance, royaltyBonus, royaltyBonusPct, total,
                previousCycleTotalIncome, incomeTrend),
            new DashboardResponse.WalletSummary(wallet.getBalance()),
            new DashboardResponse.CycleCountdown(cycle.getId(), daysRemaining),
            new DashboardResponse.SalesSummary(salesThisCycle, revenueBookedThisCycle, revenueBookedChangePct),
            new DashboardResponse.NetworkSummary(totalDownline, directCount),
            networkGrowth,
            new DashboardResponse.KycBreakdown(verified, pending, rejected)
        );
    }
}
