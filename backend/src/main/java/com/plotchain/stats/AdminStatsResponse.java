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
    List<SaleResponse> recentSales,
    // Admin Dashboard redesign 1a (docs/superpowers/specs/2026-09-08-admin-dashboard-redesign-1a-design.md):
    // the "NEEDS A DECISION" queue's Withdrawals row needs the rupee total and the age of the
    // oldest still-REQUESTED request on top of the count already carried by pendingWithdrawals
    // (the KYC row rides kycBreakdown.pending). oldestPendingWithdrawalAgeDays is null when the
    // queue is empty.
    BigDecimal pendingWithdrawalsValue,
    Long oldestPendingWithdrawalAgeDays,
    // Inventory card: plotsSold + plotsTotal drive the sold/unsold grid; activePlots above already
    // carries the unsold count (countByStatusNot(SOLD)).
    long plotsSold,
    long plotsTotal,
    NetworkHealth networkHealth
) {
    public record KycBreakdown(long pending, long verified, long rejected) {}

    // Admin Dashboard redesign 1a's Network Health card. activeThisCycle = distinct associates
    // with a ledger entry in the open cycle; joinedThisCycle mirrors currentCycle.newAssociatesThisCycle
    // but stays populated (as 0) when no cycle is open; deepestLeg = the longest root-to-leaf chain
    // in the whole placement tree. The mockup's 3-way selling/recruiting/dormant split is not a
    // tracked concept here, so the card's bar is a 2-way active/inactive split derived from
    // activeThisCycle vs totalAssociates on the frontend.
    public record NetworkHealth(long activeThisCycle, long joinedThisCycle, long deepestLeg) {}

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
