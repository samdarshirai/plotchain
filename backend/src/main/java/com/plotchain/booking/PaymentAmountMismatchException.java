package com.plotchain.booking;

import java.math.BigDecimal;
import java.util.UUID;

public class PaymentAmountMismatchException extends RuntimeException {
    public PaymentAmountMismatchException(UUID bookingId, int installmentNumber, BigDecimal expected) {
        super("Payment amount must equal the installment amount " + expected.toPlainString()
            + " (installment " + installmentNumber + " of booking " + bookingId + ")");
    }
}
