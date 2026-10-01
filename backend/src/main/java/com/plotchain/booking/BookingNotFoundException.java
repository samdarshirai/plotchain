package com.plotchain.booking;

import java.util.UUID;

public class BookingNotFoundException extends RuntimeException {
    public BookingNotFoundException(UUID bookingId) { super("Booking not found: " + bookingId); }
}
