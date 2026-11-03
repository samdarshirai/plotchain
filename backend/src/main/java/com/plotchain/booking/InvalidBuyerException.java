package com.plotchain.booking;

// Plot buyer must be an existing ACTIVE associate holding an activation e-PIN. Mapped to 400 in BookingExceptionHandler.
public class InvalidBuyerException extends RuntimeException {
    public InvalidBuyerException(String message) {
        super(message);
    }
}
