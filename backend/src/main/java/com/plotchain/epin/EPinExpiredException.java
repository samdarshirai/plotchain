package com.plotchain.epin;

import java.util.UUID;

public class EPinExpiredException extends RuntimeException {
    public EPinExpiredException(UUID epinId) {
        super("E-PIN has expired: " + epinId);
    }
}
