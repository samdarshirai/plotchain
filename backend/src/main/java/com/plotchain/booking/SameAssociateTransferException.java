package com.plotchain.booking;

import java.util.UUID;

public class SameAssociateTransferException extends RuntimeException {
    public SameAssociateTransferException(UUID associateId) {
        super("Booking is already assigned to associate " + associateId);
    }
}
