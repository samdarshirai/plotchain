package com.plotchain.associate;

import java.util.UUID;

public class AssociateNotActiveException extends RuntimeException {
    public AssociateNotActiveException(UUID associateId) {
        super("Associate is not active: " + associateId);
    }
}
