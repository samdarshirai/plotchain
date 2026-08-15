package com.plotchain.cycle;

import java.util.UUID;

// Wallet/withdrawal unit 1 (docs/superpowers/specs/role-capability/2026-08-04-wallet-withdrawal-domain-design.md,
// Decision 2): one exception type, two distinct messages -- "already credited" (cycle.status ==
// PAID) vs. "settlement not closed yet" (cycle.status is OPEN or CALCULATING). Both map to HTTP
// 409 via CycleExceptionHandler. Lives in the cycle package (not wallet) because it's fundamentally
// about Cycle's own payout-state machine, the same reasoning CycleNotFoundException/
// CycleAlreadyClosedException already establish for this package, even though it's thrown from
// wallet package code (WalletCreditingService).
public class CyclePayoutStateException extends RuntimeException {

    private CyclePayoutStateException(String message) {
        super(message);
    }

    public static CyclePayoutStateException alreadyCredited(UUID cycleId) {
        return new CyclePayoutStateException("Cycle already credited: " + cycleId);
    }

    public static CyclePayoutStateException settlementNotClosed(UUID cycleId) {
        return new CyclePayoutStateException("Cycle settlement not closed yet: " + cycleId);
    }
}
