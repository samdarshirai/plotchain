package com.plotchain.cycle;

import java.util.UUID;

public class NoOpenCycleException extends RuntimeException {
    public NoOpenCycleException(UUID tenantId) {
        super("No open cycle for tenant: " + tenantId);
    }
}
