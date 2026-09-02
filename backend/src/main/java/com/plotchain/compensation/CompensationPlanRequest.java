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
    @NotBlank @Pattern(regexp = "SEMI_MONTHLY|MONTHLY|HALF_YEARLY|YEARLY|CUSTOM") String settlementCycle,
    @Valid List<RoyaltyBonusRateInput> royaltyBonusRates,
    @Valid List<RewardTierInput> rewardTiers,
    LocalDate effectiveFrom,
    // Not @NotNull: the existing Angular admin UI doesn't send these 4 fields yet (out of scope
    // for this backend-only branch), so every existing compensation-plan edit would 400 if these
    // were required. Bean Validation only enforces @DecimalMin/@DecimalMax on a non-null value,
    // so a present-but-out-of-range value is still rejected; a null falls through to
    // CompensationPlanService.updatePlan's orDefault(...), matching V25's migration-time column
    // defaults.
    @DecimalMin("0") @DecimalMax("100") BigDecimal selfPerformanceTier1Pct,
    @DecimalMin("0.01") BigDecimal selfPerformanceTier1SqftThreshold,
    @DecimalMin("0") @DecimalMax("100") BigDecimal selfPerformanceTier2Pct,
    @DecimalMin("0.01") BigDecimal selfPerformanceTier2SqftThreshold
) {}
