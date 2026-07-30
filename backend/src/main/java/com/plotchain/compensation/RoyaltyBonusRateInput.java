package com.plotchain.compensation;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.UUID;

public record RoyaltyBonusRateInput(
    @NotNull UUID rankId,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal royaltyPct
) {}
