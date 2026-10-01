package com.plotchain.booking;

import java.util.UUID;

public class BookingNotActiveException extends RuntimeException {
    public BookingNotActiveException(UUID bookingId) { super("Booking is not ACTIVE: " + bookingId); }
}
