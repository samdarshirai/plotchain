package com.plotchain.withdrawal;

import java.math.BigDecimal;

// Wallet/withdrawal unit 5 (Decision 6, Flow step 5): amount < withdrawalConfig.minimumWithdrawalAmount.
public class BelowMinimumWithdrawalException extends RuntimeException {
    public BelowMinimumWithdrawalException(BigDecimal amount, BigDecimal minimum) {
        super("Withdrawal amount " + amount + " is below the minimum withdrawal amount " + minimum);
    }
}
