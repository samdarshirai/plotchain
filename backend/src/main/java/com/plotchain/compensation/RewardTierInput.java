package com.plotchain.compensation;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record RewardTierInput(
    @NotNull @Min(1) Integer tierLevel,
    @NotNull @DecimalMin("0.01") BigDecimal volumeThreshold,
    @NotNull @DecimalMin("0") BigDecimal cashReward,
    String perkDescription
) {}
