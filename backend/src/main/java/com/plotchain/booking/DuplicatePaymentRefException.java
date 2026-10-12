package com.plotchain.booking;

import java.util.UUID;

public class DuplicatePaymentRefException extends RuntimeException {
    public DuplicatePaymentRefException(UUID bookingId, int installmentNumber) {
        super("Duplicate item in request: installment " + installmentNumber + " of booking " + bookingId);
    }
}
