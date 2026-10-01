package com.plotchain.booking;

import com.plotchain.associate.AssociateStatus;

import java.util.UUID;

// Transfer target exists but is not ACTIVE (PENDING, SUSPENDED, ...). Deliberately NOT
// associate.AssociateNotActiveException: that type is already mapped to 409 by EPinExceptionHandler,
// while the spec (Resolved decision #4) requires 400 here. Mapped in BookingExceptionHandler.
public class InvalidTransferTargetException extends RuntimeException {
    public InvalidTransferTargetException(UUID associateId, AssociateStatus status) {
        super("Cannot transfer booking to associate " + associateId + ": associate is " + status
            + ", must be ACTIVE");
    }
}
