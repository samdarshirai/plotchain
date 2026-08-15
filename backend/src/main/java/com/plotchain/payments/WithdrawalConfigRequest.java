package com.plotchain.payments;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

import java.math.BigDecimal;

// autoApproveLimit has no @NotNull here -- it's only required when approvalMode is
// AUTO_UNDER_LIMIT, a cross-field rule WithdrawalConfigService validates (not expressible with
// a single-field Bean Validation annotation), same category as compensation's reward-tier
// contiguity check. minimumWithdrawalAmount is likewise unannotated and nullable -- per the
// wallet-withdrawal spec's Data model section, it round-trips with no default-substitution;
// null means "not yet set" (WithdrawalConfigService.isComplete() is false), a stored 0 is a
// deliberate "no minimum" policy, distinct from never having been set.
public record WithdrawalConfigRequest(
    @NotBlank @Pattern(regexp = "AUTO_UNDER_LIMIT|ALWAYS_MANUAL") String approvalMode,
    BigDecimal autoApproveLimit,
    BigDecimal minimumWithdrawalAmount
) {}
