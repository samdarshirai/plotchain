package com.plotchain.cycle;

import java.util.UUID;

public class CycleNotFoundException extends RuntimeException {
    public CycleNotFoundException(UUID id) {
        super("Cycle not found: " + id);
    }
}
