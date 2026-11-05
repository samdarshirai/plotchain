package com.plotchain.compensation;

import java.math.BigDecimal;
import java.util.UUID;

public record RewardTierDto(int tierLevel, BigDecimal volumeThreshold, BigDecimal cashReward, String perkDescription,
                            String designation, UUID perkExpenseTypeId, BigDecimal perkValue) {
    public RewardTierDto(int tierLevel, BigDecimal volumeThreshold, BigDecimal cashReward, String perkDescription, String designation) {
        this(tierLevel, volumeThreshold, cashReward, perkDescription, designation, null, null);
    }

    public RewardTierDto(int tierLevel, BigDecimal volumeThreshold, BigDecimal cashReward, String perkDescription) {
        this(tierLevel, volumeThreshold, cashReward, perkDescription, null, null, null);
    }
}
