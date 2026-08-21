package com.plotchain.stats;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record AdminStatsResponse(
    long totalAssociates,
    KycBreakdown kycBreakdown,
    BigDecimal totalWalletBalance,
    long pendingWithdrawals,
    CurrentCycleStats currentCycle,
    long activePlots,
    long totalSalesRecorded,
    long cyclesCompleted
) {
    public record KycBreakdown(long pending, long verified, long rejected) {}

    public record CurrentCycleStats(
        UUID cycleId,
        LocalDate periodStart,
        LocalDate periodEnd,
        long daysRemaining,
        BigDecimal directIncome,
        BigDecimal matchingIncome,
        BigDecimal totalIncome,
        long newAssociatesThisCycle,
        long salesThisCycle,
        BigDecimal revenueThisCycle
    ) {}
}
