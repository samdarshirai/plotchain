package com.plotchain.compensation;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record RoyaltyBonusRateInput(
    @NotNull @DecimalMin("0.01") BigDecimal volumeThreshold,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal royaltyPct
) {}
