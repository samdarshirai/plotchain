package com.plotchain.income;

import java.math.BigDecimal;
import java.time.Instant;

// One rung of the reward ladder for the calling associate. status/achievedDate are null when the
// tier has no REWARD ledger row yet (not achieved). requiredLeft/RightBusiness are the volume still
// missing on each leg (0 once the leg has reached the threshold).
public record AssociateRewardTierRow(
    int tierLevel,
    BigDecimal matchingBusiness,
    String designation,
    BigDecimal requiredLeftBusiness,
    BigDecimal requiredRightBusiness,
    BigDecimal reward,
    String perkDescription,
    LedgerEntryStatus status,
    Instant achievedDate) {}
