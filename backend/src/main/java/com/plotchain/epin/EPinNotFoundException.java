package com.plotchain.epin;

import java.util.UUID;

public class EPinNotFoundException extends RuntimeException {
    public EPinNotFoundException(UUID epinId) {
        super("E-PIN not found: " + epinId);
    }
}
