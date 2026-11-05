package com.plotchain.compensation;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.Digits;
import java.math.BigDecimal;
import java.util.UUID;

public record RewardTierInput(
    @NotNull @Min(1) Integer tierLevel,
    @NotNull @DecimalMin("0.01") BigDecimal volumeThreshold,
    @NotNull @DecimalMin("0") BigDecimal cashReward,
    String perkDescription,
    @Size(max = 100) String designation,
    UUID perkExpenseTypeId,
    @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal perkValue
) {
    public RewardTierInput(Integer tierLevel, BigDecimal volumeThreshold, BigDecimal cashReward, String perkDescription) {
        this(tierLevel, volumeThreshold, cashReward, perkDescription, null, null, null);
    }
    public RewardTierInput(Integer tierLevel, BigDecimal volumeThreshold, BigDecimal cashReward, String perkDescription, String designation) {
        this(tierLevel, volumeThreshold, cashReward, perkDescription, designation, null, null);
    }
}
