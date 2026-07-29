package com.plotchain.dashboard;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

public record DashboardResponse(
    boolean kycPendingBannerVisible,
    CycleIncome cycleIncome,
    WalletSummary wallet,
    LegVolumeSummary legVolume,
    RankProgress rankProgress,
    TeamSnapshot teamSnapshot,
    CycleCountdown cycleCountdown,
    List<AnnouncementSummary> announcements
) {
    public record CycleIncome(UUID cycleId, BigDecimal directIncome, BigDecimal matchingIncome, BigDecimal totalIncome) {}
    public record WalletSummary(BigDecimal balance) {}
    public record LegVolumeSummary(BigDecimal leftVolume, BigDecimal rightVolume, BigDecimal carriedForwardLeft, BigDecimal carriedForwardRight, BigDecimal projectedMatchAmount) {}
    public record RankProgress(String currentRank, int currentRankOrder, String nextRank, int progressPercent, BigDecimal volumeToNextRank) {}
    public record TeamSnapshot(long totalDownline, long activeToday, long newJoinsThisCycle) {}
    public record CycleCountdown(UUID cycleId, long daysRemaining) {}
    public record AnnouncementSummary(UUID id, String title, Instant publishedAt) {}
}
