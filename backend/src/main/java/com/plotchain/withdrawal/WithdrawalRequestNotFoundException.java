package com.plotchain.withdrawal;

import java.util.UUID;

// Wallet/withdrawal unit 7 (Data model "New Java types"/Exceptions, Flow "Decide" step 1):
// unknown {id} on the decision endpoint (and, per the spec's Error handling table, the future
// disburse endpoint too -- unit 8 reuses this type unmodified).
public class WithdrawalRequestNotFoundException extends RuntimeException {
    public WithdrawalRequestNotFoundException(UUID id) {
        super("Withdrawal request not found: " + id);
    }
}
