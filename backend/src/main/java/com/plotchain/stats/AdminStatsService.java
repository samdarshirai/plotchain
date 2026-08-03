package com.plotchain.stats;

import com.plotchain.associate.AssociateRepository;
import com.plotchain.associate.AssociateRole;
import com.plotchain.associate.KycStatus;
import com.plotchain.cycle.Cycle;
import com.plotchain.cycle.CycleRepository;
import com.plotchain.cycle.CycleStatus;
import com.plotchain.income.IncomeType;
import com.plotchain.income.LedgerEntryRepository;
import com.plotchain.wallet.WalletRepository;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;

@Service
public class AdminStatsService {

    private final AssociateRepository associateRepository;
    private final WalletRepository walletRepository;
    private final LedgerEntryRepository ledgerEntryRepository;
    private final CycleRepository cycleRepository;

    public AdminStatsService(
        AssociateRepository associateRepository,
        WalletRepository walletRepository,
        LedgerEntryRepository ledgerEntryRepository,
        CycleRepository cycleRepository
    ) {
        this.associateRepository = associateRepository;
        this.walletRepository = walletRepository;
        this.ledgerEntryRepository = ledgerEntryRepository;
        this.cycleRepository = cycleRepository;
    }

    // Unlike DashboardService.getDashboard, this does NOT throw/409 when there's no OPEN cycle:
    // an admin still wants total associates / wallet balance regardless of cycle state, so
    // currentCycle simply comes back null and the rest of the stats still populate.
    public AdminStatsResponse getStats() {
        long totalAssociates = associateRepository.countByRole(AssociateRole.ASSOCIATE);

        AdminStatsResponse.KycBreakdown kycBreakdown = new AdminStatsResponse.KycBreakdown(
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.PENDING),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.VERIFIED),
            associateRepository.countByRoleAndKycStatus(AssociateRole.ASSOCIATE, KycStatus.REJECTED)
        );

        BigDecimal totalWalletBalance = walletRepository.sumAllBalances();

        AdminStatsResponse.CurrentCycleStats currentCycle = cycleRepository
            .findFirstByStatusOrderByPeriodStartDesc(CycleStatus.OPEN)
            .map(this::currentCycleStats)
            .orElse(null);

        return new AdminStatsResponse(totalAssociates, kycBreakdown, totalWalletBalance, currentCycle);
    }

    private AdminStatsResponse.CurrentCycleStats currentCycleStats(Cycle cycle) {
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

        return new AdminStatsResponse.CurrentCycleStats(
            cycle.getId(), cycle.getPeriodStart(), cycle.getPeriodEnd(), daysRemaining,
            direct, matching, total, newAssociates
        );
    }
}
