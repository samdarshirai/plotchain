package com.plotchain.payments;

import java.math.BigDecimal;
import java.time.Instant;

public record WithdrawalConfigResponse(
    String approvalMode,
    BigDecimal autoApproveLimit,
    BigDecimal minimumWithdrawalAmount,
    Instant updatedAt
) {}
