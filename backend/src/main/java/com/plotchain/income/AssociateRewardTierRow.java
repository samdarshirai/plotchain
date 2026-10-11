package com.plotchain.income;

import java.math.BigDecimal;
import java.time.Instant;

// One rung of the reward ladder for the calling associate. status/achievedDate are null when the
// tier has no REWARD ledger row yet (not achieved).
public record AssociateRewardTierRow(
    int tierLevel,
    BigDecimal matchingBusiness,
    BigDecimal requiredLeftBusiness,
    BigDecimal requiredRightBusiness,
    BigDecimal reward,
    LedgerEntryStatus status,
    Instant achievedDate) {}
