package com.plotchain.dashboard;

import java.math.BigDecimal;
import java.time.Instant;
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
    List<NetworkGrowthPoint> networkGrowth,
    KycBreakdown kycBreakdown,
    LegVolumeSummary legVolumeSummary
) {
    public record AssociateSummary(String associateId, String name, String rank, String phone, Instant joinedAt, Instant rankChangedAt) {}
    public record CycleIncome(
        UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal sponsorMatchingIncome,
        BigDecimal selfPerformanceBonus, BigDecimal royaltyBonus, BigDecimal royaltyBonusPct, BigDecimal totalIncome,
        BigDecimal previousCycleTotalIncome, List<BigDecimal> incomeTrend) {}
    public record WalletSummary(BigDecimal balance) {}
    public record CycleCountdown(UUID cycleId, long daysRemaining) {}
    public record SalesSummary(int salesThisCycle, BigDecimal revenueBookedThisCycle, BigDecimal revenueBookedChangePct) {}
    public record NetworkSummary(long totalDownline, long directCount) {}
    public record NetworkGrowthPoint(String cycleLabel, long downlineCount) {}
    public record KycBreakdown(long verified, long pending, long rejected) {}
    public record LegVolumeSummary(BigDecimal leftLegVolume, BigDecimal rightLegVolume) {}
}
