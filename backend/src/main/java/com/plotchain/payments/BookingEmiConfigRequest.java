package com.plotchain.payments;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

// confirmThresholdPercent has no @NotNull here -- it's only required when confirmRule is
// AUTO_THRESHOLD, a cross-field rule BookingEmiConfigService validates (not expressible with a
// single-field Bean Validation annotation), same category as withdrawal's autoApproveLimit.
public record BookingEmiConfigRequest(
    boolean emiEnabled,
    @NotNull @Min(1) Integer defaultInstallmentCount,
    @NotBlank @Pattern(regexp = "AUTO_THRESHOLD|MANUAL|KYC_GATED") String confirmRule,
    Integer confirmThresholdPercent
) {}
