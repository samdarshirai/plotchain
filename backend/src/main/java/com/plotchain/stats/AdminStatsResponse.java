package com.plotchain.stats;

import com.plotchain.sales.SaleResponse;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record AdminStatsResponse(
    long totalAssociates,
    KycBreakdown kycBreakdown,
    BigDecimal totalWalletBalance,
    long pendingWithdrawals,
    CurrentCycleStats currentCycle,
    long activePlots,
    long totalSalesRecorded,
    long cyclesCompleted,
    List<NetworkGrowthPoint> networkGrowth,
    List<SaleResponse> recentSales
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
        BigDecimal revenueThisCycle,
        BigDecimal previousCycleTotalIncome,
        List<BigDecimal> incomeTrend
    ) {}

    // Admin Dashboard rebuild's Network Growth chart (2026-08-23-admin-dashboard-mockup-design.md
    // §3.1): org-wide associate-count-over-time, the admin sibling of DashboardResponse's own
    // NetworkGrowthPoint (which is scoped to one caller's downline). cycleLabel uses the same
    // month-of-periodStart format DashboardService.CYCLE_LABEL_FORMAT already established.
    public record NetworkGrowthPoint(String cycleLabel, long associateCount) {}
}
