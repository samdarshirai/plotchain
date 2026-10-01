package com.plotchain.withdrawal;

import java.util.UUID;

public class AssociatePendingActivationException extends RuntimeException {
    public AssociatePendingActivationException(UUID associateId) {
        super("Cannot submit a withdrawal for an associate pending activation: " + associateId);
    }
}
