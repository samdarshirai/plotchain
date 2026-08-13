package com.plotchain.compensation;

import java.math.BigDecimal;
import java.util.List;

// role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Compensation rules" row -- Associate sees "View own rank progress / reward tiers
// (read-only)"). Field names for the rank-progress portion deliberately match
// DashboardResponse.RankProgress's shape (currentRank/currentRankOrder/nextRank/
// progressPercent/volumeToNextRank) -- same underlying current/next-rank walk and
// progress-percent formula as DashboardService.getDashboard(...), independently computed here
// rather than extracted into a shared helper (see CompensationPlanService#getMyRankProgress's
// own comment for why).
public record AssociateRankProgressResponse(
    String currentRank,
    int currentRankOrder,
    String nextRank,
    int progressPercent,
    BigDecimal cumulativeMatchedVolume,
    BigDecimal volumeToNextRank,
    List<AssociateRewardTierDto> rewardTiers
) {}
