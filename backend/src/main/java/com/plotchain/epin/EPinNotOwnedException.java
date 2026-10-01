package com.plotchain.epin;

import java.util.UUID;

// Thrown for "missing" and "not held by the caller" alike, so an associate cannot probe which
// pin ids exist. Mapped to 404, not 403.
public class EPinNotOwnedException extends RuntimeException {
    public EPinNotOwnedException(UUID epinId) {
        super("E-PIN not found: " + epinId);
    }
}
