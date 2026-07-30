package com.plotchain.compensation;

import java.math.BigDecimal;
import java.util.UUID;

public record RoyaltyBonusRateDto(UUID rankId, String rankName, BigDecimal royaltyPct) {}
