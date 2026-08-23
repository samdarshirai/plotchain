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
import com.plotchain.sales.SaleRepository;
import com.plotchain.sales.SaleResponse;
import com.plotchain.sales.SaleService;
import com.plotchain.sales.SaleStatus;
import com.plotchain.wallet.WalletRepository;
import com.plotchain.withdrawal.WithdrawalRequestRepository;
import com.plotchain.withdrawal.WithdrawalRequestStatus;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
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

@Service
public class AdminStatsService {

    // Network Growth chart x-axis, same convention DashboardService.CYCLE_LABEL_FORMAT already
    // established: short month name of each cycle's periodStart, not a bare positional index.
    private static final DateTimeFormatter CYCLE_LABEL_FORMAT = DateTimeFormatter.ofPattern("MMM", Locale.ENGLISH);

    private final AssociateRepository associateRepository;
    private final WalletRepository walletRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final CycleRepository cycleRepository;
    private final SaleRepository saleRepository;
    private final WithdrawalRequestRepository withdrawalRequestRepository;
    private final PlotRepository plotRepository;
    private final SaleService saleService;

    public AdminStatsService(
        AssociateRepository associateRepository,
        WalletRepository walletRepository,
        LedgerEntryRepository ledgerEntryRepository,
        CycleRepository cycleRepository,
        SaleRepository saleRepository,
        WithdrawalRequestRepository withdrawalRequestRepository,
        PlotRepository plotRepository,
        SaleService saleService
    ) {
        this.associateRepository = associateRepository;
        this.walletRepository = walletRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.cycleRepository = cycleRepository;
        this.saleRepository = saleRepository;
        this.withdrawalRequestRepository = withdrawalRequestRepository;
        this.plotRepository = plotRepository;
        this.saleService = saleService;
    }

    // Unlike DashboardService.getDashboard, this does NOT throw/409 when there's no OPEN cycle:
    // an admin still wants total associates / wallet balance / pending withdrawals / network
    // growth / recent sales regardless of cycle state, so currentCycle simply comes back null and
    // the rest of the stats still populate.
    public AdminStatsResponse getStats() {
        long totalAssociates = associateRepository.countByRole(AssociateRole.ASSOCIATE);

        AdminStatsResponse.KycBreakdown kycBreakdown = new AdminStatsResponse.KycBreakdown(
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)
        );

        BigDecimal totalWalletBalance = walletRepository.sumAllBalances();
        long pendingWithdrawals = withdrawalRequestRepository.countByStatus(WithdrawalRequestStatus.REQUESTED);

        // Seal Card sparkline (incomeTrend, nested under currentCycle -- only meaningful when a
        // cycle is OPEN) and Network Growth chart (top-level, populated regardless) both plot the
        // same last 8 cycles, oldest first -- computed once here and shared, same reasoning as
        // DashboardService's own lastCycles list.
        var cyclePageResult = cycleRepository.findAllByOrderByPeriodStartDesc(PageRequest.of(0, 8));
        List<Cycle> lastCycles = new ArrayList<>(cyclePageResult != null ? cyclePageResult.getContent() : List.of());
        Collections.reverse(lastCycles);

        List<AdminStatsResponse.NetworkGrowthPoint> networkGrowth = new ArrayList<>();
        for (Cycle c : lastCycles) {
            Instant cutoffExclusive = c.getPeriodEnd().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
            networkGrowth.add(new AdminStatsResponse.NetworkGrowthPoint(
                CYCLE_LABEL_FORMAT.format(c.getPeriodStart()),
                associateRepository.countByRoleAndJoinedBefore(AssociateRole.ASSOCIATE, cutoffExclusive)));
        }

        List<SaleResponse> recentSales = saleService.list(null, null, null, null, 0, 5).sales();

        AdminStatsResponse.CurrentCycleStats currentCycle = cycleRepository
            .findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .map(cycle -> currentCycleStats(cycle, lastCycles))
            .orElse(null);

        long activePlots = plotRepository.countByStatusNot(PlotStatus.SOLD);
        long totalSalesRecorded = saleRepository.countByStatus(SaleStatus.RECORDED);
        long cyclesCompleted = cycleRepository.countByStatusIn(List.of(CycleStatus.CLOSED, CycleStatus.PAID));

        return new AdminStatsResponse(
            totalAssociates, kycBreakdown, totalWalletBalance, pendingWithdrawals, currentCycle,
            activePlots, totalSalesRecorded, cyclesCompleted, networkGrowth, recentSales);
    }

    private AdminStatsResponse.CurrentCycleStats currentCycleStats(Cycle cycle, List<Cycle> lastCycles) {
        BigDecimal direct = ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.DIRECT);
        BigDecimal matching = ledgerEntryRepository.sumNetAmountByCycleAndType(cycle.getId(), IncomeType.MATCHING);
        BigDecimal total = ledgerEntryRepository.sumNetAmountByCycle(cycle.getId());

        long daysRemaining = Math.max(0, ChronoUnit.DAYS.between(LocalDate.now(), cycle.getPeriodEnd()));

        // :end is an EXCLUSIVE upper bound, same convention as AdminAssociateService.list /
        // AssociateRepository#searchDirectory: pass the day *after* periodEnd to include
        // associates who joined on periodEnd itself.
        Instant start = cycle.getPeriodStart().atStartOfDay(ZoneOffset.UTC).toInstant();
        Instant endExclusive = cycle.getPeriodEnd().plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant();
        long newAssociates = associateRepository.countByRoleAndJoinedBetween(AssociateRole.ASSOCIATE, start, endExclusive);

        long salesThisCycle = saleRepository.countByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED);
        BigDecimal revenueThisCycle = saleRepository.sumAmountByCycleIdAndStatus(cycle.getId(), SaleStatus.RECORDED);

        Optional<Cycle> latestClosedCycle = cycleRepository.findFirstByStatusOrderByPeriodStartDesc(CycleStatus.CLOSED);
        BigDecimal previousCycleTotalIncome = latestClosedCycle
            .map(closed -> ledgerEntryRepository.sumNetAmountByCycle(closed.getId()))
            .orElse(BigDecimal.ZERO);

        List<BigDecimal> incomeTrend = lastCycles.stream()
            .map(c -> ledgerEntryRepository.sumNetAmountByCycle(c.getId()))
            .toList();

        return new AdminStatsResponse.CurrentCycleStats(
            cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), daysRemaining,
            direct, matching, total, newAssociates, salesThisCycle, revenueThisCycle,
            previousCycleTotalIncome, incomeTrend
        );
    }
}
