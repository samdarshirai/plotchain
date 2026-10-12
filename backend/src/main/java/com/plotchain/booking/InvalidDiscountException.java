package com.plotchain.booking;

import java.math.BigDecimal;

// Discount must be 0 or more and strictly below the plot list price. Mapped to 400 in BookingExceptionHandler.
public class InvalidDiscountException extends RuntimeException {
    public InvalidDiscountException(BigDecimal discount, BigDecimal price) {
        super("Discount " + discount.toPlainString() + " must be 0 or more and below the plot price " + price.toPlainString());
    }
}
