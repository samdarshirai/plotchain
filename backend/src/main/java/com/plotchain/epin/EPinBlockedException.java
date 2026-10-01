package com.plotchain.epin;

import java.util.UUID;

public class EPinBlockedException extends RuntimeException {
    public EPinBlockedException(UUID epinId) {
        super("E-PIN is blocked: " + epinId);
    }
}
