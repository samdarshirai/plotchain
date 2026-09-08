package com.plotchain.withdrawal;

import java.math.BigDecimal;
import java.util.UUID;

// "Submit Withdrawal" modal's associate picker (payout-approval screen): one row per
// withdraw-eligible associate, maxAmount is their current wallet balance.
public record EligibleWithdrawalAssociateResponse(
    UUID associateId,
    String associateUserId,
    String associateName,
    BigDecimal maxAmount) {
}
