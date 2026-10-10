package com.plotchain.associate;

import java.time.Instant;

// Too many wrong attempts -> 423 until lockedUntil.
public class TransactionPasswordLockedException extends RuntimeException {
    private final Instant lockedUntil;

    public TransactionPasswordLockedException(Instant lockedUntil) {
        super("Transaction password is locked until " + lockedUntil);
        this.lockedUntil = lockedUntil;
    }

    public Instant getLockedUntil() { return lockedUntil; }
}
