package com.plotchain.compensation;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record CompensationPlanResponse(
    String versionLabel,
    LocalDate effectiveFrom,
    BigDecimal directIncomePct,
    BigDecimal matchingIncomePct,
    BigDecimal sponsorMatchingPct,
    BigDecimal tdsPct,
    BigDecimal adminChargeWithPanPct,
    BigDecimal adminChargeWithoutPanPct,
    BigDecimal activationFee,
    BigDecimal minWithdrawal,
    String settlementCycle,
    List<RoyaltyBonusRateDto> royaltyBonusRates,
    List<RewardTierDto> rewardTiers,
    List<RankOptionDto> availableRanks,
    Instant createdAt
) {}
