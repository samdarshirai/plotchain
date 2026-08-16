package com.plotchain.compensation;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record CompensationPlanRequest(
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal directIncomePct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal matchingIncomePct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal sponsorMatchingPct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal tdsPct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal adminChargeWithPanPct,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal adminChargeWithoutPanPct,
    @NotNull @DecimalMin("0") BigDecimal activationFee,
    @NotNull @DecimalMin("0") BigDecimal minWithdrawal,
    @NotBlank @Pattern(regexp = "SEMI_MONTHLY|MONTHLY|CUSTOM") String settlementCycle,
    @Valid List<RoyaltyBonusRateInput> royaltyBonusRates,
    @Valid List<RewardTierInput> rewardTiers,
    LocalDate effectiveFrom,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal selfPerformanceTier1Pct,
    @NotNull @DecimalMin("0.01") BigDecimal selfPerformanceTier1SqftThreshold,
    @NotNull @DecimalMin("0") @DecimalMax("100") BigDecimal selfPerformanceTier2Pct,
    @NotNull @DecimalMin("0.01") BigDecimal selfPerformanceTier2SqftThreshold
) {}
