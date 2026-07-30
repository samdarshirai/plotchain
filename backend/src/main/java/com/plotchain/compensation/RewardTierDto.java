package com.plotchain.compensation;

import java.math.BigDecimal;

public record RewardTierDto(int tierLevel, BigDecimal volumeThreshold, BigDecimal cashReward, String perkDescription) {}
