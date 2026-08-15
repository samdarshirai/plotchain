package com.plotchain.withdrawal;

import java.util.UUID;

// Wallet/withdrawal unit 5 (Decision 5, Decision 10, Flow step 6): WalletRepository.debitIfSufficient
// returned 0 affected rows -- covers both "balance too low" and "no Wallet row exists at all"
// identically, per debitIfSufficient's own contract.
public class InsufficientWalletBalanceException extends RuntimeException {
    public InsufficientWalletBalanceException(UUID associateId) {
        super("Insufficient wallet balance for associate: " + associateId);
    }
}
