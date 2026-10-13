package com.plotchain.epin;

// Missing/expired/foreign e-Pin unlock token. Mapped to 403 code EPIN_LOCKED.
public class EPinLockedException extends RuntimeException {
    public EPinLockedException() {
        super("e-Pin register is locked; enter the transaction password");
    }
}
