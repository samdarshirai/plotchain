package com.plotchain.associate;

import java.util.UUID;

public class AssociateNotFoundException extends RuntimeException {
    public AssociateNotFoundException(UUID associateId) {
        super("Associate not found: " + associateId);
    }

    public AssociateNotFoundException(String userId) {
        super("Associate not found: " + userId);
    }
}
