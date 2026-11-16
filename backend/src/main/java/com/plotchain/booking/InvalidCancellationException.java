package com.plotchain.booking;

// Cancellation charge/refund request is not usable (e.g. refund due but no pay mode). Mapped to 400 in BookingExceptionHandler.
public class InvalidCancellationException extends RuntimeException {
    public InvalidCancellationException(String message) {
        super(message);
    }
}
