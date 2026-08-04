package com.plotchain.cycle;

import java.util.UUID;

public class CycleAlreadyClosedException extends RuntimeException {
    public CycleAlreadyClosedException(UUID id) {
        super("Cycle is not open, cannot close: " + id);
    }
}
