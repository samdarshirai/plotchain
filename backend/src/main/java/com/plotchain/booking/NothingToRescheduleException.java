package com.plotchain.booking;

import java.util.UUID;

public class NothingToRescheduleException extends RuntimeException {
    public NothingToRescheduleException(UUID bookingId) {
        super("Booking has no remaining balance to reschedule: " + bookingId);
    }
}
