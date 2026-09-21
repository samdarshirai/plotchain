package com.plotchain.dashboard;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record DashboardResponse(
    AssociateSummary associate,
    boolean kycPendingBannerVisible,
    CycleIncome cycleIncome,
    WalletSummary wallet,
    CycleCountdown cycleCountdown,
    SalesSummary salesSummary,
    NetworkSummary networkSummary,
    LegVolumeSummary legVolumeSummary
) {
    // sponsorAssociateId/sponsorName are both null when the associate has no sponsor (tree root)
    // -- the frontend renders a "Head Office" fallback in that case.
    public record AssociateSummary(
        String associateId, String name, String rank, String phone, Instant joinedAt, Instant rankChangedAt,
        String sponsorAssociateId, String sponsorName) {}
    public record CycleIncome(
        UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal sponsorMatchingIncome,
        BigDecimal selfPerformanceBonus, BigDecimal royaltyBonus, BigDecimal royaltyBonusPct, BigDecimal totalIncome,
        BigDecimal previousCycleTotalIncome, List<BigDecimal> incomeTrend,
        BigDecimal matchingIncomeLifetime, BigDecimal sponsorMatchingIncomeLifetime) {}
    public record WalletSummary(BigDecimal balance) {}
    // cycleNumber is 1-indexed (the first cycle ever is "Cycle 1"), per CycleRepository#countByPeriodStartLessThanEqual.
    public record CycleCountdown(UUID cycleId, long daysRemaining, int cycleNumber, LocalDate periodStart, LocalDate periodEnd) {}
    public record SalesSummary(int salesThisCycle, BigDecimal revenueBookedThisCycle, BigDecimal revenueBookedChangePct) {}
    public record NetworkSummary(long totalDownline, long directCount, long leftAssociateCount, long rightAssociateCount) {}
    // totalLeftBusiness/totalRightBusiness are lifetime (carry-corrected, see DashboardService),
    // totalSelfBusiness is lifetime own-sales, newBookedAreaSqft is this-cycle only.
    public record LegVolumeSummary(
        BigDecimal leftLegVolume, BigDecimal rightLegVolume,
        BigDecimal totalLeftBusiness, BigDecimal totalRightBusiness,
        BigDecimal totalSelfBusiness, BigDecimal newBookedAreaSqft) {}
}
