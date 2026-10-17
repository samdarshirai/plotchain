package com.plotchain.booking;

import java.math.BigDecimal;

// First installment must fit in the balance left after the booking amount. Mapped to 400 in BookingExceptionHandler.
public class InvalidFirstInstallmentException extends RuntimeException {
    public InvalidFirstInstallmentException(BigDecimal amount, BigDecimal balance) {
        super("First installment " + amount.toPlainString() + " is invalid for the remaining balance " + balance.toPlainString());
    }
}
