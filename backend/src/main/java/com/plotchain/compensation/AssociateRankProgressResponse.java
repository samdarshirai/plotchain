package com.plotchain.compensation;

import java.math.BigDecimal;
import java.util.List;

// role-capability unit 9 (docs/superpowers/specs/role-capability/2026-08-03-role-capability-data-visibility-design.md,
// "Compensation rules" row -- Associate sees "View own rank progress / reward tiers
// (read-only)"). Progress is toward the next reward tier's designation; `designation` is the
// associate's current one (null = none achieved yet, frontend shows the base label).
public record AssociateRankProgressResponse(
    String designation,
    String nextDesignation,
    int progressPercent,
    BigDecimal cumulativeMatchedVolume,
    BigDecimal volumeToNext,
    List<AssociateRewardTierDto> rewardTiers
) {}
