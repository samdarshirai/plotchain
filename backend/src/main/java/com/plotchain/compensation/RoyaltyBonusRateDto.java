package com.plotchain.compensation;

import java.math.BigDecimal;

public record RoyaltyBonusRateDto(BigDecimal volumeThreshold, BigDecimal royaltyPct) {}
