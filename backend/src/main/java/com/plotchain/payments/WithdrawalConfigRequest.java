package com.plotchain.payments;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

// autoApproveLimit has no @NotNull here -- it's only required when approvalMode is
// AUTO_UNDER_LIMIT, a cross-field rule WithdrawalConfigService validates (not expressible with
// a single-field Bean Validation annotation), same category as compensation's reward-tier
// contiguity check.
public record WithdrawalConfigRequest(
    @NotBlank @Pattern(regexp = "AUTO_UNDER_LIMIT|ALWAYS_MANUAL") String approvalMode,
    BigDecimal autoApproveLimit
) {}
