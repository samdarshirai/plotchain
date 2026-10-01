package com.plotchain.associate;

import java.util.UUID;

public class AssociateNotPendingException extends RuntimeException {
    public AssociateNotPendingException(UUID associateId) {
        super("Associate is not pending activation: " + associateId);
    }
}
